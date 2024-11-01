// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Dispatch, SetStateAction } from 'react';
import type { KeyringPair, KeyringPair$Json } from '@polkadot/keyring/types';
import type { ActionStatus } from '@polkadot/react-components/Status/types';
import type { HexString } from '@polkadot/util/types';
import type { ModalProps } from '../types.js';

import React, { useCallback, useMemo, useState } from 'react';

import { Button, InputAddress, InputFile, MarkError, MarkWarning, Modal, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { assert, nextTick, u8aToString } from '@polkadot/util';

import { useTranslation } from '../translate.js';
import { storeSetting, SettingKey } from '@slonigiraf/db';

interface Props extends ModalProps {
  className?: string;
  onClose: () => void;
  onStatusChange: (status: ActionStatus) => void;
  toggleImport: () => void;
}

interface PassState {
  isPassValid: boolean;
  password: string;
}

const acceptedFormats = ['application/json', 'text/plain'];

function parseFile(file: Uint8Array, setError: Dispatch<SetStateAction<string | null>>, isEthereum: boolean, genesisHash?: HexString | null): KeyringPair | null {
  try {
    const pair = keyring.createFromJson(JSON.parse(u8aToString(file)) as KeyringPair$Json, { genesisHash });

    if (isEthereum) {
      assert(pair.type === 'ethereum', 'JSON File does not contain an ethereum type key pair');
    } else {
      assert(pair.type !== 'ethereum', 'JSON contains an ethereum keytype, this is not available on this network');
    }

    return pair;
  } catch (error) {
    console.error(error);
    setError((error as Error).message ? (error as Error).message : (error as Error).toString());
  }

  return null;
}

function Import({ className = '', onClose, onStatusChange, toggleImport }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { api, isDevelopment, isEthereum } = useApi();
  const [isBusy, setIsBusy] = useState(false);
  const [pair, setPair] = useState<KeyringPair | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Intentionally don't use passwords
  const isPassValid = true;
  const password  = '';
  const apiGenesisHash = useMemo(() => isDevelopment ? null : api.genesisHash.toHex(), [api, isDevelopment]);
  const differentGenesis = useMemo(() => !!pair?.meta.genesisHash && pair.meta.genesisHash !== apiGenesisHash, [apiGenesisHash, pair]);

  const _onChangeFile = useCallback(
    (file: Uint8Array) => setPair(parseFile(file, setError, isEthereum, apiGenesisHash)),
    [apiGenesisHash, isEthereum]
  );

  const _onSave = useCallback(
    async () => {
      if (!pair) {
        return;
      }

      setIsBusy(true);
      nextTick(async () => {
        const status: Partial<ActionStatus> = { action: 'restore' };

        try {
          keyring.addPair(pair, password);

          status.status = 'success';
          status.account = pair.address;
          status.message = t('account restored');

          await storeSetting(SettingKey.ACCOUNT, pair.address);
          pair.decodePkcs8(password);
          InputAddress.setLastValue('account', pair.address);
        } catch (error) {
          status.status = 'error';
          status.message = (error as Error).message;
          console.error(error);
        }

        setIsBusy(false);
        onStatusChange(status as ActionStatus);

        if (status.status !== 'error') {
          onClose();
        }
      });
    },
    [onClose, onStatusChange, pair, password, t]
  );

  return (
    <StyledModal
      className={className}
      header={t('Restore Slonig Account')}
      onClose={onClose}
      size='small'
    >
      <Modal.Content>
        <InputFile
          accept={acceptedFormats}
          className='full'
          isError={!pair}
          label={t('backup file')}
          onChange={_onChangeFile}
          withLabel
        />
        {error && (
          <MarkError content={error} />
        )}
        {differentGenesis && (
          <MarkWarning content={t('The network from which this account was originally generated is different than the network you are currently connected to. Once imported ensure you toggle the "allow on any network" option for the account to keep it visible on the current network.')} />
        )}
      </Modal.Content>
      <Modal.Actions>
        <Button
          label={t(`Cancel`)}
          onClick={toggleImport}
        />
        <Button
          icon='sync'
          isBusy={isBusy}
          isDisabled={!pair || !isPassValid}
          label={t('Restore')}
          onClick={_onSave}
        />
      </Modal.Actions>
    </StyledModal>
  );
}
const StyledModal = styled(Modal)`
`;
export default React.memo(Import);
