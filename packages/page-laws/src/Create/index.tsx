// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import BN from 'bn.js';
import QRCode from 'qrcode.react';
import { getIPFSContentID, digestFromCIDv1 } from '@slonigiraf/helpers';
import { BN_ZERO } from '@polkadot/util';
import type { Signer } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useEffect, useState } from 'react';
import { web3FromSource } from '@polkadot/extension-dapp';
import { Button, Input, InputAddress, InputBalance, Output, TxButton } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isFunction, u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { useTranslation } from '../translate.js';
import Unlock from '@polkadot/app-signing/Unlock';
import { IPFS } from 'ipfs-core';
import { statics } from '@polkadot/react-api/statics';
import { useApi } from '@polkadot/react-hooks';

interface Props {
  className?: string;
  ipfs: IPFS;
}

interface AccountState {
  isExternal: boolean;
  isHardware: boolean;
  isInjected: boolean;
}

interface SignerState {
  isUsable: boolean;
  signer: Signer | null;
}

function Create({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [text, setText] = useState<string>("");
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();
  const [amount, setAmount] = useState<BN>(BN_ZERO);
  const [digestHex, setDigestHex] = useState<string>("");
  const { api } = useApi();

  useEffect((): void => {
    const meta = (currentPair && currentPair.meta) || {};
    const isExternal = (meta.isExternal as boolean) || false;
    const isHardware = (meta.isHardware as boolean) || false;
    const isInjected = (meta.isInjected as boolean) || false;
    const isUsable = !(isExternal || isHardware || isInjected);

    setAccountState({ isExternal, isHardware, isInjected });
    setIsLocked(
      isInjected
        ? false
        : (currentPair && currentPair.isLocked) || false
    );
    setSignature('');
    setSigner({ isUsable, signer: null });

    // for injected, retrieve the signer
    if (meta.source && isInjected) {
      web3FromSource(meta.source as string)
        .catch((): null => null)
        .then((injected) => setSigner({
          isUsable: isFunction(injected?.signer?.signRaw),
          signer: injected?.signer || null
        }))
        .catch(console.error);
    }
  }, [currentPair]);

  useEffect(() => {
    _onSign();
  }, [text]);

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const _onChangeData = useCallback(
    (data: string) => setText(data),
    []
  );

  const _onSign = useCallback(
    async () => {
      if (ipfs == null) {
        return;
      }
      // generate a data to sign
      const textCIDString = await getIPFSContentID(ipfs, text);
      const digest = await digestFromCIDv1(textCIDString);
      setDigestHex(u8aToHex(digest));
    },
    [currentPair, isLocked, isUsable, signer, ipfs, text]
  );

  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  const _onSuccess = (_result: any) => {
    // TODO use
  }
  const _onFailed = (_result: any) => {
  }

  const txButton = isUsable && <TxButton
    isDisabled={!(isUsable && !isLocked && ipfs != null)}
    className='createButton'
    accountId={currentPair.address}
    icon='key'
    label={t('Create')}
    onSuccess={_onSuccess}
    onFailed={_onFailed}
    onClick={_onSign}
    params={
      [digestHex,
        amount,
      ]
    }
    tx={api.tx.laws.create}
  />

  return (
    <div className={`toolbox--Sign ${className}`}>
      <h1>{t('Create')}</h1>
      <div className='ui--row'>
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
        <div
          className='unlock-overlay'
          hidden={!isUsable || !isLocked || isInjected}
        >
          {isLocked && (
            <div className='unlock-overlay-warning'>
              <div className='unlock-overlay-content'>
                {t<string>('You need to unlock this account to be able to sign data.')}<br />
                <Button.Group>
                  <Button
                    icon='unlock'
                    label={t<string>('Unlock account')}
                    onClick={toggleUnlock}
                  />
                </Button.Group>
              </div>
            </div>
          )}
        </div>
        <div
          className='unlock-overlay'
          hidden={isUsable}
        >
          <div className='unlock-overlay-warning'>
            <div className='unlock-overlay-content'>
              {isInjected
                ? t<string>('This injected account cannot be used to sign data since the extension does not support raw signing.')
                : t<string>('This external account cannot be used to sign data. Only Limited support is currently available for signing from any non-internal accounts.')}
            </div>
          </div>
        </div>
        {isUnlockVisible && (
          <Unlock
            onClose={toggleUnlock}
            onUnlock={_onUnlock}
            pair={currentPair}
          />
        )}
        {txButton}
        {ipfs == null ? <div>{t<string>('Connecting to IPFS...')}</div> : ""}
      </Button.Group>
    </div>
  );
}

export default React.memo(Create);
