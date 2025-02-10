// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import LettersList from './LettersList.js';
import { LoginButton, UrlParams, useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import LessonResultReceiver from './LessonResultReceiver.js';

interface Props {
  className?: string;
}

function Learn({ className = '' }: Props): React.ReactElement<Props> {
  // Process query
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(UrlParams.WEBRTC_PEER_ID);
  const { currentPair, isLoggedIn } = useLoginContext();

  return (
    <div className={`toolbox--Student ${className}`}>
      <div className='ui--row'>
        {isLoggedIn && currentPair && <>
          <LettersList worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} />
          {webRTCPeerId && <LessonResultReceiver webRTCPeerId={webRTCPeerId} />}
        </>}
        <LoginButton />
      </div>
    </div>
  )
}

export default React.memo(Learn);