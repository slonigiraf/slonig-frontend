// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';
import { completeBookProcessingStage, createBook, deleteBook, isBookProcessingStageComplete, isBookProcessingStageSatisfied } from '@slonigiraf/db';

import { bookProcessingManager } from './bookProcessingManager.js';
import { skipBookStage } from './skipBookStage.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('stage price-confirmation skip', (): void => {
  it('records a manual bypass without writing a false success checkpoint', async (): Promise<void> => {
    const id = await createBook({ contentHash: `manual-skip-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'Manual skip', opfsName: 'skip.pdf', size: 1 });

    try {
      const updated = await skipBookStage(id, 'deduplicateConcepts');

      assert.equal(isBookProcessingStageSatisfied(updated, 'deduplicateConcepts'), true);
      assert.equal(isBookProcessingStageComplete(updated, 'deduplicateConcepts'), false);
    } finally {
      bookProcessingManager.forget(id);
      await deleteBook(id);
    }
  });

  it('continues a failed Fast Forward run when Skip acknowledges that failed stage', async (): Promise<void> => {
    const id = await createBook({ contentHash: `fast-forward-skip-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'Failed skip', opfsName: 'failed.pdf', size: 1 });

    try {
      await bookProcessingManager.startFastForward(id, ['deduplicateConcepts', 'sortConcepts'], false,
        { generation: 'g', embedding: 'e', standards: 's' });
      bookProcessingManager.fail(id, 'Deduplicate review could not be saved.');
      const updated = await skipBookStage(id, 'deduplicateConcepts');

      assert.equal(isBookProcessingStageComplete(updated, 'deduplicateConcepts'), false);
      assert.equal(isBookProcessingStageSatisfied(updated, 'deduplicateConcepts'), true);
      assert.equal(bookProcessingManager.getSnapshot(id)?.status, 'running');
      assert.equal(bookProcessingManager.getSnapshot(id)?.currentStage, 'sortConcepts');
      assert.deepEqual(bookProcessingManager.getSnapshot(id)?.bypassedStages, ['deduplicateConcepts']);

      // A later successful retry must remove the bypass marker and store success.
      const completed = await completeBookProcessingStage(id, 'deduplicateConcepts');

      assert.ok(completed);
      assert.equal(isBookProcessingStageComplete(completed!, 'deduplicateConcepts'), true);
      assert.equal(isBookProcessingStageSatisfied(completed!, 'deduplicateConcepts'), true);
      assert.equal(completed!.bypassedStages?.includes('deduplicateConcepts'), false);
    } finally {
      bookProcessingManager.cancel(id);
      bookProcessingManager.forget(id);
      await deleteBook(id);
    }
  });
});
