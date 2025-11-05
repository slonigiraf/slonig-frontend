// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SettingsStruct } from '@polkadot/ui-settings/types';

import React, { useCallback, useMemo, useState } from 'react';

import { createLanguages } from '@polkadot/apps-config';
import { settings } from '@polkadot/ui-settings';

import { useTranslation } from './translate.js';
import { saveAndReload } from './util.js';

interface LanguageSelectorProps {
  className?: string;
}

function LanguageSelector ({ className = '' }: LanguageSelectorProps): React.ReactElement<LanguageSelectorProps> {
  const { t } = useTranslation();
  const translateLanguages = useMemo(
    () => createLanguages(t),
    [t]
  );

  const [currentLang, setCurrentLang] = useState<string>(() => {
    const current = settings.get() as SettingsStruct;
    return current.i18nLang;
  });

  const onSelectLang = useCallback((value: string) => {
    const prev = settings.get() as SettingsStruct;
    const updated: SettingsStruct = { ...prev, i18nLang: value };

    setCurrentLang(value);
    saveAndReload(updated);
  }, []);

  return (
    <div className={`language-selector ${className}`} style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
      {translateLanguages.map(({ text, value }) => (
        <div
          key={value}
          onClick={() => onSelectLang(value as string)}
          style={{
            cursor: 'pointer',
            padding: '0.25rem 0.5rem',
            borderRadius: '4px',
            border: value === currentLang ? '1px solid #999' : '1px solid transparent',
            textDecoration: value === currentLang ? 'underline' : 'none',
            whiteSpace: 'nowrap'
          }}
        >
          {text}
        </div>
      ))}
    </div>
  );
}

export default React.memo(LanguageSelector);