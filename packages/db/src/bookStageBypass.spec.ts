// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { bypassBookProcessingStage, completeBookProcessingStage, createBook, deleteBook, getBook, isBookProcessingStageComplete, isBookProcessingStageSatisfied, resetBookProcessingStagesFrom } from './index.js';

describe('persistent stage outcomes', (): void => {
  it('preserves success separately from an explicitly bypassed failure, and resets downstream bypasses', async (): Promise<void> => {
    const id = await createBook({
      contentHash: `stage-bypass-${Date.now()}-${Math.random()}`,
      created: Date.now(),
      name: 'Stage bypass test',
      opfsName: 'test.pdf',
      size: 0
    });

    try {
      await completeBookProcessingStage(id, 'concepts');
      const bypassed = await bypassBookProcessingStage(id, 'fixConcepts');

      assert.ok(bypassed);
      assert.equal(isBookProcessingStageComplete(bypassed!, 'fixConcepts'), false);
      assert.equal(isBookProcessingStageSatisfied(bypassed!, 'fixConcepts'), true);
      assert.deepEqual(bypassed!.completedStages, ['concepts']);

      await bypassBookProcessingStage(id, 'images');
      await resetBookProcessingStagesFrom(id, 'embeddings', { onlyMissing: true });
      const reset = await getBook(id);

      assert.ok(reset);
      assert.equal(isBookProcessingStageSatisfied(reset!, 'fixConcepts'), true);
      assert.equal(isBookProcessingStageSatisfied(reset!, 'images'), false);

      await completeBookProcessingStage(id, 'fixConcepts');
      const finished = await getBook(id);

      assert.ok(finished);
      assert.equal(isBookProcessingStageComplete(finished!, 'fixConcepts'), true);
      assert.equal(finished!.bypassedStages?.includes('fixConcepts'), false);
    } finally {
      await deleteBook(id);
    }
  });
});
