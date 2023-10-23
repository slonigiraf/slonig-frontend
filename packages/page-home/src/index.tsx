// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';
import React from 'react';
import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';

export { useCounter };

function SettingsApp (): React.ReactElement<Props> {
  const { t } = useTranslation();
  
  return (
    <main className='settings--App'>
      <h1>Put here buttons</h1>
    </main>
  );
}

export default React.memo(SettingsApp);
