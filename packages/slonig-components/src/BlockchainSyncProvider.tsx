import { deleteReimbursement, getAllReimbursements, getReimbursementsByReferee, Reimbursement } from '@slonigiraf/db';
import React, { useEffect, useState, useRef, useCallback, ReactNode, createContext, useContext } from 'react';
import { useApi } from '@polkadot/react-hooks';
import { useLoginContext } from './LoginContext.js';
import BN from 'bn.js';
import { EXISTENTIAL_BATCH_SENDER_BALANCE, getAddressFromPublickeyHex } from './index.js';
import { EXISTENTIAL_REFEREE_BALANCE, REIMBURSEMENT_BATCH_SIZE } from '@slonigiraf/app-slonig-components';
import { BN_ZERO } from '@polkadot/util';
import type { AccountInfo } from '@polkadot/types/interfaces';

interface BlockchainSyncContextType {
    reimburse: (reimbursements: Reimbursement[]) => Promise<void>;
}

const defaultContext: BlockchainSyncContextType = {
    reimburse: async (_: Reimbursement[]) => { },
};

const BlockchainSyncContext = createContext<BlockchainSyncContextType>(defaultContext);

interface BlockchainSyncProviderProps {
    children: ReactNode;
}

export const BlockchainSyncProvider: React.FC<BlockchainSyncProviderProps> = ({ children }) => {
    const { api, isApiReady } = useApi();
    const { currentPair, isLoggedIn } = useLoginContext();
    const [referees, setReferees] = useState<string[]>([]);
    const refereesWithEnoughBalance = useRef<Map<string, BN>>(new Map());
    const [canSubmitTransactions, setCanSubmitTransactions] = useState<boolean>(true);
    const myBalance = useRef<BN | null>(null);
    const subscribedReferees = useRef(new Set());

    const isInitialized = useCallback(() => {
        if (currentPair && api && isApiReady && isLoggedIn && referees && referees.length > 0) {
            return true;
        }
        return false;
    }, [currentPair, api, isApiReady, isLoggedIn, referees]);

    useEffect(() => {
        if (isInitialized()) {
            api.query.system.account(currentPair?.address, (accountInfo: AccountInfo) => {
                myBalance.current = accountInfo.data.free;
            });
        }
    }, [api, isInitialized]);

    useEffect(() => {
        const run = async () => {
            const reimbursements = await getAllReimbursements();
            const referees = reimbursements.map((r: Reimbursement) => r.referee);
            setReferees([...new Set([...referees])]);
        }
        run();
    }, []);

    // Subscribe to referees' balances change
    useEffect(() => {
        if (isInitialized()) {
            referees.forEach(referee => {
                if(!subscribedReferees.current.has(referee)){
                    subscribedReferees.current.add(referee);
                    const refereeAddress = getAddressFromPublickeyHex(referee);
                    api.query.system.account(refereeAddress, (accountInfo: AccountInfo) => {
                        if (accountInfo.data.free.gt(EXISTENTIAL_REFEREE_BALANCE)) {
                            refereesWithEnoughBalance.current.set(referee, accountInfo.data.free);
                            if (canSubmitTransactions &&
                                myBalance.current && myBalance.current.gt(EXISTENTIAL_BATCH_SENDER_BALANCE)) {
                                setCanSubmitTransactions(false);
                                selectAndSendTransactions();
                            }
                        } else {
                            refereesWithEnoughBalance.current.delete(referee);
                        }
                    });
                }
            });
        }
    }, [api, referees, isInitialized]);

    const sendTransactions = useCallback((reimbursements: Reimbursement[]) => {
        const run = async (reimbursements: Reimbursement[]) => {
            if (currentPair && isInitialized()) {
                let signedTransactionsPromises = reimbursements.map(async reimbursement => {
                    return api.tx.letters.reimburse(
                        reimbursement.letterNumber,
                        new BN(reimbursement.block),
                        new BN(reimbursement.blockAllowed),
                        reimbursement.referee,
                        reimbursement.worker,
                        reimbursement.employer,
                        new BN(reimbursement.amount),
                        reimbursement.signOverReceipt,
                        reimbursement.workerSign
                    );
                });

                const txs = (await Promise.all(signedTransactionsPromises)).filter(tx => tx !== undefined);

                if (txs && txs.length > 0) {
                    const unsub = await api.tx.utility
                        .forceBatch(txs)
                        .signAndSend(currentPair, ({ events = [], status }) => {
                            if (status.isInBlock) {
                                events.forEach(({ event: { data, method, section } }) => {
                                    if (section === 'letters' && method === 'ReimbursementHappened') {
                                        const [referee, letterNumber] = data.toJSON() as [string, number];
                                        deleteReimbursement(referee, letterNumber);
                                    }
                                });
                                unsub();
                            }
                        });
                }
            }
        };
        if (isInitialized()) {
            run(reimbursements);
        }
    }, [currentPair, api, isInitialized]);

    const selectAndSendTransactions = useCallback(() => {
        const run = async () => {
            let selectedReimbursements: Reimbursement[] = [];
            for (const [referee, balance] of refereesWithEnoughBalance.current) {
                if (selectedReimbursements.length >= REIMBURSEMENT_BATCH_SIZE) {
                    break;
                }
                if (balance.gt(EXISTENTIAL_REFEREE_BALANCE)) {
                    let penaltyAmount = BN_ZERO;
                    const reimbursementsCollection = await getReimbursementsByReferee(referee);
                    const reimbursements = await reimbursementsCollection.toArray();
                    const fromMinToMaxReimbursement = reimbursements.sort((a, b) => {
                        const amountA = new BN(a.amount);
                        const amountB = new BN(b.amount);
                        return amountA.cmp(amountB); // -1 if a < b, 0 if a === b, 1 if a > b
                    })
                    const refereeAvailableBalance = balance.sub(EXISTENTIAL_REFEREE_BALANCE);
                    for (const reimbursement of fromMinToMaxReimbursement) {
                        const reimbursementAmount = new BN(reimbursement.amount);
                        const penaltyWithThisReimbursement = penaltyAmount.add(reimbursementAmount);
                        const refereeHasEnoughBalance = refereeAvailableBalance.gte(penaltyWithThisReimbursement);

                        if (refereeHasEnoughBalance && selectedReimbursements.length < REIMBURSEMENT_BATCH_SIZE) {
                            selectedReimbursements.push(reimbursement);
                            penaltyAmount = penaltyAmount.add(reimbursementAmount);
                        } else {
                            break;
                        }
                    }
                }
            }
            if (selectedReimbursements.length > 0) {
                sendTransactions(selectedReimbursements);
            }
        }
        run();
    }, [sendTransactions]);

    const reimburse = async (reimbursements: Reimbursement[]) => {
        const newReferees = reimbursements.map((r: Reimbursement) => r.referee);
        setReferees([...new Set([...referees, ...newReferees])]);
    };

    return (
        <BlockchainSyncContext.Provider value={{ reimburse }}>
            {children}
        </BlockchainSyncContext.Provider>
    );
};

export const useBlockchainSync = () => useContext(BlockchainSyncContext);