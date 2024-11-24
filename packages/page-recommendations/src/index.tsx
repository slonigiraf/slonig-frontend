// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef } from 'react';
import { Route, Routes } from 'react-router';
import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';
import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import Tutor from './Tutor/index.js';
import Student from './Student/index.js';
import Teacher from './Teacher/index.js';
import DBImport from './Student/DBImport.js';
import DBExport from './Student/DBExport.js';
export { useCounter, DBImport, DBExport };

const HIDDEN_ACC = ['vanity'];

function DiplomasApp({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { hasAccounts } = useAccounts();
  const { isIpfs } = useIpfs();

  const tabsRef = useRef([
    {
      isRoot: true,
      name: 'student',
      text: t('Learn')
    },
    {
      name: 'tutor',
      text: t('Teach')
    },
    {
      name: 'teacher',
      text: t('Assess')
    },
  ]);

  return (
    <main className='diplomas--App'>
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
              <Tutor onStatusChange={onStatusChange} />
            }
            path='tutor'
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(DiplomasApp);
