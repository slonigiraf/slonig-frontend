// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ActionStatus } from '@polkadot/react-components/Status/types';
import type { AddressState, CreateOptions, CreateProps, DeriveValidationOutput, PairType, SeedType } from '../types.js';

import React, { useCallback, useState } from 'react';

import { DEV_PHRASE } from '@polkadot/keyring/defaults';
import { Button, styled } from '@polkadot/react-components';
import { useApi, useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { isHex, nextTick, u8aToHex } from '@polkadot/util';
import { hdLedger, hdValidatePath, keyExtractSuri, mnemonicGenerate, mnemonicValidate, randomAsU8a } from '@polkadot/util-crypto';

import { useTranslation } from '../translate.js';
import { tryCreateAccount } from '../util.js';
import CreateAccountInputs from './CreateAccountInputs.js';
import { storeSetting, SettingKey } from '@slonigiraf/db';
import { useLocation } from 'react-router-dom';
import { DBImport, useInfo, useLog } from '@slonigiraf/slonig-components';
import { LanguageSelector } from '@polkadot/app-settings';

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

function Create({ className = '', onClose, onStatusChange, seed: propsSeed, type: propsType, isFirstScreen = true }: CreateProps): React.ReactElement<CreateProps> {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { api, isDevelopment } = useApi();
  const [{ address, derivePath, deriveValidation, isSeedValid, pairType, seed, seedType }, setAddress] = useState<AddressState>(() => generateSeed(
    propsSeed,
    '',
    propsSeed ? 'raw' : 'bip',
    propsType
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
  const { showInfo } = useInfo();
  const [isImporting, toggleImporting] = useToggle();
  const { logEvent } = useLog();

  const _onCommit = useCallback(
    async () => {
      if (!isValid) {
        showInfo(isFirstScreen ? t('Enter your full name') : t('Enter the account name'), 'error');
        return;
      }
      setIsBusy(true);
      nextTick(async () => {
        const options = { genesisHash: isDevelopment ? undefined : api.genesisHash.toHex(), isHardware: false, name: name.trim() };
        const status = createAccount(seed, derivePath, pairType, options, password, t('created account'));
        if (status.status === 'success' && status.account) {
          await storeSetting(SettingKey.ACCOUNT, status.account?.toString());
          logEvent('AUTHENTICATION', 'SIGN_UP');
        }
        onStatusChange(status);
        setIsBusy(false);
        onClose();
      });
    },
    [api, derivePath, isDevelopment, isValid, name, onClose, onStatusChange, pairType, password, seed, t]
  );

  return (
    <StyledDiv isFirstScreen={isFirstScreen}>
      {isFirstScreen &&
        <div style={{ display: 'flex', justifyContent: 'center', width: '80%' }}>
          <img src="./signup.png" style={{ width: '100%' }} alt="Signup" />
        </div>
      }

      {isFirstScreen && <h1 style={{ margin: '0px' }} className='prompt'>{t('Get help and badges from classmates')}</h1>}

      <div className='ui--row'>
        {isImporting ? <DBImport /> :
          <CreateAccountInputs
            isFirstScreen={isFirstScreen}
            name={{ isNameValid, name }}
            onCommit={_onCommit}
            setName={setName}
            setPassword={() => { }}
          />
        }
      </div>

      {isImporting && <ButtonContainer>
        <Button
          label={t('<< Back')}
          onClick={toggleImporting}
        />
      </ButtonContainer>}

      {!isImporting &&
        <ButtonContainer>
          <Button
            className='highlighted--button'
            activeOnEnter
            // icon='user-plus'
            isBusy={isBusy}
            label={isFirstScreen ? pathname.startsWith('/badges/teach') ? t('Start Tutoring with Slonig') : t('Start Learning with Slonig') : t('Add account')}
            onClick={_onCommit}
          />
          {isFirstScreen && <Button
            label={t('Already have an account?')}
            onClick={toggleImporting}
          />}
        </ButtonContainer>
      }
      {isFirstScreen && <a href='https://slonig.org/privacy-policy'>{t('Slonig privacy policy')}</a>}
      {isFirstScreen && <LanguageSelector />}
    </StyledDiv>
  );
}
const StyledDiv = styled.div<{ isFirstScreen: boolean }>`
  display: flex;
  justify-content: center;
  align-items: center;
  ${(props) => props.isFirstScreen && 'min-height: 100dvh;'}
  text-align: center;
  flex-direction: column;
  
  gap: 15px;

  @media only screen and (max-width: 430px) {
    width: 100%;
  }
  @media only screen and (min-width: 431px) {
    width: 400px;
  }

  .ui--Button {
    width: 80%;
  }
  .ui--row {
    width: 80%;
  }

  .accounts--Creator-advanced {
    margin-top: 1rem;
    overflow: visible;
  }

  .ui--Labelled:not(.isSmall) {    
    padding-left: 0 !important;
  }

  label {
    left: 0 !important;
    text-align: center !important;
  }

  input {
    left: 0 !important;
    text-align: center !important;
  }

  a {
    color: grey !important;
  }

`;

const ButtonContainer = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  text-align: center;
  flex-direction: column;
  gap: 15px;
`;

export default React.memo(Create);
