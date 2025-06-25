// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef } from 'react';
import { Route, Routes } from 'react-router';
import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';
import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import Learn from './Learn/index.js';
import Teach from './Teach/index.js';
import Assess from './Assess/index.js';
export { useCounter };

const HIDDEN_ACC = ['vanity'];

function DiplomasApp({ basePath }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { hasAccounts } = useAccounts();
  const { isIpfs } = useIpfs();

  const tabsRef = useRef([
    {
      isRoot: true,
      name: 'learn',
      text: t('Learn')
    },
    {
      name: 'teach',
      text: t('Teach')
    },
    {
      name: 'assess',
      text: t('Assess')
    },
  ]);

  return (
    <main className='badges--App'>
      <Tabs
        basePath={basePath}
        hidden={(hasAccounts && !isIpfs) ? undefined : HIDDEN_ACC}
        items={tabsRef.current}
      />
      <Routes>
        <Route path={basePath}>
          <Route
            element={
              <Learn />
            }
            index
          />
          <Route
            element={
              <Teach />
            }
            path='teach'
          />
          <Route
            element={
              <Assess />
            }
            path='assess'
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(DiplomasApp);
