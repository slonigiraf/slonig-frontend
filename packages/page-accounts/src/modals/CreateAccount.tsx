// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ActionStatus } from '@polkadot/react-components/Status/types';
import type { AddressState, CreateOptions, CreateProps, PairType, SeedType } from '../types.js';

import React, { useCallback, useState } from 'react';

import { DEV_PHRASE } from '@polkadot/keyring/defaults';
import { Button, styled } from '@polkadot/react-components';
import { useApi, useToggle } from '@polkadot/react-hooks';
import { keyring } from '@polkadot/ui-keyring';
import { nextTick, u8aToHex } from '@polkadot/util';
import { hdLedger, mnemonicGenerate, randomAsU8a } from '@polkadot/util-crypto';

import { useTranslation } from '../translate.js';
import { tryCreateAccount } from '../util.js';
import CreateAccountInputs from './CreateAccountInputs.js';
import { storeSetting, SettingKey } from '@slonigiraf/db';
import { useLocation } from 'react-router-dom';
import { Confirmation, DBImport, useInfo, useLog } from '@slonigiraf/slonig-components';
import { LanguageSelector } from '@polkadot/app-settings';
import RestoringProgress from './RestoringProgress.js';

const DEFAULT_PAIR_TYPE = 'sr25519';

function getSuri(seed: string, derivePath: string, pairType: PairType): string {
  return pairType === 'ed25519-ledger'
    ? u8aToHex(hdLedger(seed, derivePath).secretKey.slice(0, 32))
    : pairType === 'ethereum'
      ? `${seed}/${derivePath}`
      : `${seed}${derivePath}`;
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

function createAccount(seed: string, derivePath: string, pairType: PairType, { genesisHash, name, tags = [] }: CreateOptions, password: string, success: string): ActionStatus {
  const commitAccount = () =>
    keyring.addUri(getSuri(seed, derivePath, pairType), password, { genesisHash, isHardware: false, name, tags }, pairType === 'ed25519-ledger' ? 'ed25519' : pairType);

  return tryCreateAccount(commitAccount, success);
}

function Create({ className = '', onClose, onStatusChange, seed: propsSeed, type: propsType, isFirstScreen = true }: CreateProps): React.ReactElement<CreateProps> {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { api, isDevelopment } = useApi();
  const [{ address, derivePath, deriveValidation, isSeedValid, pairType, seed }] = useState<AddressState>(() => generateSeed(
    propsSeed,
    '',
    propsSeed ? 'raw' : 'bip',
    propsType
  ));

  const [isBusy, setIsBusy] = useState(false);
  const [{ isNameValid, name }, setName] = useState(() => ({ isNameValid: false, name: '' }));
  const password = 'password'; // Intentionally don't use passwords
  const isValid = !!address && !deriveValidation?.error && isSeedValid && isNameValid;
  const { showInfo } = useInfo();
  const [isImporting, toggleImporting] = useToggle();
  const { logEvent } = useLog();
  const [createNewConfirmationOpen, setCreateNewConfirmationOpen] = useState(false);
  const [isRestoringInProgress, setIsRestoringInProgress] = useState(false);

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
          logEvent('AUTHENTICATION', 'SIGN_UP_SUCCESS');
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
        {isImporting ? <DBImport onFileSelect={() => setIsRestoringInProgress(true)} onRestoreResult={() => setIsRestoringInProgress(false)} /> :
          <CreateAccountInputs
            isFirstScreen={isFirstScreen}
            name={{ isNameValid, name }}
            onCommit={() => { }}
            setName={setName}
            setPassword={() => { }}
          />
        }
      </div>

      {isImporting && <ButtonContainer>
        <Button
          label={t('<< Back')}
          onClick={() => {
            logEvent('AUTHENTICATION', 'CLICK_BACK_AUTH_BUTTON');
            toggleImporting();
          }}
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
            onClick={() => {
              logEvent('AUTHENTICATION', 'CLICK_START_SLONIG');
              setCreateNewConfirmationOpen(true);
            }}
          />
          {isFirstScreen && <Button
            label={t('Already have an account?')}
            onClick={() => {
              logEvent('AUTHENTICATION', 'CLICK_ALREADY_HAVE_ACCOUNT');
              toggleImporting();
            }}
          />}
        </ButtonContainer>
      }
      {isFirstScreen && <a href='https://slonig.org/privacy-policy'>{t('Slonig privacy policy')}</a>}
      {isFirstScreen && <LanguageSelector />}
      {createNewConfirmationOpen && <Confirmation question={t('First time here?')}
        onClose={() => {
          logEvent('AUTHENTICATION', 'CLICK_NOT_FIRST_TIME');
          setCreateNewConfirmationOpen(false);
          toggleImporting();
        }}
        onConfirm={() => {
          logEvent('AUTHENTICATION', 'CLICK_FIRST_TIME');
          setCreateNewConfirmationOpen(false);
          _onCommit();
        }} />}
      {isRestoringInProgress && <RestoringProgress />}
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
