// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ActionStatus } from '@polkadot/react-components/Status/types';
import type { AddressState, CreateOptions, CreateProps, DeriveValidationOutput, PairType, SeedType } from '../types.js';

import React, { useCallback, useState } from 'react';

import { DEV_PHRASE } from '@polkadot/keyring/defaults';
import { Button, Modal, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isHex, nextTick, u8aToHex } from '@polkadot/util';
import { hdLedger, hdValidatePath, keyExtractSuri, mnemonicGenerate, mnemonicValidate, randomAsU8a } from '@polkadot/util-crypto';

import { useTranslation } from '../translate.js';
import { tryCreateAccount } from '../util.js';
import CreateAccountInputs from './CreateAccountInputs.js';
import { ETH_DEFAULT_PATH } from './CreateEthDerivationPath.js';
import { storeSetting, SettingKey } from '@slonigiraf/db';
import { useNavigate } from 'react-router-dom';

const DEFAULT_PAIR_TYPE = 'sr25519';

function getSuri(seed: string, derivePath: string, pairType: PairType): string {
  return pairType === 'ed25519-ledger'
    ? u8aToHex(hdLedger(seed, derivePath).secretKey.slice(0, 32))
    : pairType === 'ethereum'
      ? `${seed}/${derivePath}`
      : `${seed}${derivePath}`;
}

function deriveValidate(seed: string, seedType: SeedType, derivePath: string, pairType: PairType): DeriveValidationOutput {
  try {
    const { password, path } = keyExtractSuri(pairType === 'ethereum' ? `${seed}/${derivePath}` : `${seed}${derivePath}`);
    let result: DeriveValidationOutput = {};

    // show a warning in case the password contains an unintended / character
    if (password?.includes('/')) {
      result = { warning: 'WARNING_SLASH_PASSWORD' };
    }

    // we don't allow soft for ed25519
    if (pairType === 'ed25519' && path.some(({ isSoft }): boolean => isSoft)) {
      return { ...result, error: 'SOFT_NOT_ALLOWED' };
    }

    // we don't allow password for hex seed
    if (seedType === 'raw' && password) {
      return { ...result, error: 'PASSWORD_IGNORED' };
    }

    if (pairType === 'ethereum' && !hdValidatePath(derivePath)) {
      return { ...result, error: 'INVALID_DERIVATION_PATH' };
    }

    return result;
  } catch (error) {
    return { error: (error as Error).message };
  }
}

function isHexSeed(seed: string): boolean {
  return isHex(seed) && seed.length === 66;
}

function rawValidate(seed: string): boolean {
  return ((seed.length > 0) && (seed.length <= 32)) || isHexSeed(seed);
}

function addressFromSeed(seed: string, derivePath: string, pairType: PairType): string {
  return keyring
    .createFromUri(getSuri(seed, derivePath, pairType), {}, pairType === 'ed25519-ledger' ? 'ed25519' : pairType)
    .address;
}

function newSeed(seed: string | undefined | null, seedType: SeedType): string {
  switch (seedType) {
    case 'bip':
      return mnemonicGenerate();
    case 'dev':
      return DEV_PHRASE;
    default:
      return seed || u8aToHex(randomAsU8a());
  }
}

function generateSeed(_seed: string | undefined | null, derivePath: string, seedType: SeedType, pairType: PairType = DEFAULT_PAIR_TYPE): AddressState {
  const seed = newSeed(_seed, seedType);
  const address = addressFromSeed(seed, derivePath, pairType);

  return {
    address,
    derivePath,
    deriveValidation: undefined,
    isSeedValid: true,
    pairType,
    seed,
    seedType
  };
}

function updateAddress(seed: string, derivePath: string, seedType: SeedType, pairType: PairType): AddressState {
  let address: string | null = null;
  let deriveValidation: DeriveValidationOutput = deriveValidate(seed, seedType, derivePath, pairType);
  let isSeedValid = false;

  if (seedType === 'raw') {
    isSeedValid = rawValidate(seed);
  } else {
    const words = seed.split(' ');

    if (pairType === 'ed25519-ledger' && words.length === 25) {
      words.pop();

      isSeedValid = mnemonicValidate(words.join(' '));
    } else {
      isSeedValid = mnemonicValidate(seed);
    }
  }

  if (!deriveValidation?.error && isSeedValid) {
    try {
      address = addressFromSeed(seed, derivePath, pairType);
    } catch (error) {
      console.error(error);
      deriveValidation = { error: (error as Error).message ? (error as Error).message : (error as Error).toString() };
      isSeedValid = false;
    }
  }

  return {
    address,
    derivePath,
    deriveValidation,
    isSeedValid,
    pairType,
    seed,
    seedType
  };
}

