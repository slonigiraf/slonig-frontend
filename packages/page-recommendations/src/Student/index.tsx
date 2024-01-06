// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect } from 'react';
import LettersList from './LettersList.js';
import { IPFS } from 'ipfs-core';
import { LoginButton, useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import { createAndStoreLetter } from '@slonigiraf/app-recommendations';
import { storePseudonym } from '@slonigiraf/app-recommendations';
import { useTranslation } from '../translate.js';

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
    if (refereeSignOverPrivateData) {
      async function saveDiploma() {
        await createAndStoreLetter([textHash,
          workerId,
          genesisHex,
          letterId,
          blockNumber,
          refereePublicKeyHex,
          workerPublicKeyHex,
          amount,
          refereeSignOverPrivateData,
          refereeSignOverReceipt]);
      }
      saveDiploma()
    }
  }, [refereeSignOverPrivateData])

  return (
    <div className={`toolbox--Student ${className}`}>
      <div className='ui--row'>
        {isLoggedIn && <LettersList ipfs={ipfs} worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} />}
        <LoginButton label={t('Log in to see your diplomas')}/>
      </div>
    </div>
  )
}

export default React.memo(Student);