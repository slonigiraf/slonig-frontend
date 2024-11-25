import { cancelInsurance, cancelInsuranceByRefereeAndLetterNumber, cancelLetter, cancelLetterByRefereeAndLetterNumber, markUsageRightAsUsed, deleteReimbursement, deleteUsageRight, getAllInsurances, getAllLetters, getAllReimbursements, getReimbursementsByReferee, Insurance, Letter, Reimbursement, getReimbursementsByRefereeAndLetterNumber } from '@slonigiraf/db';
import React, { useEffect, useState, useRef, useCallback, ReactNode, createContext, useContext } from 'react';
import { useApi, useBlockEvents, useCall, useIsMountedRef } from '@polkadot/react-hooks';
import { useLoginContext } from './LoginContext.js';
import BN from 'bn.js';
import { balanceToSlonString, EXISTENTIAL_BATCH_SENDER_BALANCE, getAddressFromPublickeyHex, getRecommendationsFrom, useInfo } from './index.js';
import { EXISTENTIAL_REFEREE_BALANCE, REIMBURSEMENT_BATCH_SIZE } from '@slonigiraf/app-slonig-components';
import { BN_ZERO } from '@polkadot/util';
import type { AccountInfo } from '@polkadot/types/interfaces';
import { KeyedEvent } from '@polkadot/react-hooks/ctx/types';

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
type Recommendation = Letter | Insurance | Reimbursement;

