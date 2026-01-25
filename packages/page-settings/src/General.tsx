// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SettingsStruct } from '@polkadot/ui-settings/types';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { createLanguages } from '@polkadot/apps-config';
import { ChainInfo } from '@polkadot/apps';
import { Button, Dropdown, Input, styled, Toggle } from '@polkadot/react-components';
import { settings } from '@polkadot/ui-settings';

import { useTranslation } from './translate.js';
import { save, saveAndReload } from './util.js';
import { getSetting, storeSetting, SettingKey, updateAllLessons } from '@slonigiraf/db';
import { clearAllData, Confirmation, DBExport, fetchEconomy, useBooleanSettingValue, useInfo, useLog, useLoginContext, useSettingValue } from '@slonigiraf/slonig-components';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  className?: string;
}

function General({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const { logEvent, logEconomy } = useLog();
  const currentVersion = useSettingValue(SettingKey.APP_VERSION);
  const { currentPair } = useLoginContext();
  const [openAIToken, setOpenAIToken] = useState('');
  const [isDeveloper, setDeveloper] = useState<boolean>(false);
  // tri-state: null = nothing changed, false = no reload, true = reload required
  const [changed, setChanged] = useState<boolean | null>(null);
  const [exportSucceded, setExportSucceded] = useState(false);
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();
  const [state, setSettings] = useState((): SettingsStruct => {
    const values = settings.get();
    return { ...values, uiTheme: values.uiTheme === 'dark' ? 'dark' : 'light' };
  });
  const economyNotificationTime = 10;

  const showError = (error: string) => {
    showInfo(`${t('Please notify tech support.')} ${t('Error')}: ${error}.`, 'error', economyNotificationTime);
  }

  const showNoConnectionToEconomyServerError = () => {
    showError('NO_CONNECTION_TO_THE_ECONOMY_SERVER');
  }

  const translateLanguages = useMemo(
    () => createLanguages(t),
    [t]
  );

  useEffect((): void => {
    const loadDev = async () => {
      const isDev = await getSetting(SettingKey.DEVELOPER);
      setDeveloper(isDev === 'true' ? true : false);
    };
    loadDev();
  }, []);

  useEffect((): void => {
    const prev = settings.get() as unknown as Record<string, unknown>;
    const hasChanges = Object.entries(state).some(([key, value]) => prev[key] !== value);
    const needsReload = prev.apiUrl !== state.apiUrl || prev.prefix !== state.prefix || prev.i18nLang !== state.i18nLang;

    setChanged(
      hasChanges
        ? needsReload
        : null
    );
  }, [state]);

  useEffect((): void => {
    const loadOpenAIKey = async () => {
      const key = await getSetting(SettingKey.OPENAI_TOKEN);
      key && setOpenAIToken(key);
    }
    loadOpenAIKey();
  }, []);

  const _handleChange = useCallback(
    (key: keyof SettingsStruct) => <T extends string | number>(value: T) =>
      setSettings((state) => ({ ...state, [key]: value })),
    []
  );

  const _saveAndReload = useCallback(
    () => saveAndReload(state),
    [state]
  );

  const saveOpenAIToken = useCallback(
    async (value: string) => {
      setOpenAIToken(value);
      await storeSetting(SettingKey.OPENAI_TOKEN, value)
      setChanged(true);
    },
    [setOpenAIToken]
  );

  const _resetPriceAndWarranty = useCallback(
    async () => {
      try {
        logEvent('SETTINGS', 'CLICK_RESET_TO_DEFAULT');
        await fetchEconomy(logEconomy);
        const price = await getSetting(SettingKey.DIPLOMA_PRICE);
        const warranty = await getSetting(SettingKey.DIPLOMA_WARRANTY);
        const validity = await getSetting(SettingKey.DIPLOMA_VALIDITY);
        if (price && warranty && validity) {
          updateAllLessons(price, warranty, parseInt(validity, 10));
        }
        showInfo(t('Saved'));
      } catch (error) {
        showNoConnectionToEconomyServerError();
      }
    },
    []
  );

  const _save = useCallback(
    (): void => {
      save(state);
      setChanged(null);
    },
    [state]
  );

  const saveDeveloper = useCallback(
    async (value: boolean) => {
      logEvent('SETTINGS', value ? 'CLICK_DEVELOPER_MODE_ON' : 'CLICK_DEVELOPER_MODE_OFF');
      await storeSetting(SettingKey.DEVELOPER, value ? "true" : "false");
      setDeveloper(value);
      setChanged(true);
    },
    []
  );

  const onDataRemoved = (): void => {
    showInfo(t('All data were removed.'));
    window.location.reload();
  }

  const onDateRemoveFail = (error: string): void => {
    showInfo(error);
  }

  return (
    <div className={className}>
      <h2>{t('UI options')}</h2>
      <div className='ui--row'>
        <Dropdown
          defaultValue={state.i18nLang}
          label={t('default interface language')}
          onChange={_handleChange('i18nLang')}
          options={translateLanguages}
        />
      </div>

      {isDeveloper && <div className='ui--row'>
        <Input
          autoFocus
          className='full'
          label={t('OpenAI Token')}
          onChange={saveOpenAIToken}
          value={openAIToken}
        />
      </div>}

      <div className='ui--row'>
        <Toggle
          label={t('Developer mode')}
          onChange={saveDeveloper}
          value={isDeveloper}
        />
      </div>

      <Button.Group>
        <Button
          icon='save'
          isDisabled={changed === null}
          label={
            changed
              ? t('Save & Reload')
              : t('Save')
          }
          onClick={
            changed
              ? _saveAndReload
              : _save
          }
        />
      </Button.Group>
      <h2>{t('Tutoring')}</h2>
      <div className='ui--row'>
        <Button
          icon='arrows-rotate'
          label={t('Reset settings to default')}
          onClick={_resetPriceAndWarranty}
        />
      </div>

      {currentPair && <>
        <h2>{t('Backup')}</h2>
        <div className='ui--row'>
          <DBExport onSuccess={() => setExportSucceded(true)} />
        </div>
        <h2>{t('Delete all data')}</h2>
        <div className='ui--row'>
          <p>{t('Before deleting the data, download a backup.')}</p>
        </div>
        <Button.Group>
          <Button
            icon='trash'
            isDisabled={!exportSucceded}
            label={t('Delete')}
            onClick={toggleDeleteConfirm}
          />
        </Button.Group>
      </>}
      {
        isDeleteConfirmOpen && <Confirmation
          question={t('Sure about deleting it?')}
          onClose={toggleDeleteConfirm}
          onConfirm={() => {
            toggleDeleteConfirm();
            clearAllData(onDataRemoved, onDateRemoveFail);
          }}
        />
      }

      {isDeveloper && !changed && <>
        <h2>{t('Select a network')}</h2>
        <ChainInfo />
      </>}

      {currentVersion && <Version>
        {t('Slonig Version: ') + currentVersion}
      </Version>}

    </div>
  );
}


const Version = styled.div`
  display: flex;
  width: 100%;
  justify-content: center;
  text-align: center;
  font-size: 0.75em;
  color: #b0b0b0;
  margin-top: 40px;
`;

export default React.memo(General);
