// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSortedChapterConceptIndexes, sortChapterConceptsPrompt } from './sortConcepts.js';

describe('sort concepts', (): void => {
  it('asks for a ZPD prerequisite progression without using page order as pedagogy', (): void => {
    const prompt = sortChapterConceptsPrompt('Fractions', [
      { bookPage: [1, 8], description: 'A fraction names equal parts of a whole.', title: 'Fractions' },
      { bookPage: [1, 3], description: 'A denominator tells how many equal parts form the whole.', title: 'Denominator' }
    ], 'en-math', 'en', 10);

    assert.match(prompt, /zone of proximal development \(ZPD\)/);
    assert.match(prompt, /prerequisites/);
    assert.match(prompt, /Do not sort by source page/);
    assert.match(prompt, /"conceptIndex":0/);
    assert.match(prompt, /"sourcePage":8/);
  });

  it('accepts a complete permutation', (): void => {
    assert.deepEqual(parseSortedChapterConceptIndexes('{"conceptIndexes":[2,0,1]}', 3), { conceptIndexes: [2, 0, 1] });
  });

  it('rejects missing, duplicate, out-of-range, or malformed indexes', (): void => {
    assert.throws(() => parseSortedChapterConceptIndexes('{"conceptIndexes":[0,1]}', 3), /invalid Sort Concepts data/);
    assert.throws(() => parseSortedChapterConceptIndexes('{"conceptIndexes":[0,1,1]}', 3), /invalid Sort Concepts data/);
    assert.throws(() => parseSortedChapterConceptIndexes('{"conceptIndexes":[0,1,3]}', 3), /invalid Sort Concepts data/);
    assert.throws(() => parseSortedChapterConceptIndexes('{"items":[0,1,2]}', 3), /invalid Sort Concepts data/);
  });

  it('allows an empty chapter', (): void => {
    assert.deepEqual(parseSortedChapterConceptIndexes('{"conceptIndexes":[]}', 0), { conceptIndexes: [] });
  });
});
