// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { backupPolicy, shouldExportDatabaseRow, shouldIncludeBackupTable } from './backup.js';

describe('full database backups', () => {
  it('includes essential, reconstructable, and cache tables', () => {
    const names = [
      'settings', 'lessons', 'abilities', 'books', 'bookPages', 'bookChapters',
      'bookConcepts', 'skills', 'exerciseTemplates', 'cidCache',
      'aiTutorStudentMessages', 'standardEmbeddings', 'conceptEmbeddings',
      'mathpixPdfJobs', 'tikzSvgCache', 'bookProcessingRuns'
    ];
    for (const name of names) {
      assert.equal(shouldExportDatabaseRow(name), true);
      assert.equal(shouldIncludeBackupTable(name), true);
    }
  });

  it('never includes transient restore staging records', () => {
    assert.equal(shouldExportDatabaseRow('backupStaging'), false);
    assert.equal(shouldIncludeBackupTable('backupStaging'), false);
    assert.equal(backupPolicy('backupStaging'), 'cache');
  });
});
