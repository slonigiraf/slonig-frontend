// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SettingsStruct } from '@polkadot/ui-settings/types';

import React, { useCallback, useMemo, useState } from 'react';

import { createLanguages } from '@polkadot/apps-config';
import { settings } from '@polkadot/ui-settings';
import { styled } from '@polkadot/react-components';

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
    <Container className={`language--selector ${className}`}>
      {translateLanguages.slice(1).map(({ text, value }) => (
        <StyledDiv
          key={value}
          className={value === currentLang ? 'isActive' : ''}
          onClick={() => onSelectLang(value as string)}
        >
          {text}
        </StyledDiv>
      ))}
    </Container>
  );
}

const Container = styled.div`
  margin-top: 40px;
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
`;

const StyledDiv = styled.div`
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  border: 1px solid transparent;
  white-space: nowrap;
  color: #aaa; /* light grey text */

  &.isActive {
    border-color: #999;
    text-decoration: underline;
  }
`;

export default React.memo(LanguageSelector);