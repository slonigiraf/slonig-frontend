// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Book } from './db/Book.js';

import { BOOK_PROCESSING_STAGES, bookStagesInvalidatedByRerun, getBookCompletedStages, withBookProcessingStagesResetFrom, withCompletedBookProcessingStage } from './db/Book.js';

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
    assert.deepEqual(BOOK_PROCESSING_STAGES.slice(4, 12), ['chapters', 'concepts', 'fixConcepts', 'embeddings', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'abilities']);

    const completed = withCompletedBookProcessingStage(book({ completedStages: ['concepts', 'abilities'] }), 'refineChapters');

    assert.deepEqual(completed.completedStages, ['concepts', 'refineChapters', 'abilities']);
  });

  it('fully resets the first six stages but preserves later outputs on safe reruns', (): void => {
    const reset = withBookProcessingStagesResetFrom(book({
      completedStages: ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts', 'embeddings', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'abilities']
    }), 'fixConcepts');

    assert.deepEqual(reset.completedStages, ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'embeddings', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'abilities']);

    const resetEmbeddings = withBookProcessingStagesResetFrom(book({
      completedStages: ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts', 'embeddings', 'deduplicateConcepts']
    }), 'embeddings');

    assert.deepEqual(resetEmbeddings.completedStages, ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts', 'deduplicateConcepts']);
  });

  it('orders question generation and QA before answer generation and QA', (): void => {
    assert.deepEqual(BOOK_PROCESSING_STAGES.slice(13), ['images', 'fixImages', 'answerImages', 'fixAnswerImages', 'standards']);

    const completedStages: Book['completedStages'] = ['images', 'fixImages', 'answerImages', 'fixAnswerImages', 'standards'];
    const reset = withBookProcessingStagesResetFrom(book({ completedStages }), 'answerImages');

    assert.deepEqual(reset.completedStages, ['images', 'fixImages', 'standards']);
  });


  it('encodes stage-specific dependencies instead of clearing every later stage', (): void => {
    assert.deepEqual(bookStagesInvalidatedByRerun('concepts'), BOOK_PROCESSING_STAGES.slice(5));
    assert.deepEqual(bookStagesInvalidatedByRerun('fixConcepts'), ['fixConcepts']);
    assert.deepEqual(bookStagesInvalidatedByRerun('embeddings'), ['embeddings']);
    assert.deepEqual(bookStagesInvalidatedByRerun('deduplicateConcepts'), ['deduplicateConcepts']);
    assert.deepEqual(bookStagesInvalidatedByRerun('sortConcepts'), ['sortConcepts']);
    assert.deepEqual(bookStagesInvalidatedByRerun('refineChapters'), ['refineChapters', 'standards']);
    assert.deepEqual(bookStagesInvalidatedByRerun('abilities'), ['abilities', 'fixAbilities', 'images', 'fixImages', 'answerImages', 'fixAnswerImages']);
    assert.deepEqual(bookStagesInvalidatedByRerun('fixAbilities'), ['fixAbilities']);
    assert.deepEqual(bookStagesInvalidatedByRerun('images'), ['images', 'fixImages', 'answerImages', 'fixAnswerImages']);
    assert.deepEqual(bookStagesInvalidatedByRerun('fixImages'), ['fixImages']);
    assert.deepEqual(bookStagesInvalidatedByRerun('answerImages'), ['answerImages', 'fixAnswerImages']);
    assert.deepEqual(bookStagesInvalidatedByRerun('fixAnswerImages'), ['fixAnswerImages']);
    assert.deepEqual(bookStagesInvalidatedByRerun('standards'), ['standards']);
  });

  it('ignores unknown historical identifiers and does not infer stages from book metadata', (): void => {
    const completed = getBookCompletedStages(book({ age: 10, language: 'en', subject: 'en-math' }));

    assert.deepEqual(completed, []);
    assert.deepEqual(getBookCompletedStages(book({ completedStages: ['recognize', 'concepts', 'fixImages'] })), ['recognize', 'concepts', 'fixImages']);
  });

});
