// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { createRequestGate, OPENROUTER_CONCURRENCY } from './openRouterConcurrency.js';

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

describe('OpenRouter request gate', (): void => {
  it('uses one app-wide twenty-request concurrency limit', (): void => {
    assert.equal(OPENROUTER_CONCURRENCY, 100);
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

  it('retries retryable OpenRouter failures through the shared gate', async (): Promise<void> => {
    const gate = createRequestGate(1);
    let attempts = 0;

    const result = await gate.run(async () => {
      attempts++;

      if (attempts < 3) {
        const error = Object.assign(new Error('rate limited'), {
          headers: { get: () => '0' },
          status: 429
        });

        throw error;
      }

      return 'ok';
    });

    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
  });

  it('drops an aborted queued request before it starts', async (): Promise<void> => {
    const gate = createRequestGate(1);
    let releaseFirst: (() => void) | undefined;
    const firstBlocked = new Promise<void>((resolve) => { releaseFirst = resolve; });
    const first = gate.run(async () => {
      await firstBlocked;
      return 'first';
    });
    const controller = new AbortController();
    let secondStarted = false;
    const second = gate.run(async () => {
      secondStarted = true;
      return 'second';
    }, { signal: controller.signal });

    controller.abort();
    await assert.rejects(second, (error: unknown) => error instanceof DOMException && error.name === 'AbortError');
    assert.equal(secondStarted, false);

    releaseFirst?.();
    await first;
  });
});
