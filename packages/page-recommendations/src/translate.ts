// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { i18n as I18nType } from 'i18next';
import { useTranslation as useTranslationBase } from 'react-i18next';

export function useTranslation (): {
  t: (key: string, options?: { replace: Record<string, unknown> }) => string;
  i18n: I18nType;
} {
  const { t, i18n } = useTranslationBase('app-recommendations');

  return { t, i18n };
}
