// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useState } from 'react';
import { useLoginContext, parseJson, useTokenTransfer, receiveWebRTCData, useInfo, LessonResultJSON } from '@slonigiraf/app-slonig-components';
import { hexToU8a, u8aToHex } from '@polkadot/util';
import { cancelLetter, deserializeLetter, getAgreement, putAgreement, putLetter, QRField, updateLetterReexaminingCount } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { encodeAddress } from '@polkadot/keyring';
import { Agreement } from '@slonigiraf/db';
import { useLocation, useNavigate } from 'react-router-dom';

interface Props {
  className?: string;
}

function LessonResultReceiver({ className = '' }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(QRField.WEBRTC_PEER_ID);
  
  if (!webRTCPeerId) return <></>;

  const { t } = useTranslation();
  const { isTransferOpen, setIsTransferOpen, setRecipientId, setAmount,
    setModalCaption, setButtonCaption, isTransferReady, transferSuccess } = useTokenTransfer();
  const { currentPair } = useLoginContext();
  const workerPublicKeyHex = u8aToHex(currentPair?.publicKey);
  console.log("workerPublicKeyHex: "+workerPublicKeyHex)
  const { showInfo, hideInfo } = useInfo();
  const [lessonResultJson, setLessonResultJson] = useState<LessonResultJSON | null>(null);
  const [agreement, setAgreement] = useState<Agreement | null>(null);
  const navigate = useNavigate();

  const updateAgreement = useCallback(async (updatedAgreement: Agreement) => {
    await putAgreement(updatedAgreement);
    setAgreement(updatedAgreement);
  }, [setAgreement, putAgreement]);

  useEffect(() => {
    const fetchLesson = async () => {
      const maxLoadingSec = 60;
      showInfo(t('Loading'), 'info', maxLoadingSec);
      const webRTCData = await receiveWebRTCData(webRTCPeerId, maxLoadingSec * 1000);
      hideInfo();
      setLessonResultJson(parseJson(webRTCData));
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
    if (webRTCPeerId && agreement === null) {
      fetchLesson();
    }
  }, [webRTCPeerId, agreement, t, setAgreement, showInfo, hideInfo,
    setLessonResultJson, parseJson, receiveWebRTCData, getAgreement]);

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
          if(lessonResultJson?.letters){
            lessonResultJson.letters.forEach(async (serializedLetter) => {
              const letter = deserializeLetter(serializedLetter, lessonResultJson.workerId, lessonResultJson.genesis);
              await putLetter(letter);
            });
          }
          if(lessonResultJson?.insurances){
            lessonResultJson.insurances.forEach(async (insuranceMeta) => {
              const [signOverReceipt, lastReexamined, valid] = insuranceMeta.split(',');
              if(signOverReceipt && lastReexamined && valid){
                const time = parseInt(lastReexamined, 10);
                if(valid === '1'){
                  await updateLetterReexaminingCount(signOverReceipt, time);
                } else {
                  await cancelLetter(signOverReceipt, time);
                }
              }
            });
          }
         const updatedAgreement: Agreement = {...agreement, completed: true};
         updateAgreement(updatedAgreement);
         showInfo(t('Saved'));
         navigate('', { replace: true });
        } catch (e) {
          console.log(e);
        }
      }
    }
    if (lessonResultJson && agreement) {
      if(workerPublicKeyHex !== lessonResultJson.workerId){
        showInfo(t('The tutor has shown you a QR code created for a different student. Ask the tutor to find the correct lesson.'), 'error')
      } else{
        payOrSaveResults();
      }
    }
  }, [workerPublicKeyHex, lessonResultJson, agreement, isTransferOpen, isTransferReady,
    setRecipientId, setAmount, setModalCaption, setButtonCaption, setIsTransferOpen,])

  useEffect(() => {
    if (transferSuccess) {
      const updatedAgreement: Agreement = {...agreement, paid: true};
      updateAgreement(updatedAgreement);
    }
  }, [transferSuccess, agreement, updateAgreement])

  return <></>;
}

export default React.memo(LessonResultReceiver);