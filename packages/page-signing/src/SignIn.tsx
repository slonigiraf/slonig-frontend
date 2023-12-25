// Copyright 2017-2023 @polkadot/app-signing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';

import React, { useCallback, useEffect, useState } from 'react';

import { Button, InputAddress, Modal, Password } from '@polkadot/react-components';
import { nextTick } from '@polkadot/util';

import { useTranslation } from './translate.js';
import { storeSetting } from '@slonigiraf/app-recommendations';
import { encryptData, getKey, useLoginContext } from '@slonigiraf/app-slonig-components';

interface Props {
  onClose: () => void;
  onUnlock: () => void;
  pair: KeyringPair | null;
}

function SignIn({ onClose, onUnlock, pair }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const [isBusy, setIsBusy] = useState(false);
  const [address, setAddress] = useState('');
  const [password, setPassword] = useState('');
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
        // We store password intentionally. Using web accounts is not safe thus this doesn't add much risk.
        const key = await getKey();
        const { encrypted, iv } = await encryptData(key, password);
        await storeSetting('account', pair.address);
        await storeSetting('password', encrypted);
        await storeSetting('iv', iv);
        pair.decodePkcs8(password);
      } catch (error) {
        setIsBusy(false);
        return setUnlockError((error as Error).message);
      }
      setIsBusy(false);
      onUnlock();
    });
  },
    [onUnlock, pair, password]
  );

  if (!pair) {
    return null;
  }

  return (
    <Modal
      className='toolbox--Unlock'
      header={t('Sign In')}
      onClose={onClose}
      size='large'
    >
      <Modal.Content>
        <Modal.Columns hint={t('This account that will perform the message signing.')}>
          <InputAddress
            className='full'
            isInput={false}
            label={t('account')}
            onChange={_onChangeAccount}
            type='account'
          />
        </Modal.Columns>
        <Modal.Columns hint={t('Unlock the account for signing. Once active the signature will be generated based on the content provided.')}>
          <Password
            autoFocus
            isError={!!unlockError}
            label={t('password')}
            onChange={setPassword}
            onEnter={_onUnlock}
            value={password}
          />
        </Modal.Columns>
      </Modal.Content>
      <Modal.Actions>
        <Button
          icon='unlock'
          isBusy={isBusy}
          label={t('Log in')}
          onClick={_onUnlock}
        />
      </Modal.Actions>
    </Modal>
  );
}

export default React.memo(SignIn);
