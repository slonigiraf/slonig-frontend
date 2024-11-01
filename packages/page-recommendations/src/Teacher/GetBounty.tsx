// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useImperativeHandle, forwardRef, useState, useCallback, useRef } from 'react';
import { TxButton, InputAddress } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { u8aToHex } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import { Insurance, updateInsurance } from '@slonigiraf/db';
import BN from 'bn.js';

interface Props {
  className?: string;
  text: string;
  insurance: Insurance;
}

const GetBounty = forwardRef((props: Props, ref) => {
  const { className = '', text, insurance } = props;
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const { api } = useApi();

  const _onSuccess = async (_result: any) => {
    insurance.wasUsed = true;
    insurance.valid = false;
    await updateInsurance(insurance);
  }

  const _onFailed = async (_result: any) => {
    insurance.valid = false;
    await updateInsurance(insurance);
  }

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const isUsable = currentPair != null;

  const onSendRef = useRef(null);
  const txButton = isUsable && <TxButton
    onSendRef={onSendRef}
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

  const usedInfo = <b>Was invalidated</b>;

  const useInsurance = () => {
    if (onSendRef.current) {
      onSendRef.current(); // Call the _onSend function
    }
  }

  useImperativeHandle(ref, () => ({
    useInsurance
  }));

  return (
    <div className={`toolbox--Sign ${className}`} style={{ display: 'none' }}>
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
        {insurance.wasUsed ? usedInfo : txButton}
      </div>
    </div >
  );
});

export default React.memo(GetBounty);