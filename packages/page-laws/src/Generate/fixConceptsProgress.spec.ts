// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { clearFixConceptsChapterStatuses, failedFixConceptChapterKeys, fixConceptsChapterKey, loadFixConceptsChapterStatuses, setFixConceptsChapterStatus } from './fixConceptsProgress.js';

describe('Fix concepts chapter progress', (): void => {
  it('uses chapter identity and page range for a stable progress key', (): void => {
    assert.equal(fixConceptsChapterKey({ chapterId: 7, pageNumbers: [12, 13], title: 'Fractions' }), '7:Fractions:12,13');
  });

  it('tracks fixed and failed chapters independently for selective retries', (): void => {
    const bookId = 991_337;
    const fixedChapter = { chapterId: 1, pageNumbers: [1, 2], title: 'One' };
    const failedChapter = { chapterId: 2, pageNumbers: [3, 4], title: 'Two' };

    clearFixConceptsChapterStatuses(bookId);
    setFixConceptsChapterStatus(bookId, fixedChapter, 'fixed');
    setFixConceptsChapterStatus(bookId, failedChapter, 'failed');

    const statuses = loadFixConceptsChapterStatuses(bookId);

    assert.equal(statuses[fixConceptsChapterKey(fixedChapter)], 'fixed');
    assert.equal(statuses[fixConceptsChapterKey(failedChapter)], 'failed');
    assert.deepEqual(failedFixConceptChapterKeys(bookId, [fixedChapter, failedChapter]), new Set([fixConceptsChapterKey(failedChapter)]));

    clearFixConceptsChapterStatuses(bookId);
  });
});
