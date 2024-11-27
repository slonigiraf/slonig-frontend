// Copyright 2017-2023 @polkadot/app-signing authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { KeyringPair } from '@polkadot/keyring/types';

import React, { useCallback, useEffect, useState } from 'react';

import { Button, InputAddress, Modal } from '@polkadot/react-components';
import { nextTick } from '@polkadot/util';

import { useTranslation } from './translate.js';
import { storeSetting, SettingKey } from '@slonigiraf/db';

interface Props {
  onClose: () => void;
  onUnlock: () => void;
  pair: KeyringPair | null;
}

function Unlock({ onClose, onUnlock, pair }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const [isBusy, setIsBusy] = useState(false);
  const [address, setAddress] = useState('');
  // Intentionally don't use passwords
  const password = 'password';
  const [unlockError, setUnlockError] = useState<string | null>(null);

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
      header={t('Unlock account')}
      onClose={onClose}
      size='large'
    >
      <Modal.Content>
        <Modal.Columns hint={t('This account that will perform the message signing.')}>
          <InputAddress
            isDisabled
            label={t('account')}
            value={address}
          />
        </Modal.Columns>
      </Modal.Content>
      <Modal.Actions>
        <Button
          icon='unlock'
          isBusy={isBusy}
          label={t('Unlock')}
          onClick={_onUnlock}
        />
      </Modal.Actions>
    </Modal>
  );
}

export default React.memo(Unlock);