function createAccount(seed: string, derivePath: string, pairType: PairType, { genesisHash, name, tags = [] }: CreateOptions, password: string, success: string): ActionStatus {
  const commitAccount = () =>
    keyring.addUri(getSuri(seed, derivePath, pairType), password, { genesisHash, isHardware: false, name, tags }, pairType === 'ed25519-ledger' ? 'ed25519' : pairType);

  return tryCreateAccount(commitAccount, success);
}

function Create({ className = '', onClose, onStatusChange, seed: propsSeed, type: propsType, cancelAuthorization }: CreateProps): React.ReactElement<CreateProps> {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { api, isDevelopment, isEthereum } = useApi();
  const [{ address, derivePath, deriveValidation, isSeedValid, pairType, seed, seedType }, setAddress] = useState<AddressState>(() => generateSeed(
    propsSeed,
    isEthereum ? ETH_DEFAULT_PATH : '',
    propsSeed ? 'raw' : 'bip',
    isEthereum ? 'ethereum' : propsType
  ));
  const [isMnemonicSaved, setIsMnemonicSaved] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState(false);
  const [{ isNameValid, name }, setName] = useState(() => ({ isNameValid: false, name: '' }));
  // Intentially don't use passwords
  const isPasswordValid = true;
  const password = 'password'; // Intentionally don't use passwords
  const isFirstStepValid = !!address && isMnemonicSaved && !deriveValidation?.error && isSeedValid;
  const isSecondStepValid = isNameValid && isPasswordValid;
  const isValid = isFirstStepValid && isSecondStepValid;

  const _onCommit = useCallback(
    async () => {
      if (!isValid) {
        return;
      }
      setIsBusy(true);
      nextTick(async () => {
        const options = { genesisHash: isDevelopment ? undefined : api.genesisHash.toHex(), isHardware: false, name: name.trim() };
        const status = createAccount(seed, derivePath, pairType, options, password, t('created account'));
        if (status.status === 'success' && status.account) {
          await storeSetting(SettingKey.ACCOUNT, status.account?.toString());
        }
        onStatusChange(status);
        setIsBusy(false);
        onClose();
      });
    },
    [api, derivePath, isDevelopment, isValid, name, onClose, onStatusChange, pairType, password, seed, t]
  );

  return (
    <StyledModal
      className={className}
      header={t('Sign Up for Slonig')}
      onClose={onClose}
      size='small'
    >
      <Modal.Content>
        <CreateAccountInputs
          name={{ isNameValid, name }}
          onCommit={_onCommit}
          setName={setName}
          setPassword={() => { }} // Intentionally don't use passwords
        />
      </Modal.Content>
      <Modal.Actions>
        {cancelAuthorization && <Button
          label={t(`Already have an account?`)}
          onClick={() => {
            navigate('settings');
            cancelAuthorization && cancelAuthorization();
          }}
        />}
        <Button
          activeOnEnter
          icon='user-plus'
          isDisabled={!isSecondStepValid}
          isBusy={isBusy}
          label={t('Sign Up')}
          onClick={_onCommit}
        />
      </Modal.Actions>
    </StyledModal>
  );
}

const StyledModal = styled(Modal)`
  .accounts--Creator-advanced {
    margin-top: 1rem;
    overflow: visible;
  }

  .ui--CopyButton.copyMoved {
    position: absolute;
    right: 9.25rem;
    top: 1.15rem;
  }

  && .TextAreaWithDropdown {
    textarea {
      width: 80%;
    }
    .ui.buttons {
      width: 20%;
    }
  }

  .saveToggle {
    text-align: right;

    .ui--Checkbox {
      margin: 0.8rem 0;

      > label {
        font-weight: var(--font-weight-normal);
      }
    }
  }
`;
export default React.memo(Create);
