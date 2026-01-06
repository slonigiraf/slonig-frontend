// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { useTranslation as useTranslationBase } from 'react-i18next';
import type { i18n as I18nType } from 'i18next';

interface TOptions {
  ns?: string;
  replace?: Record<string, unknown>;
}

export function useTranslation (): {
  t: (key: string, optionsOrText?: string | TOptions, options?: TOptions) => string;
  i18n: I18nType;
} {
  const { t, i18n } = useTranslationBase('apps');

  return { t, i18n };
}
