// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import LettersList from './LettersList.js';
import { useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';

interface Props {
  className?: string;
}

function Learn({ className = '' }: Props): React.ReactElement<Props> {
  const { currentPair, isLoggedIn } = useLoginContext();

  return (
    <div className={`toolbox--Student ${className}`}>
      <div className='ui--row'>
        {isLoggedIn && currentPair && <>
          <LettersList worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} />
        </>}
      </div>
    </div>
  )
}

export default React.memo(Learn);