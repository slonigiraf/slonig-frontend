// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRequestGate, OPENROUTER_CONCURRENCY } from './openRouterConcurrency.js';

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('OpenRouter request gate', (): void => {
  it('uses one four-request concurrency limit', (): void => {
    assert.equal(OPENROUTER_CONCURRENCY, 10);
  });

  it('does not allow more than the configured number of requests to run at once', async (): Promise<void> => {
    const gate = createRequestGate(2);
    let active = 0;
    let maxActive = 0;

    await Promise.all(Array.from({ length: 6 }, (_, index) => gate.run(async () => {
      active++;
      maxActive = Math.max(maxActive, active);
      await delay(5);
      active--;

      return index;
    })));

    assert.equal(maxActive, 2);
  });
});
