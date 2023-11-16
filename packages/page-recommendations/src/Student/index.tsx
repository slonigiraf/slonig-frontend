// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import LettersList from './LettersList.js';
import { IPFS } from 'ipfs-core';
import { InputAddress } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import { u8aToHex } from '@polkadot/util';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Student({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const { t } = useTranslation();

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  return (
    <div className={`toolbox--Student ${className}`}>
      
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          help={t('select the account you wish to sign data with')}
          isInput={false}
          label={t('account')}
          type='account'
          onChange={_onChangeAccount}
        />
      </div>
      <div className='ui--row'>
        <LettersList ipfs={ipfs} worker={u8aToHex(currentPair?.publicKey)} />
      </div>
    </div>
  )
}

export default React.memo(Student);