export const BlockchainSyncProvider: React.FC<BlockchainSyncProviderProps> = ({ children }) => {
    const { api, isApiReady } = useApi();
    const { events } = useBlockEvents();
    const { showInfo } = useInfo();
    const { currentPair, isLoggedIn } = useLoginContext();
    const [badReferees, setBadReferees] = useState<Set<string>>(new Set());
    const mountedRef = useIsMountedRef();
    const badRefereesWithEnoughBalance = useRef<Map<string, BN>>(new Map());
    const myBalance = useRef<BN | null>(null);
    const subscribedBadReferees = useRef(new Set());
    const lettersICarryAbout = useRef<Map<string, Map<number, boolean>>>(new Map());
    const isSendingBatchRef = useRef<boolean>(false);
    const isInitialStateLoadedRef = useRef<boolean>(false);
    const newHeader = useCall(
        isApiReady && api?.rpc?.chain?.subscribeNewHeads
            ? api.rpc.chain.subscribeNewHeads
            : undefined
    );
    const accountInfo = useCall<AccountInfo>(
        isApiReady && api?.query?.system?.account
            ? api.query.system.account
            : undefined,
        currentPair?.address ? [currentPair.address] : undefined
    );

    const canCommunicateToBlockchain = useCallback(() => {
        if (currentPair && api && isApiReady && isLoggedIn) {
            return true;
        }
        return false;
    }, [currentPair, api, isApiReady, isLoggedIn]);

    const processLetterCancelationEvent = useCallback(async (referee: string, letterId: number, timeStamp: number) => {
        await cancelLetterByRefereeAndLetterNumber(referee, letterId, timeStamp);
        await cancelInsuranceByRefereeAndLetterNumber(referee, letterId, timeStamp);
        const reimbursements = await getReimbursementsByRefereeAndLetterNumber(referee, letterId);
        if(reimbursements.length > 0){
            await deleteUsageRight(referee, letterId);
            await deleteReimbursement(referee, letterId);
        } else{
            await markUsageRightAsUsed(referee, letterId);
        }
    }, []);

    useEffect(() => {
        const now = (new Date()).getTime();
        events.forEach((keyedEvent: KeyedEvent) => {
            const { event } = keyedEvent.record;
            if (event.section === 'letters' && event.method === 'ReimbursementHappened') {
                const [referee, letterId] = event.data.toJSON() as [string, number];
                processLetterCancelationEvent(referee, letterId, now);
            }
        })
    }, [events]);


    useEffect(() => {
        if (accountInfo && myBalance.current) {
            const balanceChange = accountInfo.data.free.sub(myBalance.current);
            const icon = balanceChange.gte(BN_ZERO) ? 'hand-holding-dollar' : 'money-bill-trend-up';
            const balanceChangeToShow = balanceToSlonString(balanceChange);
            if(balanceChangeToShow !== '0'){
                showInfo(balanceToSlonString(balanceChange) + ' Slon', 'info', 4, icon);
            }
        }
        myBalance.current = accountInfo?.data.free || null;
    }, [accountInfo]);


    useEffect(() => {
        const run = async () => {
            const reimbursements = await getAllReimbursements();
            const letters = await getAllLetters();
            const insurances = await getAllInsurances();
            [...letters, ...insurances, ...reimbursements].forEach((recommendation: Recommendation) => {
                if (!lettersICarryAbout.current.has(recommendation.referee)) {
                    lettersICarryAbout.current.set(recommendation.referee, new Map());
                }
                lettersICarryAbout.current.get(recommendation.referee)?.set(recommendation.letterId, true);
            });
            for (const [referee, map] of lettersICarryAbout.current.entries()) {
                const letterIds = Array.from(map.keys()).map(Number);
                const blockchainState: Map<number, boolean> | null = await getRecommendationsFrom(api, referee, letterIds);
                if (blockchainState) {
                    lettersICarryAbout.current.set(referee, blockchainState);
                }
            }
            const referees: Set<string> = new Set();
            for (const reimbursement of reimbursements) {
                if (lettersICarryAbout.current.has(reimbursement.referee)) {
                    const recommendations = lettersICarryAbout.current.get(reimbursement.referee);
                    if (recommendations && recommendations.has(reimbursement.letterId)) {
                        const valid = recommendations.get(reimbursement.letterId);
                        if (valid) {
                            referees.add(reimbursement.referee);
                        } else {
                            deleteReimbursement(reimbursement.referee, reimbursement.letterId);
                        }
                    }
                }
            }
            setBadReferees(referees);
            // Cancel used letters
            const now = (new Date).getTime()
            for (const letter of letters) {
                if (lettersICarryAbout.current.has(letter.referee)) {
                    const recommendations = lettersICarryAbout.current.get(letter.referee);
                    if (recommendations && recommendations.has(letter.letterId)) {
                        const valid = recommendations.get(letter.letterId);
                        if (!valid) {
                            cancelLetter(letter.pubSign, now);
                        }
                    }
                }
            }
            // Remove used insurances
            for (const insurance of insurances) {
                if (lettersICarryAbout.current.has(insurance.referee)) {
                    const recommendations = lettersICarryAbout.current.get(insurance.referee);
                    if (recommendations && recommendations.has(insurance.letterId)) {
                        const valid = recommendations.get(insurance.letterId);
                        if (!valid) {
                            cancelInsurance(insurance.workerSign, now);
                        }
                    }
                }
            }
            isInitialStateLoadedRef.current = true;
        }
        if (mountedRef.current && canCommunicateToBlockchain()) {
            run();
        }
    }, [api, canCommunicateToBlockchain]);



    useEffect(() => {
        const unsubscribeMap = new Map();
        if (mountedRef.current && canCommunicateToBlockchain() && badReferees.size > 0) {
            badReferees.forEach(referee => {
                if (!subscribedBadReferees.current.has(referee)) {
                    subscribedBadReferees.current.add(referee);
                    const refereeAddress = getAddressFromPublickeyHex(referee);
                    const unsubscribe = api.query.system.account(refereeAddress, (accountInfo: AccountInfo) => {
                        if (mountedRef.current) {
                            if (accountInfo.data.free.gt(EXISTENTIAL_REFEREE_BALANCE)) {
                                badRefereesWithEnoughBalance.current.set(referee, accountInfo.data.free);
                            } else {
                                badRefereesWithEnoughBalance.current.delete(referee);
                            }
                        }
                    });
                    unsubscribeMap.set(referee, unsubscribe);
                }
            });
        }
        return () => {
            unsubscribeMap.forEach(unsubscribe => unsubscribe && unsubscribe());
            unsubscribeMap.clear();
        };
    }, [api, badReferees, canCommunicateToBlockchain]);


    const sendTransactions = useCallback(async (reimbursements: Reimbursement[]) => {
        if (currentPair) {
            let signedTransactionsPromises = reimbursements.map(async reimbursement => {
                return api.tx.letters.reimburse(
                    reimbursement.letterId,
                    new BN(reimbursement.block),
                    new BN(reimbursement.blockAllowed),
                    reimbursement.referee,
                    reimbursement.worker,
                    reimbursement.employer,
                    new BN(reimbursement.amount),
                    reimbursement.pubSign,
                    reimbursement.workerSign
                );
            });

            const txs = (await Promise.all(signedTransactionsPromises)).filter(tx => tx !== undefined);

            if (txs && txs.length > 0) {
                const unsub = await api.tx.utility
                    .forceBatch(txs)
                    .signAndSend(currentPair, async ({ events = [], status }) => {
                        try {
                            if (status.isInBlock || status.isFinalized) {
                                let batchCompletedWithErrors = false;
                                events.forEach(({ event, phase }) => {
                                    if (phase.isApplyExtrinsic) {
                                        if (event.section === 'utility' && event.method === 'BatchCompletedWithErrors') {
                                            batchCompletedWithErrors = true;
                                            console.error('Batch completed with errors.');
                                        }
                                        if (event.section === 'utility' && event.method === 'ItemFailed') {
                                            const [dispatchError] = event.data;
                                            let errorInfo;
                                            if ((dispatchError as any).isModule) {
                                                const decoded = api.registry.findMetaError((dispatchError as any).asModule);
                                                errorInfo = `${decoded.section}.${decoded.name}`;
                                            } else {
                                                errorInfo = dispatchError.toString();
                                            }
                                            console.error(`ItemFailed:: ${errorInfo}`);
                                        }
                                    }
                                });
                                if (batchCompletedWithErrors) {
                                    console.error('forceBatch transaction partially succeeded: Some items failed.');
                                }
                                unsub();
                                isSendingBatchRef.current = false;
                            }
                        } catch (error) {
                            if (error instanceof Error) {
                                console.error(`Error in transaction handling: ${error.message}`);
                            } else {
                                console.error(`Unexpected error: ${JSON.stringify(error)}`);
                            }
                            isSendingBatchRef.current = false;
                        }
                    });
            }
        }
    }, [currentPair, api]);

    const selectAndSendTransactions = useCallback(async () => {
        let selectedReimbursements: Reimbursement[] = [];
        for (const [referee, balance] of badRefereesWithEnoughBalance.current) {
            if (selectedReimbursements.length >= REIMBURSEMENT_BATCH_SIZE) {
                break;
            }
            if (balance.gt(EXISTENTIAL_REFEREE_BALANCE)) {
                let penaltyAmount = BN_ZERO;
                const reimbursements = await getReimbursementsByReferee(referee);
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
        } else {
            isSendingBatchRef.current = false;
        }
    }, [sendTransactions, badReferees]);

    useEffect(() => {
        if (newHeader) {
            if (
                canCommunicateToBlockchain() &&
                isInitialStateLoadedRef.current &&
                !isSendingBatchRef.current &&
                myBalance.current &&
                myBalance.current.gt(EXISTENTIAL_BATCH_SENDER_BALANCE)
            ) {
                isSendingBatchRef.current = true;
                selectAndSendTransactions();
            }
        }
    }, [newHeader, canCommunicateToBlockchain, selectAndSendTransactions]);

    const reimburse = async (reimbursements: Reimbursement[]) => {
        const newReferees = reimbursements.map((r: Reimbursement) => r.referee);
        setBadReferees(new Set([...badReferees, ...newReferees]));
    };

    return (
        <BlockchainSyncContext.Provider value={{ reimburse }}>
            {children}
        </BlockchainSyncContext.Provider>
    );
};

export const useBlockchainSync = () => useContext(BlockchainSyncContext);