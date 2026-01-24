import { cancelInsurance, cancelInsuranceByRefereeAndLetterNumber, cancelLetter, cancelLetterByRefereeAndLetterNumber, markUsageRightAsUsed, deleteReimbursement, deleteUsageRight, getAllInsurances, getAllLetters, getAllReimbursements, getReimbursementsByReferee, Insurance, Letter, Reimbursement, getReimbursementsByRefereeAndLetterNumber, Recommendation, SettingKey, getLesson, updateLesson, LetterTemplate, getValidLetterTemplatesByLessonId } from '@slonigiraf/db';
import React, { useEffect, useState, useRef, useCallback, ReactNode, createContext, useContext } from 'react';
import { useApi, useBlockEvents, useCall, useIsMountedRef } from '@polkadot/react-hooks';
import { useLoginContext } from './LoginContext.js';
import BN from 'bn.js';
import { bnToSlonFloatOrNaN, bnToSlonString, EXISTENTIAL_BATCH_SENDER_BALANCE, getAddressFromPublickeyHex, getRecommendationsFrom, useInfo, useLog, useSettingValue } from './index.js';
import { EXISTENTIAL_REFEREE_BALANCE, REIMBURSEMENT_BATCH_SIZE } from '@slonigiraf/slonig-components';
import { BN_ZERO } from '@polkadot/util';
import type { AccountInfo } from '@polkadot/types/interfaces';
import { KeyedEvent } from '@polkadot/react-hooks/ctx/types';
import { useLiveQuery } from "dexie-react-hooks";

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
    const { events } = useBlockEvents();

    const lessonId = useSettingValue(SettingKey.LESSON);
    const lessonResultsAreShown = useSettingValue(SettingKey.LESSON_RESULTS_ARE_SHOWN);
    const { showInfo } = useInfo();
    const { logEvent } = useLog();
    const { currentPair, isLoggedIn } = useLoginContext();
    const [badReferees, setBadReferees] = useState<Set<string>>(new Set());
    const mountedRef = useIsMountedRef();
    const badRefereesWithEnoughBalance = useRef<Map<string, BN>>(new Map());
    const myBalance = useRef<BN | null>(null);
    const lastAddressRef = useRef<string | undefined>(undefined);
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
        if (reimbursements.length > 0) {
            await deleteUsageRight(referee, letterId);
            await deleteReimbursement(referee, letterId);
        } else {
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
        const run = async () => {
            if (accountInfo && myBalance.current && lastAddressRef.current === currentPair?.address) {
                const balanceChange = accountInfo.data.free.sub(myBalance.current);
                const priceToLog = bnToSlonFloatOrNaN(new BN(balanceChange));
                const icon = balanceChange.gte(BN_ZERO) ? 'hand-holding-dollar' : 'money-bill-trend-up';
                const balanceChangeToShow = bnToSlonString(balanceChange);
                if (balanceChangeToShow !== '0' && myBalance.current.gt(BN_ZERO)) {
                    logEvent('TRANSACTIONS', priceToLog > 0 ? 'RECEIVE' : 'SEND', 'tokens', Math.abs(priceToLog));
                    showInfo(bnToSlonString(balanceChange) + ' Slon', 'info', 4, icon);
                }
                if (balanceChange.gt(BN_ZERO) && lessonId && lessonResultsAreShown) {
                    const lesson = await getLesson(lessonId);
                    if (lesson) {
                        const letterTemplates: LetterTemplate[] = await getValidLetterTemplatesByLessonId(lessonId);
                        const lessonPrice = new BN(letterTemplates.length).mul(new BN(lesson.dPrice));
                        if (!lesson.isPaid && balanceChange.eq(lessonPrice)) {
                            await updateLesson({ ...lesson, isPaid: true });
                        }
                    }
                }
            }
            myBalance.current = accountInfo?.data.free || null;
            lastAddressRef.current = currentPair?.address;
        }
        run();
    }, [accountInfo, lessonId, lessonResultsAreShown]);


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
                    api.query.system.account(refereeAddress, (accountInfo: AccountInfo) => {
                        if (mountedRef.current) {
                            if (accountInfo.data.free.gt(EXISTENTIAL_REFEREE_BALANCE)) {
                                badRefereesWithEnoughBalance.current.set(referee, accountInfo.data.free);
                            } else {
                                badRefereesWithEnoughBalance.current.delete(referee);
                            }
                        }
                    }).then(unsubscribe => {
                        unsubscribeMap.set(referee, unsubscribe);
                    }).catch(err => {
                        console.error(`Failed to subscribe to referee ${referee}:`, err);
                    });
                }
            });
        }
        return () => {
            unsubscribeMap.forEach(unsubscribe => {
                if (typeof unsubscribe === 'function') {
                    unsubscribe();
                }
            });
            unsubscribeMap.clear();
        };
    }, [api, badReferees, canCommunicateToBlockchain]);


    const sendTransactions = useCallback(async (reimbursements: Reimbursement[]) => {
        if (!currentPair) return;

        // Keep tx + metadata together so indexes can’t drift
        const txWithMeta = (
            await Promise.all(
                reimbursements.map(async (reimbursement) => {
                    const tx = api.tx.letters.reimburse(
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

                    return { tx, reimbursement };
                })
            )
        ).filter((x) => !!x?.tx);

        const txs = txWithMeta.map((x) => x.tx);

        if (txs.length === 0) return;

        const now = Date.now();

        const unsub = await api.tx.utility
            .forceBatch(txs)
            .signAndSend(currentPair, async ({ events = [], status }) => {
                try {
                    if (!status.isInBlock && !status.isFinalized) return;

                    let batchCompletedWithErrors = false;

                    // This counts only ItemCompleted/ItemFailed, and maps 1:1 to calls order
                    let itemIndex = 0;

                    for (const { event, phase } of events) {
                        if (!phase.isApplyExtrinsic) continue;

                        // Summary-only (no details)
                        if (api.events.utility.BatchCompletedWithErrors.is(event)) {
                            batchCompletedWithErrors = true;
                            continue;
                        }

                        // Success for one item
                        if (api.events.utility.ItemCompleted.is(event)) {
                            itemIndex++;
                            continue;
                        }

                        // Failure for one item
                        if (api.events.utility.ItemFailed.is(event)) {
                            const [dispatchError] = event.data;

                            const failed = txWithMeta[itemIndex]; // ✅ exact tx + reimbursement
                            const failedReferee = failed?.reimbursement?.referee;
                            const failedLetterId = failed?.reimbursement?.letterId;

                            let errorInfo: string;
                            if ((dispatchError as any).isModule) {
                                const decoded = api.registry.findMetaError((dispatchError as any).asModule);
                                errorInfo = `${decoded.section}.${decoded.name}`;
                            } else {
                                errorInfo = dispatchError.toString();
                            }

                            console.error(`ItemFailed @ index=${itemIndex} :: ${errorInfo}`);

                            // ✅ Apply same cancellation logic when appropriate
                            // Expand this condition if you want to treat more errors as “cancel locally”.
                            if (errorInfo === 'letters.Expired' && failedReferee && typeof failedLetterId === 'number') {
                                await processLetterCancelationEvent(failedReferee, failedLetterId, now);
                            }

                            itemIndex++;
                            continue;
                        }
                    }

                    if (batchCompletedWithErrors) {
                        console.error('forceBatch partially succeeded: Some items failed.');
                    }

                    unsub();
                    isSendingBatchRef.current = false;
                } catch (error) {
                    console.error(
                        error instanceof Error
                            ? `Error in transaction handling: ${error.message}`
                            : `Unexpected error: ${JSON.stringify(error)}`
                    );
                    isSendingBatchRef.current = false;
                }
            });
    }, [currentPair, api, processLetterCancelationEvent]);


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
            selectedReimbursements.forEach(r => {
                const priceToLog = bnToSlonFloatOrNaN(new BN(r.amount));
                logEvent('SYNC', 'SUBMIT_PENALTY_EXTRINSIC', 'submitted_penalty_slon', Math.abs(priceToLog));
            });
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