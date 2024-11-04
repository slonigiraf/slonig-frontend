// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect } from 'react';
import LettersList from './LettersList.js';
import { LoginButton, useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import { storePseudonym } from '@slonigiraf/db';
import { useTranslation } from '../translate.js';
import LessonResultReceiver from './LessonResultReceiver.jsx';

interface Props {
  className?: string;
}

function Student({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  // Process query
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const teacherName = queryParams.get("name");
  const teacherPublicKey = queryParams.get("teacher");
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

  return (
    <div className={`toolbox--Student ${className}`}>
      <div className='ui--row'>
        {isLoggedIn && currentPair && <>
          <LessonResultReceiver />
          <LettersList worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} />
        </>}
        <LoginButton label={t('Log in')} />
      </div>
    </div>
  )
}

export default React.memo(Student);