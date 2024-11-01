// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import LettersList from './LettersList.js';
import { IPFS } from 'ipfs-core';
import { LoginButton, useLoginContext, getIPFSDataFromContentID, parseJson, useTokenTransfer } from '@slonigiraf/app-slonig-components';
import { BN, BN_ZERO, hexToU8a, u8aToHex } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import { createAndStoreLetter, getLetterByLessonIdAndSignOverReceipt, storePseudonym } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import { encodeAddress } from '@polkadot/keyring';
import { QRField } from '@slonigiraf/db';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Student({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  // Process query
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const teacherName = queryParams.get("name");
  const teacherPublicKey = queryParams.get("teacher");
  const addDiplomaData = queryParams.get("d") || "";
  //TODO: get diplomas by url that contains peer id
  const priceString = queryParams.get(QRField.PRICE);
  const lessonPrice = priceString ? new BN(priceString) : BN_ZERO;

  const [isLessonPaid, setIsLessonPaid] = useState(false);
  const [wasLessonResultStored, setWasLessonResultStored] = useState(true);
  const { isTransferOpen, setIsTransferOpen, setRecipientId, setAmount, setCaption } = useTokenTransfer();

  const [textHash,
    workerId,
    genesisHex,
    letterId,
    blockNumber,
    refereePublicKeyHex,
    workerPublicKeyHex,
    amount,
    refereeSignOverPrivateData,
    refereeSignOverReceipt] = addDiplomaData.split(' ');
  // Account initialization
  const { currentPair, isLoggedIn } = useLoginContext();

  // Save teacher pseudonym from url
  useEffect(() => {
    if (teacherPublicKey && teacherName) {
      async function savePseudonym() {
        try {
          // Ensure that both teacherPublicKey and teacherName are strings
          if (typeof teacherPublicKey === 'string' && typeof teacherName === 'string') {
            await storePseudonym(teacherPublicKey, teacherName);
          }
        } catch (error) {
          console.error("Failed to save teacher pseudonym:", error);
        }
      }
      savePseudonym();
    }
  }, [teacherPublicKey, teacherName]);

  // Save diploma from url
  useEffect(() => {
    if (lessonPrice && refereeSignOverPrivateData) {
      async function saveDiploma() {
        if (ipfs !== null) {
          try {
            const sameLetter = getLetterByLessonIdAndSignOverReceipt('', refereeSignOverReceipt);
            if (!sameLetter) {
              if (isLessonPaid) {
                const content = await getIPFSDataFromContentID(ipfs, textHash);
                const json = parseJson(content);
                const knowledgeId = json.i;
                await createAndStoreLetter([textHash,
                  workerId,
                  genesisHex,
                  letterId,
                  blockNumber,
                  refereePublicKeyHex,
                  workerPublicKeyHex,
                  amount,
                  refereeSignOverPrivateData,
                  refereeSignOverReceipt,
                  knowledgeId]);
              }
            }

          } catch (e) {
            console.log(e);
          }
        }
      }
      saveDiploma()
    }
  }, [lessonPrice, isLessonPaid, refereeSignOverPrivateData])

  useEffect(() => {
    if (refereeSignOverPrivateData) {
      async function seeIfSameLetterWasStored() {
        const sameLetter = await getLetterByLessonIdAndSignOverReceipt('', refereeSignOverReceipt);
        if (!sameLetter) {
          setWasLessonResultStored(false);
        }
      }
      seeIfSameLetterWasStored();
    }
  }, [refereeSignOverReceipt, setWasLessonResultStored])

  useEffect(() => {
    if (refereeSignOverPrivateData) {
      setIsLessonPaid(wasLessonResultStored);
    }
  }, [wasLessonResultStored, refereeSignOverPrivateData, setIsLessonPaid])

  useEffect(() => {
    if (refereeSignOverPrivateData) {
      setIsLessonPaid(wasLessonResultStored);
    }
  }, [wasLessonResultStored, refereeSignOverPrivateData, setIsLessonPaid])

  useEffect(() => {
    if (refereeSignOverReceipt) {
      const recipientAddress = refereePublicKeyHex ? encodeAddress(hexToU8a(refereePublicKeyHex)) : "";
      setRecipientId(recipientAddress);
      setAmount(lessonPrice);
      setCaption(t('Pay for the lesson'))
      setIsTransferOpen(!isLessonPaid);
    }
  }, [refereePublicKeyHex, refereeSignOverReceipt, isLessonPaid, isTransferOpen, setIsTransferOpen])

  return (
    <div className={`toolbox--Student ${className}`}>
      <div className='ui--row'>
        {isLoggedIn && currentPair && <LettersList worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} />}
        <LoginButton label={t('Log in')} />
      </div>
    </div>
  )
}

export default React.memo(Student);