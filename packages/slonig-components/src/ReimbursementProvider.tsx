import { getAllReimbursements, getReimbursementsByReferee, Reimbursement } from '@slonigiraf/db';
import React, { useEffect, useState, useRef, useCallback, ReactNode, createContext, useContext } from 'react';
import { useApi } from '@polkadot/react-hooks';
import { useLoginContext } from './LoginContext.js';
import BN from 'bn.js';
import { getAddressFromPublickeyHex } from './index.js';
import { EXISTENTIAL_REFEREE_BALANCE, REIMBURSEMENT_BATCH_SIZE } from '@slonigiraf/app-slonig-components';
import { BN_ZERO } from '@polkadot/util';

interface ReimbursementContextType {
    reimburse: (reimbursements: Reimbursement[]) => Promise<void>;
}

const defaultContext: ReimbursementContextType = {
    reimburse: async (_: Reimbursement[]) => { },
};

const ReimbursementContext = createContext<ReimbursementContextType>(defaultContext);

interface ReimbursementProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const ReimbursementProvider: React.FC<ReimbursementProviderProps> = ({ children }) => {
    const { api, isApiReady } = useApi();
    const { currentPair, isLoggedIn } = useLoginContext();
    const [referees, setReferees] = useState<string[]>([]);
    const refereesWithEnoughBalance = useRef<Map<string, BN>>(new Map<string, BN>());
    const [canSubmitTransactions, setCanSubmitTransactions] = useState<boolean>(false);

    useEffect(() => {
        const run = async () => {
            const reimbursements = await getAllReimbursements();
            const referees = reimbursements.map((r: Reimbursement) => r.referee);
            setReferees(referees);
        }
        run();
    }, []);

    useEffect(() => {
        if (api && isApiReady && currentPair) {
            referees.forEach(referee => {
                const refereeAddress = getAddressFromPublickeyHex(referee);
                api.query.system.account(refereeAddress, ({ data: { free } }) => {
                    console.log("typeof free: " + typeof free);
                    if (free.gt(EXISTENTIAL_REFEREE_BALANCE)) {
                        refereesWithEnoughBalance.current.set(referee, free);
                        if (canSubmitTransactions) {
                            setCanSubmitTransactions(false);
                            submitTransactions();
                        }
                    } else {
                        refereesWithEnoughBalance.current.delete(referee);
                    }
                    console.log("RP: refereesWithEnoughBalance.current: ", JSON.stringify(refereesWithEnoughBalance.current, null, 2));
                });
            });
        }
    }, [api, isApiReady, referees, refereesWithEnoughBalance]);

    const _reimburse = useCallback((reimbursements: Reimbursement[]) => {
        const run = async (reimbursements: Reimbursement[]) => {
            console.log("RP: _reimburse, run", JSON.stringify(reimbursements, null, 2))
            if (!currentPair || !api || !isApiReady || !isLoggedIn) {
                return;
            }

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
                api.tx.utility
                    .forceBatch(txs)
                    .signAndSend(currentPair, ({ status }) => {
                        if (status.isInBlock) {
                            // TODO listen events
                            console.log(`included in ${status.asInBlock}`);
                        }
                    });
            }
        };
        run(reimbursements);
    }, [currentPair, api, isApiReady, isLoggedIn]);

    const submitTransactions = useCallback(() => {
        const run = async () => {
            console.log('RP: submitTransactions');
            let seletectedReimbursements: Reimbursement[] = [];
            for (const [referee, balance] of refereesWithEnoughBalance.current) {
                if (seletectedReimbursements.length >= REIMBURSEMENT_BATCH_SIZE) {
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
                    for (const reimbursement of fromMinToMaxReimbursement) {
                        const reimbursementAmount = new BN(reimbursement.amount);
                        const refereeHasEnoughBalance = penaltyAmount.add(reimbursementAmount).gt(EXISTENTIAL_REFEREE_BALANCE);
                        if (refereeHasEnoughBalance && seletectedReimbursements.length < REIMBURSEMENT_BATCH_SIZE) {
                            seletectedReimbursements.push(reimbursement);
                            penaltyAmount = penaltyAmount.add(reimbursementAmount);
                        } else {
                            break;
                        }
                    }
                }
            }
            if (seletectedReimbursements.length > 0) {
                _reimburse(seletectedReimbursements);
            }
        }
        run();
    }, [_reimburse]);

    const reimburse = async (reimbursements: Reimbursement[]) => {
        console.log('RP: reimburse')
        const newReferees = reimbursements.map((r: Reimbursement) => r.referee);
        setReferees([...new Set([...referees, ...newReferees])]);
    };

    return (
        <ReimbursementContext.Provider value={{ reimburse }}>
            {children}
        </ReimbursementContext.Provider>
    );
};

export const useReimbursement = () => useContext(ReimbursementContext);