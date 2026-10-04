// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { batchItemsByChapter } from './chapterBatching.js';

describe('batchItemsByChapter', (): void => {
  it('never mixes items from different chapters while preserving order', (): void => {
    const batches = batchItemsByChapter([
      { chapterTitle: 'Chapter 1', items: [1, 2, 3, 4, 5, 6] },
      { chapterTitle: 'Chapter 2', items: [7, 8, 9] }
    ], 5);

    assert.deepEqual(batches, [
      { chapterTitle: 'Chapter 1', items: [1, 2, 3, 4, 5] },
      { chapterTitle: 'Chapter 1', items: [6] },
      { chapterTitle: 'Chapter 2', items: [7, 8, 9] }
    ]);
  });

  it('ignores empty chapters', (): void => {
    assert.deepEqual(batchItemsByChapter([
      { chapterTitle: 'Empty', items: [] },
      { chapterTitle: 'Used', items: [1] }
    ], 5), [{ chapterTitle: 'Used', items: [1] }]);
  });

  it('rejects invalid batch sizes', (): void => {
    assert.throws(() => batchItemsByChapter([{ chapterTitle: 'Chapter', items: [1] }], 0));
  });
});
