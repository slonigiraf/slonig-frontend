// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';

import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';

import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import Referee from './Referee';
import Worker from './Worker';
import Employer from './Employer';
import useIpfsFactory from './use-ipfs-factory.js';
import DBImport from './Worker/DBImport';
import DBExport from './Worker/DBExport';
export { useCounter };
export {DBImport};
export {DBExport};

const HIDDEN_ACC = ['vanity'];

function AccountsApp ({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { hasAccounts } = useAccounts();
  const { isIpfs } = useIpfs();
  const { ipfs, ipfsInitError } = useIpfsFactory({ commands: ['id'] })

  const tabsRef = useRef([
    {
      isRoot: true,
      name: 'referee',
      text: t('Referee')
    },
    {
      name: 'worker',
      text: t('Worker')
    },
    {
      name: 'employer',
      text: t('Employer')
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
              <Employer onStatusChange={onStatusChange} ipfs={ipfs} />
            }
            path='employer'
          />
          <Route
            element={
              <Worker onStatusChange={onStatusChange} ipfs={ipfs} />
            }
            path='worker'
          />
          <Route
            element={
              <Referee onStatusChange={onStatusChange} ipfs={ipfs} />
            }
            index
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(AccountsApp);
