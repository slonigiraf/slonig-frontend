// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { useLoginContext, parseJson, useTokenTransfer, receiveWebRTCData, useInfo, LessonResult } from '@slonigiraf/app-slonig-components';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { cancelLetter, deserializeLetter, getAgreement, putAgreement, putLetter, QRField, updateLetterReexaminingCount } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { encodeAddress } from '@polkadot/keyring';
import { Agreement } from '@slonigiraf/db';
import { useLocation, useNavigate } from 'react-router-dom';

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
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const [triedToFetchData, setTriedToFetchData] = useState(false);
  const navigate = useNavigate();

  const updateAgreement = useCallback(async (updatedAgreement: Agreement) => {
    await putAgreement(updatedAgreement);
    setAgreement(updatedAgreement);
  }, [setAgreement, putAgreement]);

  useEffect(() => {
    setTriedToFetchData(false);
    setLessonResultJson(null);
    setAgreement(null);
  }, [webRTCPeerId, setTriedToFetchData, setLessonResultJson, setAgreement]);

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
            setLessonResultJson(receivedResult);
          } else {
            showInfo(t('The tutor has shown you a QR code created for a different student. Ask the tutor to find the correct lesson.'), 'error');
            navigate('', { replace: true });
          }
        } catch (e) {
          showInfo(t('Ask the sender to keep the QR page open while sending data.'), 'error');
          navigate('', { replace: true });
        }
      }
    };
    if (webRTCPeerId && !triedToFetchData) {
      setTriedToFetchData(true);
      fetchLesson();
    }
  }, [webRTCPeerId, triedToFetchData, t, setAgreement, showInfo, hideInfo,
    setLessonResultJson, parseJson, receiveWebRTCData, getAgreement]);

  useEffect(() => {
    const fetchAgreement = async () => {
      if (lessonResultJson) {
        const savedAgreement = await getAgreement(lessonResultJson.agreement);
        if (savedAgreement) {
          setAgreement(savedAgreement);
        } else {
          const newAgreement: Agreement = {
            id: lessonResultJson.agreement,
            price: lessonResultJson.price,
            paid: false,
            completed: false,
          };
          updateAgreement(newAgreement);
        }
      }
    };
    if (lessonResultJson && !agreement) {
      fetchAgreement();
    }
  }, [lessonResultJson, setAgreement, getAgreement]);

  useEffect(() => {
    if (webRTCPeerId && isTransferReady && !isTransferOpen) {
      setWebRTCPeerId(null);
      setAgreement(null);
      navigate(''); // helps to close transfer modal
    }
  }, [isTransferReady, isTransferOpen]);

  useEffect(() => {
    async function payOrSaveResults() {
      if (agreement.paid === false && isTransferReady) {
        //pay
        const recipientAddress = lessonResultJson?.referee ? encodeAddress(hexToU8a(lessonResultJson?.referee)) : "";
        setRecipientId(recipientAddress);
        setAmount(agreement.price);
        setModalCaption(t('Pay for the lesson'));
        setButtonCaption(t('Pay'));
        setIsTransferOpen(true);
      } else if (agreement.completed === false) {
        //store
        try {
          if (lessonResultJson?.letters) {
            lessonResultJson.letters.forEach(async (serializedLetter) => {
              const letter = deserializeLetter(serializedLetter, lessonResultJson.workerId, lessonResultJson.genesis, lessonResultJson.amount);
              await putLetter(letter);
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
    }
    if (lessonResultJson && agreement) {
      payOrSaveResults();
    }
  }, [workerPublicKeyHex, lessonResultJson, agreement, isTransferReady,
    setRecipientId, setAmount, setModalCaption, setButtonCaption, setIsTransferOpen,])

  useEffect(() => {
    if (transferSuccess) {
      const updatedAgreement: Agreement = { ...agreement, paid: true };
      updateAgreement(updatedAgreement);
    }
  }, [transferSuccess, agreement, updateAgreement])

  return <></>;
}

export default React.memo(LessonResultReceiver);