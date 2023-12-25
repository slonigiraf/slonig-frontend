// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect } from 'react';
import LettersList from './LettersList.js';
import { IPFS } from 'ipfs-core';
import { InputAddress } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';
import Unlock from '@polkadot/app-signing/Unlock';
import { useLocation } from 'react-router-dom';
import { createAndStoreLetter } from '@slonigiraf/app-recommendations';
import { storePseudonym } from '@slonigiraf/app-recommendations';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Student({ className = '', ipfs }: Props): React.ReactElement<Props> {
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
  // Set translation
  const { t } = useTranslation();
  // Account initialization
  const {
    currentPair,
    isUnlockOpen,
    _onChangeAccount,
    _onUnlock,
  } = useLoginContext();

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

  const unlock = <>
    {isUnlockOpen && (
      <Unlock
        onClose={toggleUnlock}
        onUnlock={_onUnlock}
        pair={currentPair}
      />
    )}
  </>;

  return (
    <div className={`toolbox--Student ${className}`}>
      <div className='ui--row'>
        {isUnlockOpen ?
          unlock :
          <LettersList ipfs={ipfs} worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} />
        }
      </div>
    </div>
  )
}

export default React.memo(Student);