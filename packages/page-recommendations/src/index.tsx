// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AppProps as Props } from '@polkadot/react-components/types';

import React, { useRef } from 'react';
import { Route, Routes } from 'react-router';
import { Tabs } from '@polkadot/react-components';
import { useAccounts, useIpfs } from '@polkadot/react-hooks';
import { useTranslation } from './translate.js';
import { markUsedInsurance, getLessonId, storeLesson, saveLetterKnowledgeId, getValidLettersForKnowledgeId, createAndStoreLetter, storeInsurances, storePseudonym, storeSetting, deleteSetting, getSetting } from './utils.js';
import useCounter from './useCounter.js';
import Tutor from './Tutor';
import Student from './Student';
import Teacher from './Teacher';
import DBImport from './Student/DBImport.js';
import DBExport from './Student/DBExport.js';
import type { Letter } from './db/Letter.js';
import type { Lesson } from './db/Lesson.js';
import { db } from './db/index.js';
export { markUsedInsurance, getLessonId, storeLesson, db, Letter, Lesson as Session, useCounter, DBImport, DBExport, saveLetterKnowledgeId, getValidLettersForKnowledgeId, createAndStoreLetter, storeInsurances, storePseudonym, storeSetting, deleteSetting, getSetting };

const HIDDEN_ACC = ['vanity'];

function DiplomasApp({ basePath, onStatusChange }: Props): React.ReactElement<Props> {
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
      name: 'tutor',
      text: t('Tutor')
    },
    {
      name: 'teacher',
      text: t('Teacher')
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
