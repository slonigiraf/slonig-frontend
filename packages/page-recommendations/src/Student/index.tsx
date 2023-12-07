// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState, useEffect } from 'react';
import LettersList from './LettersList.js';
import { IPFS } from 'ipfs-core';
import { InputAddress, Button } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import type { AccountState, SignerState } from '@slonigiraf/app-slonig-components';
import { useToggle } from '@polkadot/react-hooks';
import { web3FromSource } from '@polkadot/extension-dapp';
import { isFunction, u8aToHex } from '@polkadot/util';
import Unlock from '@polkadot/app-signing/Unlock';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Student({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  // Account initialization
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(null);
  const [{ isInjected }, setAccountState] = useState<AccountState>({ isExternal: false, isHardware: false, isInjected: false });
  const [isLocked, setIsLocked] = useState(false);
  const [{ isUsable, signer }, setSigner] = useState<SignerState>({ isUsable: true, signer: null });
  const [signature, setSignature] = useState('');
  const [isUnlockVisible, toggleUnlock] = useToggle();
  const [letterInfo, setLetterInfo] = useState('')
  const [isQROpen, toggleQR] = useToggle();

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

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  // If account is unlocked by password
  const _onUnlock = useCallback(
    (): void => {
      setIsLocked(false);
      toggleUnlock();
    },
    [toggleUnlock]
  );

  const unlock = <>
    <div
      className='unlock-overlay'
      hidden={!isUsable || !isLocked || isInjected}
    >
      {isLocked && (
        <div className='unlock-overlay-warning'>
          <div className='unlock-overlay-content'>
            <div>
              <Button
                icon='unlock'
                label={t('Unlock your account to see diplomas')}
                onClick={toggleUnlock}
              />
            </div>
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
            ? t('This injected account cannot be used to sign data since the extension does not support raw signing.')
            : t('This external account cannot be used to sign data. Only Limited support is currently available for signing from any non-internal accounts.')}
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
  </>;

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
        {isLocked ?
          unlock :
          <LettersList ipfs={ipfs} worker={u8aToHex(currentPair?.publicKey)} currentPair={currentPair} />
        }
      </div>
    </div>
  )
}

export default React.memo(Student);