// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mapConcurrent } from './concurrency.js';

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('mapConcurrent', (): void => {
  it('runs work in parallel without exceeding the configured limit and preserves result order', async (): Promise<void> => {
    let active = 0;
    let maxActive = 0;

    const results = await mapConcurrent([30, 5, 20, 1], 2, async (milliseconds, index) => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(milliseconds);
      active--;

      return index;
    });

    assert.deepEqual(results, [0, 1, 2, 3]);
    assert.equal(maxActive, 2);
  });

  it('rejects invalid concurrency values', async (): Promise<void> => {
    await assert.rejects(mapConcurrent([1], 0, async (value) => value));
  });

  it('does not start additional queued work after a worker fails', async (): Promise<void> => {
    const started: number[] = [];

    await assert.rejects(mapConcurrent([0, 1, 2, 3, 4], 2, async (value) => {
      started.push(value);

      if (value === 1) {
        throw new Error('boom');
      }

      await delay(10);

      return value;
    }), /boom/);

    assert.deepEqual(started.sort((a, b) => a - b), [0, 1]);
  });
});
