// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef } from 'react';
import { Route, Routes } from 'react-router';
import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';
import { useTranslation } from './translate.js';
import { createAndStoreLetter, storeInsurances, storePseudonym, storeSetting } from './utils.js';
import useCounter from './useCounter.js';
import Mentor from './Mentor';
import Student from './Student';
import Teacher from './Teacher';
import DBImport from './Student/DBImport.js';
import DBExport from './Student/DBExport.js';
export { useCounter, DBImport, DBExport, createAndStoreLetter, storeInsurances, storePseudonym, storeSetting };

const HIDDEN_ACC = ['vanity'];

function AccountsApp ({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { hasAccounts } = useAccounts();
  const { isIpfs } = useIpfs();

  const tabsRef = useRef([
    {
      isRoot: true,
      name: 'student',
      text: t('Student')
    },
    {
      name: 'mentor',
      text: t('Mentor')
    },
    {
      name: 'teacher',
      text: t('Teacher')
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
              <Teacher onStatusChange={onStatusChange} />
            }
            path='teacher'
          />
          <Route
            element={
              <Student onStatusChange={onStatusChange} />
            }
            index
          />
          <Route
            element={
              <Mentor onStatusChange={onStatusChange} />
            }
            path='mentor'
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(AccountsApp);
