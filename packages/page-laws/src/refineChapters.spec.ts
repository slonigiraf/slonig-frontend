// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BookConcept } from '@slonigiraf/db';

import { conceptsForRefinementChapter, hasPersistedRefinedConceptMembership, parseRefinedChapterGroups, refinedChapterSplitPages, refineChapterPrompt } from './refineChapters.js';

describe('refine chapters', (): void => {
  it('requires thematic contiguous clustering without changing concept order', (): void => {
    const prompt = refineChapterPrompt('Fractions', [
      { bookPage: [1, 8], description: 'A fraction names equal parts of a whole.', title: 'Fractions' },
      { bookPage: [1, 3], description: 'A denominator tells how many equal parts form the whole.', title: 'Denominator' }
    ], 4, 'en-math', 'en', 10);

    assert.match(prompt, /ALREADY in their intended pedagogical\/ZPD order/);
    assert.match(prompt, /NEVER reorder concepts/);
    assert.match(prompt, /contiguous slice/);
    assert.match(prompt, /aim for about 8-12 concepts per output chapter/);
    assert.match(prompt, /chapter sizes are as even as practical/);
    assert.match(prompt, /Avoid results where one chapter is much smaller or larger/);
    assert.match(prompt, /specific theme/);
    assert.match(prompt, /sourcePage is informational only/);
    assert.match(prompt, /exactly one original chapter/);
    assert.match(prompt, /Never combine, compare, interleave, or reorder concepts with concepts from another chapter/);
  });


  it('isolates ordering and clustering to one old chapter before sorting by display order', (): void => {
    const concept = (id: number, chapterId: number, displayOrder: number, title: string): BookConcept => ({
      bookPage: [1, chapterId],
      chapterId,
      description: title,
      displayOrder,
      id,
      title
    } as BookConcept);
    const inventory = [
      concept(1, 10, 2, 'A2'),
      concept(2, 20, 1, 'B1'),
      concept(3, 10, 1, 'A1'),
      concept(4, 20, 2, 'B2')
    ];

    assert.deepEqual(conceptsForRefinementChapter(inventory, { chapterId: 10, pageNumbers: [10, 11] }).map(({ title }) => title), ['A1', 'A2']);
    assert.deepEqual(conceptsForRefinementChapter(inventory, { chapterId: 20, pageNumbers: [20, 21] }).map(({ title }) => title), ['B1', 'B2']);
  });

  it('verifies refined membership on the original concept ids', (): void => {
    const persisted = { bookPage: [1, 4], chapterId: 22, description: 'Arrays arrange objects in rows and columns.', displayOrder: 0, id: 10, title: 'Arrays' } as BookConcept;

    assert.equal(hasPersistedRefinedConceptMembership([
      { chapterId: 22, conceptId: 10, displayOrder: 0 }
    ], [persisted]), true);
    assert.equal(hasPersistedRefinedConceptMembership([
      { chapterId: 22, conceptId: 10, displayOrder: 0 }
    ], [{ ...persisted, chapterId: 21 }]), false);
    assert.equal(hasPersistedRefinedConceptMembership([
      { chapterId: 22, conceptId: 10, displayOrder: 0 }
    ], [{ ...persisted, id: 99 }]), false);
  });

  it('accepts one, two, or three contiguous groups that preserve the full order', (): void => {
    assert.deepEqual(parseRefinedChapterGroups('{"chapters":[{"title":"A","conceptIndexes":[0,1]},{"title":"B","conceptIndexes":[2,3]}]}', 4, 3), {
      chapters: [
        { conceptIndexes: [0, 1], title: 'A' },
        { conceptIndexes: [2, 3], title: 'B' }
      ]
    });
  });

  it('rejects any grouping that reorders, skips, duplicates, or exceeds available chapter anchors', (): void => {
    assert.throws(() => parseRefinedChapterGroups('{"chapters":[{"title":"A","conceptIndexes":[0,2]},{"title":"B","conceptIndexes":[1,3]}]}', 4, 3), /invalid Refine Chapters data/);
    assert.throws(() => parseRefinedChapterGroups('{"chapters":[{"title":"A","conceptIndexes":[0,1]},{"title":"B","conceptIndexes":[1,2,3]}]}', 4, 3), /invalid Refine Chapters data/);
    assert.throws(() => parseRefinedChapterGroups('{"chapters":[{"title":"A","conceptIndexes":[0]},{"title":"B","conceptIndexes":[1]},{"title":"C","conceptIndexes":[2]},{"title":"D","conceptIndexes":[3]}]}', 4, 5), /invalid Refine Chapters data/);
    assert.throws(() => parseRefinedChapterGroups('{"chapters":[{"title":"A","conceptIndexes":[0,1]},{"title":"B","conceptIndexes":[2,3]}]}', 4, 1), /invalid Refine Chapters data/);
  });

  it('allows an empty chapter only as an empty result', (): void => {
    assert.deepEqual(parseRefinedChapterGroups('{"chapters":[]}', 0, 0), { chapters: [] });
    assert.throws(() => parseRefinedChapterGroups('{"chapters":[{"title":"A","conceptIndexes":[]}]}', 0, 1), /invalid Refine Chapters data/);
  });

  it('chooses increasing page anchors while keeping every resulting chapter non-empty', (): void => {
    assert.deepEqual(refinedChapterSplitPages([10, 11, 12, 13, 14, 15], [7, 8]), [13]);
    assert.deepEqual(refinedChapterSplitPages([10, 11, 12], [7, 7, 7]), [11, 12]);
    assert.equal(refinedChapterSplitPages([10, 11], [7, 7, 7]), undefined);
  });
});
