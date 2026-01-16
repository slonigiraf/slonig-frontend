// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { useLoginContext, useTokenTransfer, useInfo, LessonResult, keyForCid, getAddressFromPublickeyHex, useBlockchainSync, useLog, EXAMPLE_SKILL_KNOWLEDGE_ID, bnToSlonFloatOrNaN } from '@slonigiraf/slonig-components';
import { hexToU8a, u8aToHex, u8aWrapBytes } from '@polkadot/util';
import { addReimbursement, cancelLetter, deleteLetter, deserializeLetter, getAgreement, getLetter, getLettersForKnowledgeId, getSetting, letterToReimbursement, putAgreement, putLetter, setSettingToTrue, SettingKey, storePseudonym, updateLetterReexaminingCount, putRepetition as putRepetition, deleteRepetition } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { Agreement } from '@slonigiraf/db';
import { useNavigate } from 'react-router-dom';
import BN from 'bn.js';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import { useApi } from '@polkadot/react-hooks';
import useFetchWebRTC from '../useFetchWebRTC.js';
import { Repetition } from 'db/src/db/Repetition.js';
interface Props {
  webRTCPeerId: string | null;
  onDaysRangeChange: (start: Date, end: Date) => void;
}

function LessonResultReceiver({ webRTCPeerId, onDaysRangeChange }: Props): React.ReactElement {
  const { t } = useTranslation();
  const { api, isApiReady } = useApi();
  const { openTransfer, transferReceipt, isTransferReady } = useTokenTransfer();
  const { currentPair } = useLoginContext();
  const workerPublicKeyHex = u8aToHex(currentPair?.publicKey);
  const { showInfo } = useInfo();
  const [lessonResult, setLessonResult] = useState<LessonResult | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const navigate = useNavigate();
  const { reimburse } = useBlockchainSync();
  const { logEvent } = useLog();

  const updateAgreement = useCallback(async (updatedAgreement: Agreement) => {
    setAgreement(updatedAgreement);
    await putAgreement(updatedAgreement);
  }, []);

  const handleData = useCallback(async (receivedResult: LessonResult) => {
    if (receivedResult.workerId === workerPublicKeyHex) {
      storePseudonym(receivedResult.referee, receivedResult.refereeName);
      setLessonResult(receivedResult);
      const dbAgreement = await getAgreement(receivedResult.agreement);
      const priceToLog = bnToSlonFloatOrNaN(new BN(receivedResult.price));

      if (dbAgreement) {
        if (dbAgreement.completed === true) {
          logEvent('LEARNING', 'LOAD_RESULTS', 'old');
          navigate('', { replace: true });
        } else {
          logEvent('LEARNING', 'LOAD_RESULTS', 'price', priceToLog);
          if (dbAgreement.price === receivedResult.price) {
            setAgreement(dbAgreement);
          } else {
            const newAgreement = {
              ...dbAgreement,
              price: receivedResult.price,
            };
            setAgreement(newAgreement);
            await putAgreement(newAgreement);
          }
        }
      } else {
        logEvent('LEARNING', 'LOAD_RESULTS', 'price', priceToLog);
        const newAgreement = {
          id: receivedResult.agreement,
          price: receivedResult.price,
          penaltySent: false,
          paid: false,
          completed: false,
        };
        setAgreement(newAgreement);
        await putAgreement(newAgreement);
      }
    } else {
      showInfo(t('The tutor has shown you a QR code created for a different tutee. Ask the tutor to find the correct lesson.'), 'error');
      navigate('', { replace: true });
    }
  }, [workerPublicKeyHex, setLessonResult, navigate, setAgreement, showInfo]);

  useFetchWebRTC<LessonResult>(webRTCPeerId, handleData);

  useEffect(() => {
    async function pay() {
      if (agreement && lessonResult) {
        const senderId = currentPair ? currentPair?.address : '';
        const recipientId = getAddressFromPublickeyHex(lessonResult.referee);
        const amount = new BN(agreement.price);

        openTransfer(
          {
            senderId, recipientId, amount, isRewardType: true,
            transferReceipt: {
              senderId,
              recipientId,
              amount,
              success: false,
              id: agreement.id,
            }
          }
        )
      }
    }
    if (lessonResult && agreement && agreement.penaltySent === true &&
      agreement.paid === false && agreement.price !== "0" && isTransferReady) {
      pay();
    }
  }, [lessonResult, agreement, isTransferReady, openTransfer])

  useEffect(() => {
    async function saveResults() {
      if (agreement) {
        try {
          if (lessonResult?.letters && lessonResult?.letters.length > 0) {
            if (lessonResult.letters.length === 1) {
              const letter = deserializeLetter(lessonResult.letters[0], lessonResult.workerId, lessonResult.genesis, lessonResult.amount);
              if (letter.knowledgeId === EXAMPLE_SKILL_KNOWLEDGE_ID) {
                logEvent('SETTINGS', 'NOW_IS_CLASS_ONBOARDING', 'true_or_false', 1);
                await setSettingToTrue(SettingKey.NOW_IS_CLASS_ONBOARDING);
              }
            }
            lessonResult.letters.forEach(async (serializedLetter) => {
              const letter = deserializeLetter(serializedLetter, lessonResult.workerId, lessonResult.genesis, lessonResult.amount);
              const sameSkillLetters = await getLettersForKnowledgeId(letter.workerId, letter.knowledgeId);
              if (sameSkillLetters.length === 0 || sameSkillLetters.length === 1) {
                if (sameSkillLetters.length === 1 && letter.knowledgeId === EXAMPLE_SKILL_KNOWLEDGE_ID) {
                  await deleteLetter(sameSkillLetters[0].pubSign);
                }
                const hasTuteeCompletedTutorial = await getSetting(SettingKey.TUTEE_TUTORIAL_COMPLETED);
                if (hasTuteeCompletedTutorial !== 'true') {
                  logEvent('ONBOARDING', 'TUTEE_TUTORIAL_COMPLETED');
                  await setSettingToTrue(SettingKey.TUTEE_TUTORIAL_COMPLETED);
                }
                await deleteRepetition(letter.workerId, letter.knowledgeId);
                await putLetter(letter);
              }
            });
            if (!lessonResult.tutorIsExperienced) {
              logEvent('ONBOARDING', 'RECRUITED_OTHER_TUTOR');
            }
            logEvent('LEARNING', 'SAVE_BADGES', 'count', lessonResult?.letters.length);
          }
          const updatedAgreement: Agreement = { ...agreement, completed: true };
          updateAgreement(updatedAgreement);

          showInfo(t('Saved'));
          navigate('', { replace: true });
        } catch (e) {
          console.log(e);
        }
      }
    }
    if (lessonResult && agreement && agreement.penaltySent === true &&
      agreement.paid === true && agreement.completed === false) {
      saveResults();
    }
  }, [lessonResult, agreement])


  useEffect(() => {
    async function setDaysRange() {
      try {
        if (lessonResult?.letters && lessonResult.letters.length > 0) {
          const firstSerialized = lessonResult.letters[0];
          const firstLetter = deserializeLetter(
            firstSerialized,
            lessonResult.workerId,
            lessonResult.genesis,
            lessonResult.amount
          );
          const dbLetter = await getLetter(firstLetter.pubSign);
          let date = new Date();
          if (dbLetter) {
            date = new Date(dbLetter.created);
          }
          let startDate = new Date(date.setHours(0, 0, 0, 0));
          let endDate = new Date(date.setHours(23, 59, 59, 999));
          onDaysRangeChange(startDate, endDate);
        }
      } catch (e) {
        console.log(e);
      }
    }
    if (lessonResult) {
      setDaysRange();
    }
  }, [lessonResult])

  useEffect(() => {
    async function saveRepetitions() {
      if (lessonResult) {
        try {
          const now = Date.now();
          lessonResult.repetitions.forEach((repetitionsMeta) => {
            const [lastExaminedRaw, knowledgeId] = repetitionsMeta.split(',');

            const parsed = Number.parseInt(lastExaminedRaw, 10);
            if (!Number.isFinite(parsed) || !knowledgeId) {
              return;
            }

            // Ensure lastExamined is <= now
            const time = Math.min(parsed, now);

            const repetition: Repetition = {
              lastExamined: time,
              workerId: lessonResult.workerId,
              knowledgeId
            };
            putRepetition(repetition);
          });
        } catch (e) {
          console.log(e);
        }
      }
    }
    if (lessonResult) {
      saveRepetitions();
    }
  }, [lessonResult])

  useEffect(() => {
    async function sendPenalties() {
      if (agreement) {
        try {
          // send penalties
          if (currentPair && lessonResult?.reexaminations && agreement?.id) {
            let reimbursementPromises = lessonResult.reexaminations.map(async reexaminationMeta => {
              const [pubSign, lastExamined, valid] = reexaminationMeta.split(',');
              const time = parseInt(lastExamined, 10);
              if (pubSign && valid === '0') {
                const letter = await getLetter(pubSign);
                if (letter) {
                  await cancelLetter(pubSign, time);
                  const letterInsurance = getDataToSignByWorker(letter.letterId, new BN(letter.block), new BN(letter.block), hexToU8a(letter.referee),
                    hexToU8a(letter.worker), new BN(letter.amount), hexToU8a(letter.pubSign), hexToU8a(lessonResult?.referee));
                  const diplomaKey = keyForCid(currentPair, letter.cid);
                  const workerSign = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));
                  const reimbursement = letterToReimbursement(letter, lessonResult?.referee, workerSign, letter.block);
                  await addReimbursement(reimbursement);
                  return reimbursement;
                }
              } else {
                await updateLetterReexaminingCount(pubSign, time);
              }
              return undefined;
            });

            if (lessonResult.reexaminations.length > 0) {
              logEvent('LEARNING', 'SAVE_REEXAMINATIONS', 'count', lessonResult.reexaminations.length);
            }
            const reimbursements = (await Promise.all(reimbursementPromises)).filter(insurance => insurance !== undefined);
            reimburse(reimbursements);
          }
          const updatedAgreement: Agreement = { ...agreement, penaltySent: true };
          updateAgreement(updatedAgreement);
        } catch (e) {
          console.log(e);
        }
      }
    }
    if (isApiReady && api && currentPair && lessonResult && agreement && agreement.penaltySent === false) {
      sendPenalties();
    }
  }, [api, isApiReady, currentPair, lessonResult, agreement, t])

  useEffect(() => {
    if (agreement && transferReceipt && agreement.penaltySent === true &&
      agreement.paid === false && (transferReceipt.success && transferReceipt.id === agreement.id || agreement.price === "0")) {
      const updatedAgreement: Agreement = { ...agreement, paid: true };
      updateAgreement(updatedAgreement);
    }
  }, [transferReceipt, agreement])

  return <></>;
}

export default React.memo(LessonResultReceiver);