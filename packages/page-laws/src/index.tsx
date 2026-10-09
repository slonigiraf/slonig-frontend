// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';
import type { ExerciseListLocation } from './Edit/ExerciseList.js';

import { SettingKey } from '@slonigiraf/db';
import { useSettingValue } from '@slonigiraf/slonig-components';
import React, { useMemo, useRef } from 'react';
import { Route, Routes } from 'react-router';

import { Tabs } from '@polkadot/react-components';

import Create from './Create/index.js';
import ExerciseList from './Edit/ExerciseList.js';
import Edit from './Edit/index.js';
import ItemLabel from './Edit/ItemLabel.js';
import { useTranslation } from './common/translate.js';
import Generate from './Generate/index.js';
import useCounter from './common/useCounter.js';

export { ExerciseList, type ExerciseListLocation, ItemLabel, useCounter };

function LawsApp ({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  // The developer setting is loaded asynchronously. Do not mount Tabs while it
  // is unknown: Tabs redirects hidden subroutes to /knowledge on mount.
  const developerSetting = useSettingValue(SettingKey.DEVELOPER);
  const isDeveloper = developerSetting === 'true';

  const tabsRef = useRef([
    {
      isRoot: true,
      name: 'browse',
      text: t('Browse')
    },
    {
      name: 'create',
      text: t('Create')
    },
    {
      name: 'generate',
      text: t('Generate')
    }
  ]);

  const hidden = useMemo(
    () => isDeveloper
      ? []
      : ['create', 'generate'],
    [isDeveloper]
  );

  return (
    <main className='laws--App'>
      {developerSetting !== null && <Tabs
        basePath={basePath}
        hidden={hidden}
        items={tabsRef.current}
      />}
      <Routes>
        <Route path={basePath}>
          {isDeveloper && (
            <Route
              element={<Create />}
              path='create'
            />
          )}
          {isDeveloper && (
            <Route
              element={<Generate />}
              path='generate'
            />
          )}
          <Route
            element={
              <Edit />
            }
            index
          />
        </Route>
      </Routes>
    </main>
  );
}

export default React.memo(LawsApp);
