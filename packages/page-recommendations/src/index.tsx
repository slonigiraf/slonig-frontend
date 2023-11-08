// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef } from 'react';
import { Route, Routes } from 'react-router';
import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';
import { useTranslation } from './translate.js';
import { createAndStoreLetter } from './utils';
import useCounter from './useCounter.js';
import Referee from './Referee';
import Worker from './Worker';
import Employer from './Employer';
import DBImport from './Worker/DBImport';
import DBExport from './Worker/DBExport';
export { useCounter };
export {DBImport};
export {DBExport};
export {createAndStoreLetter};

const HIDDEN_ACC = ['vanity'];

function AccountsApp ({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { hasAccounts } = useAccounts();
  const { isIpfs } = useIpfs();

  const tabsRef = useRef([
    {
      isRoot: true,
      name: 'my',
      text: t('Student')
    },
    {
      name: 'validate',
      text: t('Teacher')
    },
    {
      name: 'issue',
      text: t('Mentor')
    },
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
              <Employer onStatusChange={onStatusChange} />
            }
            path='validate'
          />
          <Route
            element={
              <Worker onStatusChange={onStatusChange} />
            }
            index
          />
          <Route
            element={
              <Referee onStatusChange={onStatusChange} />
            }
            path='issue'
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(AccountsApp);
