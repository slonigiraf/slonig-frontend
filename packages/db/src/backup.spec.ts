// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { shouldExportDatabaseRow } from './backup.js';

await describe('database backup filtering', async (): Promise<void> => {
  await it('excludes cache and parsed-book tables by default', (): void => {
    const excludedTables = [
      'cidCache',
      'books',
      'bookPages',
      'bookChapters',
      'bookConcepts',
      'exercises',
      'skills',
      'exerciseTemplates'
    ];

    excludedTables.forEach((tableName) => assert.equal(shouldExportDatabaseRow(tableName), false));
    assert.equal(shouldExportDatabaseRow('abilities', { moduleId: 'book-42-exercise-7' }), false);
    assert.equal(shouldExportDatabaseRow('abilities', { moduleId: 'published-module' }), true);
    assert.equal(shouldExportDatabaseRow('lessons'), true);
  });

  await it('includes every table when requested', (): void => {
    ['cidCache', 'books', 'bookPages', 'bookChapters', 'bookConcepts', 'exercises', 'skills', 'exerciseTemplates', 'lessons']
      .forEach((tableName) => assert.equal(shouldExportDatabaseRow(tableName, undefined, true), true));
    assert.equal(shouldExportDatabaseRow('abilities', { moduleId: 'book-42-exercise-7' }, true), true);
  });
});
