// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';

import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';

import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import Create from './Create';
import Edit from './Edit';
import useIpfsFactory from './use-ipfs-factory.js'
export { useCounter };

const HIDDEN_ACC = ['vanity'];

function AccountsApp ({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { hasAccounts } = useAccounts();
  const { isIpfs } = useIpfs();
  const { ipfs, ipfsInitError } = useIpfsFactory({ commands: ['id'] })

  const tabsRef = useRef([
    {
      isRoot: true,
      name: 'browse',
      text: t('Browse')
    },
    {
      name: 'create',
      text: t('Create')
    }
  ]);

  return (
    <main className='accounts--App'>
      <Tabs
        basePath={basePath}
        hidden={(hasAccounts && !isIpfs) ? undefined : HIDDEN_ACC}
        items={tabsRef.current}
      />
      <Routes>
        <Route path={basePath}>
          <Route
            element={
              <Create onStatusChange={onStatusChange} ipfs={ipfs} />
            }
            path='create'
          />
          <Route
            element={
              <Edit onStatusChange={onStatusChange} ipfs={ipfs} />
            }
            index
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(AccountsApp);
