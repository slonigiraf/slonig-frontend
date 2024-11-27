// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SettingsStruct } from '@polkadot/ui-settings/types';

import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { createLanguages } from '@polkadot/apps-config';
import { ChainInfo } from '@polkadot/apps';
import { Button, Dropdown, Toggle } from '@polkadot/react-components';
import { settings } from '@polkadot/ui-settings';

import { useTranslation } from './translate.js';
import { save, saveAndReload } from './util.js';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';
import { clearAllData, Confirmation, DBExport, DBImport, useInfo, useLoginContext } from '@slonigiraf/app-slonig-components';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  className?: string;
}

function General({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const { isLoggedIn, currentPair } = useLoginContext();
  const [isDeveloper, setDeveloper] = useState<boolean>(false);
  // tri-state: null = nothing changed, false = no reload, true = reload required
  const [changed, setChanged] = useState<boolean | null>(null);
  const [exportSucceded, setExportSucceded] = useState(false);
  const [isDeleteConfirmOpen, toggleDeleteConfirm] = useToggle();
  const [state, setSettings] = useState((): SettingsStruct => {
    const values = settings.get();

    return { ...values, uiTheme: values.uiTheme === 'dark' ? 'dark' : 'light' };
  });

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
    const needsReload = prev.apiUrl !== state.apiUrl || prev.prefix !== state.prefix;

    setChanged(
      hasChanges
        ? needsReload
        : null
    );
  }, [state]);

  const _handleChange = useCallback(
    (key: keyof SettingsStruct) => <T extends string | number>(value: T) =>
      setSettings((state) => ({ ...state, [key]: value })),
    []
  );

  const _saveAndReload = useCallback(
    () => saveAndReload(state),
    [state]
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

      <h2>{t('Backup')}</h2>
      <div className='ui--row'>
        {isLoggedIn ?
          <DBExport onSuccess={() => setExportSucceded(true)} /> :
          <DBImport />}
      </div>

      {currentPair && <>
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

    </div>
  );
}

export default React.memo(General);
