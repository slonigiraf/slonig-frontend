// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef, useEffect, useState } from 'react';
import { Route, Routes } from 'react-router';

import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';
import { useDeveloperSetting } from '@slonigiraf/app-slonig-components';
import { useTranslation } from './translate.js';
import useCounter from './useCounter.js';
import Create from './Create';
import Edit from './Edit';
import ItemLabel from './Edit/ItemLabel.js';
import ExerciseList from './Edit/ExerciseList.js';
export { useCounter, ItemLabel, ExerciseList };

const HIDDEN_ACC = ['vanity'];

interface Tab {
  isRoot?: boolean;
  name: string;
  text: string;
}

function TabsConfiguration(isDeveloper: boolean, t: (key: string) => string): Tab[] {
  const tabs: Tab[] = [
    {
      isRoot: true,
      name: 'browse',
      text: t('Browse')
    }
  ];

  if (isDeveloper) {
    tabs.push({
      name: 'create',
      text: t('Create')
    });
  }

  return tabs;
}

function AccountsApp({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { hasAccounts } = useAccounts();
  const { isIpfs } = useIpfs();
  const isDeveloper = useDeveloperSetting();
  const tabs = TabsConfiguration(isDeveloper, t);

  return (
    <main className='accounts--App'>
      <Tabs
        basePath={basePath}
        hidden={(hasAccounts && !isIpfs) ? undefined : HIDDEN_ACC}
        items={tabs}
      />
      <Routes>
        <Route path={basePath}>
          {isDeveloper && (
            <Route
              element={<Create onStatusChange={onStatusChange} />}
              path='create'
            />
          )}
          <Route
            element={
              <Edit onStatusChange={onStatusChange} />
            }
            index
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(AccountsApp);
