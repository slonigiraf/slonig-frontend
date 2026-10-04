// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertDisjointSortChapterConcepts, conceptsForSortChapter, parseSortedChapterConceptIndexes, sortChapterConceptsPrompt } from './sortConcepts.js';

describe('sort concepts', (): void => {
  it('asks for a ZPD prerequisite progression without using page order as pedagogy', (): void => {
    const prompt = sortChapterConceptsPrompt('Fractions', [
      { bookPage: [1, 8], description: 'A fraction names equal parts of a whole.', title: 'Fractions' },
      { bookPage: [1, 3], description: 'A denominator tells how many equal parts form the whole.', title: 'Denominator' }
    ], 'en-math', 'en', 10);

    assert.match(prompt, /zone of proximal development \(ZPD\)/);
    assert.match(prompt, /prerequisites/);
    assert.match(prompt, /Do not sort by source page/);
    assert.match(prompt, /exactly ONE chapter/);
    assert.match(prompt, /Never compare, interleave, or reorder these concepts together with concepts from another chapter/);
    assert.match(prompt, /"conceptIndex":0/);
    assert.match(prompt, /"sourcePage":8/);
  });



  it('isolates concepts by source chapter before applying chapter-local display order', (): void => {
    const concept = (id: number, chapterId: number, page: number, displayOrder: number, title: string): BookConcept => ({
      bookPage: [1, page],
      chapterId,
      description: title,
      displayOrder,
      id,
      title
    } as BookConcept);
    const inventory = [
      concept(1, 10, 2, 2, 'A2'),
      concept(2, 20, 3, 0, 'B1'),
      concept(3, 10, 1, 0, 'A1'),
      concept(4, 20, 4, 2, 'B2')
    ];

    assert.deepEqual(conceptsForSortChapter(inventory, { chapterId: 10, pageNumbers: [1, 2] }).map(({ title }) => title), ['A1', 'A2']);
    assert.deepEqual(conceptsForSortChapter(inventory, { chapterId: 20, pageNumbers: [3, 4] }).map(({ title }) => title), ['B1', 'B2']);
  });

  it('rejects any sort run where a concept appears in two source chapters', (): void => {
    const shared = { bookPage: [1, 1], chapterId: 10, description: 'Shared', id: 1, title: 'Shared' } as BookConcept;

    assert.throws(() => assertDisjointSortChapterConcepts([
      { chapter: { chapterId: 10, pageNumbers: [1], title: 'A' }, concepts: [shared] },
      { chapter: { chapterId: 20, pageNumbers: [2], title: 'B' }, concepts: [shared] }
    ]), /cannot be reordered together/);
  });

  it('requires a stable chapter id before persistence can reorder concepts', (): void => {
    const concept = { bookPage: [1, 1], description: 'A', id: 1, title: 'A' } as BookConcept;

    assert.throws(() => assertDisjointSortChapterConcepts([
      { chapter: { pageNumbers: [1], title: 'Legacy title-only chapter' }, concepts: [concept] }
    ]), /stable chapter id/);
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
