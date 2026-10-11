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
    assert.deepEqual(BOOK_PROCESSING_STAGES.slice(4, 12), ['chapters', 'concepts', 'fixConcepts', 'embeddings', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'abilities']);

    const completed = withCompletedBookProcessingStage(book({ completedStages: ['concepts', 'abilities'] }), 'refineChapters');

    assert.deepEqual(completed.completedStages, ['concepts', 'refineChapters', 'abilities']);
  });

  it('resets the selected stage and every stage after it while preserving earlier completion', (): void => {
    const reset = withBookProcessingStagesResetFrom(book({
      completedStages: ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts', 'embeddings', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'abilities']
    }), 'fixConcepts');

    assert.deepEqual(reset.completedStages, ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts']);

    const resetEmbeddings = withBookProcessingStagesResetFrom(book({
      completedStages: ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts', 'embeddings', 'deduplicateConcepts']
    }), 'embeddings');

    assert.deepEqual(resetEmbeddings.completedStages, ['recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts']);
  });

  it('orders question generation and QA before answer generation and QA', (): void => {
    assert.deepEqual(BOOK_PROCESSING_STAGES.slice(13), ['images', 'fixImages', 'answerImages', 'fixAnswerImages', 'standards']);

    const completedStages: Book['completedStages'] = ['images', 'fixImages', 'answerImages', 'fixAnswerImages', 'standards'];
    const reset = withBookProcessingStagesResetFrom(book({ completedStages }), 'answerImages');

    assert.deepEqual(reset.completedStages, ['images', 'fixImages']);
  });

  it('ignores unknown historical identifiers and does not infer stages from book metadata', (): void => {
    const completed = getBookCompletedStages(book({ age: 10, language: 'en', subject: 'en-math' }));

    assert.deepEqual(completed, []);
    assert.deepEqual(getBookCompletedStages(book({ completedStages: ['recognize', 'concepts', 'fixImages'] })), ['recognize', 'concepts', 'fixImages']);
  });

});
