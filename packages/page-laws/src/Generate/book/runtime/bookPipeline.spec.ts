// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BOOK_PROCESSING_STAGES } from '@slonigiraf/db';

import { BOOK_PIPELINE_STAGES, BOOK_PRICE_STAGES, BOOK_READER_COMMAND_ACTIONS, nextBookProcessingCommand } from './bookPipeline.js';

describe('Book processing pipeline metadata', (): void => {
  it('stays aligned with the canonical database stage order', (): void => {
    assert.deepEqual(BOOK_PIPELINE_STAGES.map(({ key }) => key), BOOK_PROCESSING_STAGES);
  });

  it('keeps the existing price/fast-forward range ending at standards', (): void => {
    assert.deepEqual(
      BOOK_PRICE_STAGES.map(({ key }) => key),
      BOOK_PROCESSING_STAGES.slice(0, BOOK_PROCESSING_STAGES.indexOf('fixStandards'))
    );
  });

  it('keeps reader commands scoped to executable reader-owned stages', (): void => {
    assert.deepEqual(BOOK_READER_COMMAND_ACTIONS, [
      'recognize', 'language', 'subject', 'age', 'chapters', 'concepts', 'fixConcepts',
      'embeddings', 'deduplicateConcepts', 'sortConcepts', 'refineChapters', 'exercises', 'standards'
    ]);
  });

  it('creates a new command even when the same action is requested twice', (): void => {
    const first = nextBookProcessingCommand(undefined, 'concepts');
    const second = nextBookProcessingCommand(first, 'concepts');

    assert.deepEqual(first, { action: 'concepts', id: 1 });
    assert.deepEqual(second, { action: 'concepts', id: 2 });
  });
});
