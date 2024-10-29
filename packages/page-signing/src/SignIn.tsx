// Copyright 2017-2023 @polkadot/app-signing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';

import React, { useCallback, useEffect, useState } from 'react';

import { Button, InputAddress, Modal, Password, styled } from '@polkadot/react-components';
import { nextTick } from '@polkadot/util';

import { useTranslation } from './translate.js';
import { storeSetting } from '@slonigiraf/app-recommendations';
import { SettingKey, useLoginContext } from '@slonigiraf/app-slonig-components';

interface Props {
  onClose: () => void;
  onUnlock: () => void;
  pair: KeyringPair | null;
  toggleSignIn: () => void;
  toggleImport: () => void;
}

function SignIn({ onClose, onUnlock, pair, toggleSignIn, toggleImport }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const [isBusy, setIsBusy] = useState(false);
  const [address, setAddress] = useState('');
  // Intentionally don't use passwords
  const password = '';
  const [unlockError, setUnlockError] = useState<string | null>(null);

  const { _onChangeAccount } = useLoginContext();

  useEffect((): void => {
    setAddress(pair?.address || '');
  }, [pair]);

  useEffect((): void => {
    setUnlockError(null);
  }, [password]);

  const _onUnlock = useCallback(async () => {
    if (!pair || !pair.isLocked) {
      return;
    }
    setIsBusy(true);
    nextTick(async () => {
      try {
        await storeSetting(SettingKey.ACCOUNT, pair.address);
        onUnlock();
      } catch (error) {
        setIsBusy(false);
        return setUnlockError((error as Error).message);
      }
      setIsBusy(false);
    });
  },
    [onUnlock, pair, password]
  );

  if (!pair) {
    return null;
  }

  return (
    <StyledModal
      className='toolbox--Unlock'
      header={t('Sign in To Slonig')}
      onClose={onClose}
      size='small'
    >
      <Modal.Content>
        <InputAddress
          className='full'
          isInput={false}
          label={t('account')}
          onChange={_onChangeAccount}
          type='account'
        />   
      </Modal.Content>
      <Modal.Actions>
        
      <Button
            label={t(`Sign up`)}
            onClick={toggleSignIn}
          />
          <Button
            label={t(`Restore`)}
            onClick={toggleImport}
          />

        <Button
          icon='right-to-bracket'
          isBusy={isBusy}
          label={t('Log in')}
          onClick={_onUnlock}
        />

      </Modal.Actions>
    </StyledModal>
  );
}
const StyledModal = styled(Modal)`
`;

export default React.memo(SignIn);
