// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import { getIPFSContentID, digestFromCIDv1, useLogin } from '@slonigiraf/app-slonig-components';
import { BN_ZERO } from '@polkadot/util';
import type { Signer } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Button, Input, InputAddress, InputBalance, TxButton } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isFunction, u8aToHex } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import Unlock from '@polkadot/app-signing/Unlock';
import { useApi } from '@polkadot/react-hooks';
import { randomAsU8a } from '@polkadot/util-crypto';
import { useIpfsContext } from '@slonigiraf/app-slonig-components';
import type { AccountState, SignerState } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
}

function Create({ className = '' }: Props): React.ReactElement<Props> {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsContext();
  const { t } = useTranslation();
  
  const [text, setText] = useState<string>("");
  const {
    currentPair,
    accountState,
    isUnlockOpen,
    _onChangeAccount,
    _onUnlock,
    toggleUnlock
  } = useLogin();
  const [amount, setAmount] = useState<BN>(BN_ZERO);
  const [idHex, setIdHex] = useState<string>("");
  const [digestHex, setDigestHex] = useState<string>("");
  const { api } = useApi();

  useEffect(() => {
    _onSign();
  }, [text]);

  const _onChangeData = useCallback(
    (data: string) => setText(data),
    []
  );

  const _onSign = useCallback(
    async () => {
      if (!isIpfsReady) {
        return;
      }
      // generate a data to sign
      const textCIDString = await getIPFSContentID(ipfs, text);
      const digest = await digestFromCIDv1(textCIDString);
      setDigestHex(u8aToHex(digest));
      setIdHex(u8aToHex(randomAsU8a(32)));
    },
    [currentPair, isUnlockOpen, ipfs, text]
  );

  const _onSuccess = (_result: any) => {
    // TODO use
  }
  const _onFailed = (_result: any) => {
  }

  const txButton = (!isUnlockOpen) && <TxButton
    isDisabled={!(!isUnlockOpen && isIpfsReady)}
    className='createButton'
    accountId={currentPair?.address}
    icon='key'
    label={t('Create')}
    onSuccess={_onSuccess}
    onFailed={_onFailed}
    onClick={_onSign}
    params={
      [idHex,
        digestHex,
        amount,
      ]
    }
    tx={api.tx.laws.create}
  />

  return (
    <div className={`toolbox--Sign ${className}`}>
      <h1>{t('Create')}</h1>
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
        <Input
          autoFocus
          className='full'
          help={t('Text')}
          label={t('text')}
          onChange={_onChangeData}
          value={text}
          isDisabled={ipfs==null}
        />
      </div>
      <div className='ui--row'>
        <InputBalance
          autoFocus
          help={t('Tokens to burn help info')}
          isZeroable
          label={t('Tokens to burn')}
          onChange={setAmount}
          isDisabled={ipfs==null}
        />
      </div>
      <Button.Group>
        {!isUnlockOpen && txButton}
        {!isIpfsReady ? <div>{t('Connecting to IPFS...')}</div> : ""}
      </Button.Group>
    </div>
  );
}

export default React.memo(Create);
