// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';
import React from 'react';
import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import { DBImport } from '@slonigiraf/app-recommendations';
import { DBExport } from '@slonigiraf/app-recommendations';
export { useCounter };

function HomeApp(): React.ReactElement<Props> {
  const { t } = useTranslation();
  
  return (
    <main className='settings--App'>
      <div className='ui--row'>
        <DBExport/>
        <DBImport/>
      </div>
    </main>
  );
}

export default React.memo(HomeApp);
