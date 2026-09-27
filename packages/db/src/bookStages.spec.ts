// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Book } from './db/Book.js';

import { BOOK_PROCESSING_STAGES, getBookCompletedStages, withBookProcessingStagesResetFrom, withCompletedBookProcessingStage } from './db/Book.js';

function book (overrides: Partial<Book> = {}): Book {
  return {
    contentHash: 'hash',
    created: 1,
    id: 1,
    name: 'Book',
    opfsName: 'book.pdf',
    size: 1,
    ...overrides
  };
}

describe('named book processing stages', (): void => {
  it('keeps completion separate from ordering so a stage can be inserted without renumbering later stages', (): void => {
    assert.deepEqual(BOOK_PROCESSING_STAGES.slice(4, 12), ['chapters', 'concepts', 'fixConcepts', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'exercises', 'fixExercises']);

    const completed = withCompletedBookProcessingStage(book({ completedStages: ['concepts', 'exercises'] }), 'refineChapters');

    assert.deepEqual(completed.completedStages, ['concepts', 'refineChapters', 'exercises']);
  });

  it('resets the selected stage and every stage after it while preserving earlier completion', (): void => {
    const reset = withBookProcessingStagesResetFrom(book({
      completedStages: ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'exercises', 'fixExercises', 'abilities']
    }), 'fixConcepts');

    assert.deepEqual(reset.completedStages, ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts']);
  });

  it('maps legacy checkpoints without pretending newly inserted concept-repair/sort stages were completed', (): void => {
    const completed = getBookCompletedStages(book({ age: 10, language: 'en', processingStage: 13, subject: 'en-math' }));

    assert.equal(completed.includes('concepts'), true);
    assert.equal(completed.includes('fixConcepts'), false);
    assert.equal(completed.includes('deduplicateConcepts'), false);
    assert.equal(completed.includes('sortConcepts'), false);
    assert.equal(completed.includes('refineChapters'), false);
    assert.equal(completed.includes('exercises'), true);
    assert.equal(completed.includes('fixStandards'), true);
  });
});
