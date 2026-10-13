// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapWithConcurrency } from './mapWithConcurrency.js';

describe('book skill publishing concurrency', (): void => {
  it('runs at most 20 skills simultaneously and preserves their order', async (): Promise<void> => {
    const items = Array.from({ length: 240 }, (_, index) => index);
    let active = 0;
    let peak = 0;

    const results = await mapWithConcurrency(items, 20, async (item) => {
      active++;
      peak = Math.max(peak, active);
      await Promise.resolve();
      active--;

      return item * 2;
    });

    assert.equal(peak, 20);
    assert.equal(active, 0);
    assert.deepEqual(results, items.map((item) => item * 2));
  });

  it('does not start more tasks after an error and waits for active tasks to finish', async (): Promise<void> => {
    const started: number[] = [];
    let finishActive: (() => void) | undefined;
    let activeFinished = false;
    const publishing = mapWithConcurrency([0, 1, 2, 3], 2, async (item) => {
      started.push(item);

      if (item === 0) {
        throw new Error('IPFS pinning failed');
      }

      if (item === 1) {
        await new Promise<void>((resolve) => { finishActive = resolve; });
        activeFinished = true;
      }

      return item;
    });

    await Promise.resolve();
    assert.deepEqual(started, [0, 1]);
    assert.ok(finishActive);
    finishActive();

    await assert.rejects(publishing, /IPFS pinning failed/);
    assert.equal(activeFinished, true);
    assert.deepEqual(started, [0, 1]);
  });

  it('handles empty inputs and rejects invalid concurrency', async (): Promise<void> => {
    assert.deepEqual(await mapWithConcurrency([], 20, async (item) => item), []);
    await assert.rejects(mapWithConcurrency([1], 0, async (item) => item), RangeError);
  });
});
