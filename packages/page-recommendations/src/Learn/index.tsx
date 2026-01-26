// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import LettersList from './LettersList.js';
import { loadFromSessionStorage, saveToSessionStorage, UrlParams, useLoginContext } from '@slonigiraf/slonig-components';
import { u8aToHex } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import LessonResultReceiver from './LessonResultReceiver.js';
import { LETTERS } from '../constants.js';

interface Props {
  className?: string;
}

function Learn({ className = '' }: Props): React.ReactElement<Props> {
  // Process query
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(UrlParams.WEBRTC_PEER_ID);
  const { currentPair, isLoggedIn } = useLoginContext();
  const now = new Date();
  const defaultStart = new Date(now.setHours(0, 0, 0, 0));
  const defaultEnd = new Date(now.setHours(23, 59, 59, 999));

  // Initialize startDate and endDate
  const [startDate, setStartDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(LETTERS, 'start');
    return stored ? new Date(stored) : defaultStart;
  });

  const [endDate, setEndDate] = useState<Date>(() => {
    const stored = loadFromSessionStorage(LETTERS, 'end');
    return stored ? new Date(stored) : defaultEnd;
  });

  const onDaysRangeChange = useCallback((start: Date, end: Date) => {
    if (start) {
      setStartDate(start);
      saveToSessionStorage(LETTERS, 'start', start.toISOString());
    }
    if (end) {
      setEndDate(end);
      saveToSessionStorage(LETTERS, 'end', end.toISOString());
    }
  }, [setStartDate, setEndDate]);

  return (
    <div className={`toolbox--Student ${className}`}>
      <div className='ui--row'>
        {isLoggedIn && currentPair && <>
          <LettersList worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} startDate={startDate} endDate={endDate} onDaysRangeChange={onDaysRangeChange}/>
          {webRTCPeerId && <LessonResultReceiver webRTCPeerId={webRTCPeerId} onDaysRangeChange={onDaysRangeChange} />}
        </>}
      </div>
    </div>
  )
}

export default React.memo(Learn);