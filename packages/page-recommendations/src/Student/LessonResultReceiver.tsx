// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { useLoginContext, parseJson, useTokenTransfer, receiveWebRTCData, useInfo, LessonResult } from '@slonigiraf/app-slonig-components';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { addLetter, cancelLetter, deserializeLetter, getAgreement, putAgreement, putLetter, QRField, updateLetterReexaminingCount } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { encodeAddress } from '@polkadot/keyring';
import { Agreement } from '@slonigiraf/db';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from "dexie-react-hooks";

function LessonResultReceiver(): React.ReactElement {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const [webRTCPeerId, setWebRTCPeerId] = useState<string | null>(queryParams.get(QRField.WEBRTC_PEER_ID));
  const { t } = useTranslation();
  const { isTransferOpen, setIsTransferOpen, setRecipientId, setAmount,
    setModalCaption, setButtonCaption, isTransferReady, transferSuccess } = useTokenTransfer();
  const { currentPair } = useLoginContext();
  const workerPublicKeyHex = u8aToHex(currentPair?.publicKey);
  const { showInfo, hideInfo } = useInfo();
  const [lessonResultJson, setLessonResultJson] = useState<LessonResult | null>(null);
  const [triedToFetchData, setTriedToFetchData] = useState(false);
  const navigate = useNavigate();

  const agreement = useLiveQuery(async () => {
    if (!lessonResultJson) return null; // Wait until lessonResultJson is available
  
    // Try to fetch the existing agreement from Dexie
    let savedAgreement = await getAgreement(lessonResultJson.agreement);
  
    // If no agreement exists, create a new one
    if (!savedAgreement) {
      savedAgreement = {
        id: lessonResultJson.agreement,
        price: lessonResultJson.price,
        paid: false,
        completed: false,
      };
      await putAgreement(savedAgreement); // Save the new agreement in Dexie
    }
  
    return savedAgreement;
  }, [lessonResultJson]);

  const updateAgreement = useCallback(async (updatedAgreement: Agreement) => {
    await putAgreement(updatedAgreement);
  }, []);

  useEffect(() => {
    if (!webRTCPeerId) {
      setTriedToFetchData(false);
      setLessonResultJson(null);
    }
  }, [webRTCPeerId]);

  useEffect(() => {
    const fetchLesson = async () => {
      showInfo(t('Ask the sender to refresh the QR page and keep it open while sending data.'), 'error');
      if (webRTCPeerId) {
        const maxLoadingSec = 30;
        showInfo(t('Loading'), 'info', maxLoadingSec);
        try {
          const webRTCData = await receiveWebRTCData(webRTCPeerId, maxLoadingSec * 1000);
          hideInfo();
          const receivedResult: LessonResult = parseJson(webRTCData);
          if (receivedResult.workerId === workerPublicKeyHex) {
            setLessonResultJson(receivedResult);
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

  // useEffect(() => { // TODO understand this
  //   if (webRTCPeerId && isTransferReady && !isTransferOpen) {
  //     setWebRTCPeerId(null);
  //     navigate(''); // helps to close transfer modal
  //   }
  // }, [isTransferReady, isTransferOpen]);

  useEffect(() => {
    async function pay() {
      const recipientAddress = lessonResultJson?.referee ? encodeAddress(hexToU8a(lessonResultJson?.referee)) : "";
      setRecipientId(recipientAddress);
      setAmount(agreement.price);
      setModalCaption(t('Pay for the lesson'));
      setButtonCaption(t('Pay'));
      setIsTransferOpen(true);
    }
    if (lessonResultJson && agreement && agreement.paid === false && isTransferReady) {
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
    if (lessonResultJson && agreement?.paid === true && agreement?.completed === false) {
      saveResults();
    }
  }, [lessonResultJson, agreement?.paid, agreement?.completed])

  useEffect(() => {
    if (transferSuccess && agreement.paid === false) {
      const updatedAgreement: Agreement = { ...agreement, paid: true };
      updateAgreement(updatedAgreement);
    }
  }, [transferSuccess, agreement])

  return <></>;
}

export default React.memo(LessonResultReceiver);