// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { clearFixConceptsChapterStatuses, failedFixConceptChapterKeys, fixConceptsChapterKey, loadFixConceptsChapterStatuses, storeFixConceptsChapterStatuses } from './fixConceptsProgress.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('Fix concepts chapter progress', (): void => {
  it('uses chapter identity and page range for a stable progress key', (): void => {
    assert.equal(fixConceptsChapterKey({ chapterId: 7, pageNumbers: [12, 13], title: 'Fractions' }), '7:Fractions:12,13');
  });

  it('persists fixed and failed chapter statuses across IndexedDB reads and clears them', async (): Promise<void> => {
    const bookId = 991_337;
    const fixedChapter = { chapterId: 1, pageNumbers: [1, 2], title: 'One' };
    const failedChapter = { chapterId: 2, pageNumbers: [3, 4], title: 'Two' };

    await clearFixConceptsChapterStatuses(bookId);
    await storeFixConceptsChapterStatuses(bookId, {
      [fixConceptsChapterKey(fixedChapter)]: 'fixed',
      [fixConceptsChapterKey(failedChapter)]: 'failed',
      junk: 'invalid' as 'failed'
    });

    const statuses = await loadFixConceptsChapterStatuses(bookId);

    assert.equal(statuses[fixConceptsChapterKey(fixedChapter)], 'fixed');
    assert.equal(statuses[fixConceptsChapterKey(failedChapter)], 'failed');
    assert.equal(statuses.junk, undefined);
    assert.deepEqual(await failedFixConceptChapterKeys(bookId, [fixedChapter, failedChapter]), new Set([fixConceptsChapterKey(failedChapter)]));

    await clearFixConceptsChapterStatuses(bookId);
    assert.deepEqual(await loadFixConceptsChapterStatuses(bookId), {});
  });
});
