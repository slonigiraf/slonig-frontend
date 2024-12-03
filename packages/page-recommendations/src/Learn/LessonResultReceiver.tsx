// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { useLoginContext, useTokenTransfer, useInfo, LessonResult, keyForCid, getAddressFromPublickeyHex, useBlockchainSync } from '@slonigiraf/app-slonig-components';
import { hexToU8a, u8aToHex, u8aWrapBytes } from '@polkadot/util';
import { addReimbursement, cancelLetter, deserializeLetter, getAgreement, getLetter, getLettersForKnowledgeId, letterToReimbursement, putAgreement, putLetter, storePseudonym, updateLetterReexaminingCount } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { Agreement } from '@slonigiraf/db';
import { useNavigate } from 'react-router-dom';
import BN from 'bn.js';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import { useApi } from '@polkadot/react-hooks';
import useFetchWebRTC from '../useFetchWebRTC.js';
interface Props {
  webRTCPeerId: string | null;
}

function LessonResultReceiver({ webRTCPeerId }: Props): React.ReactElement {
  const { t } = useTranslation();
  const { api, isApiReady } = useApi();
  const { setIsTransferOpen, setRecipientId, setAmount,
    setModalCaption, setButtonCaption, isTransferReady, transferSuccess } = useTokenTransfer();
  const { currentPair } = useLoginContext();
  const workerPublicKeyHex = u8aToHex(currentPair?.publicKey);
  const { showInfo } = useInfo();
  const [lessonResult, setLessonResult] = useState<LessonResult | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const navigate = useNavigate();
  const { reimburse } = useBlockchainSync();

  const updateAgreement = useCallback(async (updatedAgreement: Agreement) => {
    setAgreement(updatedAgreement);
    await putAgreement(updatedAgreement);
  }, []);

  useFetchWebRTC<LessonResult>(webRTCPeerId, async (receivedResult) => {
    if (receivedResult.workerId === workerPublicKeyHex) {
      storePseudonym(receivedResult.referee, receivedResult.refereeName);
      setLessonResult(receivedResult);
      const dbAgreement = await getAgreement(receivedResult.agreement);
      if (dbAgreement) {
        if (dbAgreement.completed === true) {
          navigate('', { replace: true });
        } else {
          setAgreement(dbAgreement);
        }
      } else {
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
      showInfo(t('The tutor has shown you a QR code created for a different student. Ask the tutor to find the correct lesson.'), 'error');
      navigate('', { replace: true });
    }
  });

  useEffect(() => {
    async function pay() {
      if (agreement && lessonResult) {
        setRecipientId(getAddressFromPublickeyHex(lessonResult.referee));
        setAmount(new BN(agreement.price));
        setModalCaption(t('Pay for the lesson'));
        setButtonCaption(t('Pay'));
        setIsTransferOpen(true);
      }
    }
    if (lessonResult && agreement && agreement.penaltySent === true &&
      agreement.paid === false && agreement.price !== "0" && isTransferReady) {
      pay();
    }
  }, [lessonResult, agreement, isTransferReady,
    setRecipientId, setAmount, setModalCaption, setButtonCaption, setIsTransferOpen])

  useEffect(() => {
    async function saveResults() {
      if (agreement) {
        try {
          if (lessonResult?.letters) {
            lessonResult.letters.forEach(async (serializedLetter) => {
              const letter = deserializeLetter(serializedLetter, lessonResult.workerId, lessonResult.genesis, lessonResult.amount);
              const sameSkillLetters = await getLettersForKnowledgeId(letter.workerId, letter.knowledgeId);
              if (sameSkillLetters.length === 0) {
                await putLetter(letter);
              }
            });
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
    async function sendPenalties() {
      if (agreement) {
        try {
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
    if (agreement && agreement.penaltySent === true &&
      agreement.paid === false && (transferSuccess || agreement.price === "0")) {
      const updatedAgreement: Agreement = { ...agreement, paid: true };
      updateAgreement(updatedAgreement);
    }
  }, [transferSuccess, agreement])

  return <></>;
}

export default React.memo(LessonResultReceiver);