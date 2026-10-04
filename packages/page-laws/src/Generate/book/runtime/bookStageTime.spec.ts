// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { addBookStageTime, clearBookStageTimes, formatBookStageTime, loadBookStageTimes } from './bookStageTime.js';

describe('Book stage timing', (): void => {
  it('accumulates repeated runs for the same stage', (): void => {
    const bookId = 991_338;

    clearBookStageTimes(bookId);
    addBookStageTime(bookId, 'concepts', 1_250);
    addBookStageTime(bookId, 'concepts', 2_750);
    addBookStageTime(bookId, 'exercises', 500);

    const times = loadBookStageTimes(bookId);

    assert.equal(times.concepts, 4_000);
    assert.equal(times.exercises, 500);

    clearBookStageTimes(bookId);
  });

  it('formats accumulated wall-clock time compactly', (): void => {
    assert.equal(formatBookStageTime(0), '0s');
    assert.equal(formatBookStageTime(500), '<1s');
    assert.equal(formatBookStageTime(65_000), '1m 5s');
    assert.equal(formatBookStageTime(3_665_000), '1h 1m 5s');
  });
});
