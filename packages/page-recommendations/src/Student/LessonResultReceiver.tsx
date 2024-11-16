// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLoginContext, parseJson, useTokenTransfer, receiveWebRTCData, useInfo, LessonResult, keyForCid } from '@slonigiraf/app-slonig-components';
import { BN_ZERO, hexToU8a, u8aToHex, u8aWrapBytes } from '@polkadot/util';
import { addLetter, cancelLetter, deserializeLetter, getAgreement, getLetter, getLetterByLessonIdAndSignOverReceipt, getLetterBySignOverReceipt, Insurance, putAgreement, storePseudonym, updateLetterReexaminingCount } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { encodeAddress } from '@polkadot/keyring';
import { Agreement } from '@slonigiraf/db';
import { useNavigate } from 'react-router-dom';
import BN from 'bn.js';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import { useApi } from '@polkadot/react-hooks';
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
  const { showInfo, hideInfo } = useInfo();
  const [lessonResultJson, setLessonResultJson] = useState<LessonResult | null>(null);
  const [triedToFetchData, setTriedToFetchData] = useState(false);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const navigate = useNavigate();

  const updateAgreement = useCallback(async (updatedAgreement: Agreement) => {
    setAgreement(updatedAgreement);
    await putAgreement(updatedAgreement);
  }, []);

  useEffect(() => {
    const fetchLesson = async () => {
      if (webRTCPeerId) {
        const maxLoadingSec = 30;
        showInfo(t('Loading'), 'info', maxLoadingSec);
        try {
          const webRTCData = await receiveWebRTCData(webRTCPeerId, maxLoadingSec * 1000);
          hideInfo();
          const receivedResult: LessonResult = parseJson(webRTCData);
          if (receivedResult.workerId === workerPublicKeyHex) {
            storePseudonym(receivedResult.referee, receivedResult.refereeName);
            setLessonResultJson(receivedResult);
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
        } catch (e) {
          showInfo(t('Ask the sender to refresh the QR page and keep it open while sending data.'), 'error');
          navigate('', { replace: true });
        }
      }
    };
    if (webRTCPeerId && !triedToFetchData) {
      setTriedToFetchData(true);
      fetchLesson();
    }
  }, [webRTCPeerId, t, showInfo, hideInfo]);

  useEffect(() => {
    async function pay() {
      const recipientAddress = lessonResultJson?.referee ? encodeAddress(hexToU8a(lessonResultJson?.referee)) : "";
      setRecipientId(recipientAddress);
      setAmount(agreement.price);
      setModalCaption(t('Pay for the lesson'));
      setButtonCaption(t('Pay'));
      setIsTransferOpen(true);
    }
    if (lessonResultJson && agreement && agreement.penaltySent === true &&
      agreement.paid === false && agreement.price !== "0" && isTransferReady) {
      pay();
    }
  }, [lessonResultJson, agreement, isTransferReady,
    setRecipientId, setAmount, setModalCaption, setButtonCaption, setIsTransferOpen])

  useEffect(() => {
    async function saveResults() {
      try {
        if (lessonResultJson?.letters) {
          lessonResultJson.letters.forEach(async (serializedLetter) => {
            const letter = deserializeLetter(serializedLetter, lessonResultJson.workerId, lessonResultJson.genesis, lessonResultJson.amount);
            await addLetter(letter);
          });
        }
        if (lessonResultJson?.insurances) {
          lessonResultJson.insurances.forEach(async (insuranceMeta) => {
            const [signOverReceipt, lastExamined, valid] = insuranceMeta.split(',');
            if (signOverReceipt && lastExamined && valid) {
              const time = parseInt(lastExamined, 10);
              if (valid === '1') {
                await updateLetterReexaminingCount(signOverReceipt, time);
              } else {
                await cancelLetter(signOverReceipt, time);
              }
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
    if (lessonResultJson && agreement && agreement.penaltySent === true &&
      agreement.paid === true && agreement.completed === false) {
      saveResults();
    }
  }, [lessonResultJson, agreement])

  useEffect(() => {
    async function sendPenalties() {
      try {
        if (currentPair && lessonResultJson?.insurances) {

          let signedTransactionsPromises = lessonResultJson.insurances.map(async insuranceMeta => {
            const [signOverReceipt, _lastExamined, valid] = insuranceMeta.split(',');
            if (signOverReceipt && valid === '0') {
              const letter = await getLetterBySignOverReceipt(signOverReceipt);
              if (letter) {
                // generate a data to sign      
                const letterInsurance = getDataToSignByWorker(letter.letterNumber, new BN(letter.block), new BN(letter.block), hexToU8a(letter.referee),
                  hexToU8a(letter.worker), new BN(letter.amount), hexToU8a(letter.signOverReceipt), hexToU8a(letter.worker));

                const diplomaKey = keyForCid(currentPair, letter.cid);
                const workerSignOverInsurance = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));

                return api.tx.letters.reimburse(
                  letter.letterNumber,
                  new BN(letter.block),
                  new BN(letter.block),
                  letter.referee,
                  letter.worker,
                  lessonResultJson?.referee,
                  new BN(letter.amount),
                  letter.signOverReceipt,
                  workerSignOverInsurance
                );
              }
            }
            return undefined;
          });

          const txs = (await Promise.all(signedTransactionsPromises)).filter(tx => tx !== undefined);

          if (txs && txs.length > 0) {
            api.tx.utility
              .batch(txs)
              .signAndSend(currentPair, ({ status }) => {
                if (status.isInBlock) {
                  console.log(`included in ${status.asInBlock}`);
                }
              });
          }
        }
        const updatedAgreement: Agreement = { ...agreement, penaltySent: true };
        updateAgreement(updatedAgreement);
      } catch (e) {
        console.log(e);
      }
    }
    if (isApiReady && api && currentPair && lessonResultJson && agreement && agreement.penaltySent === false) {
      sendPenalties();
    }
  }, [api, isApiReady, currentPair, lessonResultJson, agreement, t])

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