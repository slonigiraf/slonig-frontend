// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useState } from 'react';
import { Button, TxButton, InputAddress } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { u8aToHex } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import { Insurance } from '../db/Insurance.js';
import { db } from "../db/index.js";
import BN from 'bn.js';

interface Props {
  className?: string;
  text: string;
  insurance: Insurance;
}

function UseInsurance({ className = '', text, insurance }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const { api } = useApi();

  const markUsedInsurance = () => {
    if (insurance.id) {
      db.insurances.where({ id: insurance.id }).modify((f) => f.wasUsed = true);
    }
  }

  const _onSuccess = (_result: any) => {
    markUsedInsurance();
  }

  const _onFailed = (_result: any) => {
  }

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const isUsable = currentPair != null;

  const txButton = isUsable && <TxButton
    className='reimburseButton'
    accountId={currentPair.address}
    icon='dollar'
    label={t('Get bounty')}
    onSuccess={_onSuccess}
    onFailed={_onFailed}
    params={
      [insurance.letterNumber,
      new BN(insurance.block),
      new BN(insurance.blockAllowed),
      insurance.referee,
      insurance.worker,
      u8aToHex(currentPair.publicKey),
      new BN(insurance.amount),
      insurance.signOverReceipt,
      insurance.workerSign]
    }
    tx={api.tx.letters.reimburse}
  />

  const usedInfo = <b>Was invalidated</b>

  return (
    <div className={`toolbox--Sign ${className}`}>
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          help={t('select the account you wish to sign data with')}
          isInput={false}
          label={t('account')}
          onChange={_onChangeAccount}
          type='account'
        />
      </div>
      <div className='ui--row'>
        {insurance.wasUsed ? usedInfo : txButton}
      </div>
      <div>Hi</div>
    </div >
  );
}

export default React.memo(UseInsurance);