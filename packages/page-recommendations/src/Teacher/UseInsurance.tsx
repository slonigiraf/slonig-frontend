// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useState } from 'react';
import { Button, InputAddress } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { useTranslation } from '../translate.js';
import { Insurance } from '@slonigiraf/db';
import { useInfo } from '@slonigiraf/app-slonig-components';
import { getBounty } from "../getBounty.js";

interface Props {
  className?: string;
  insurance: Insurance;
}

function UseInsurance({ className = '', insurance }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const { api } = useApi();
  const [isButtonClicked, setIsButtonClicked] = useState(false);
  const { showInfo } = useInfo();

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const isUsable = currentPair != null;

  const onResult = () => {
    () => setIsButtonClicked(false);
  }

  const processBounty = () => {
    setIsButtonClicked(true);
    if (currentPair !== null) {
      getBounty(insurance, currentPair, api, t, onResult, showInfo);
    }
  };

  const penalizeTutor = isUsable && <Button onClick={() => processBounty()}
    icon='dollar'
    label={t('Get bounty')}
    isDisabled={isButtonClicked}
  />

  const usedInfo = <b>Was invalidated</b>

  return (
    <div className={`toolbox--Sign ${className}`}>
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          isInput={false}
          label={t('account')}
          onChange={_onChangeAccount}
          type='account'
        />
      </div>
      <div className='ui--row'>
        {penalizeTutor}
      </div>
    </div >
  );
}

export default React.memo(UseInsurance);