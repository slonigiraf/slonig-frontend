// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { getTikzRenderConcurrency } from './tikzConcurrency.js';

describe('TikZ render concurrency', (): void => {
  it('uses two renders per reported logical CPU', (): void => {
    assert.equal(getTikzRenderConcurrency(1), 2);
    assert.equal(getTikzRenderConcurrency(2), 4);
    assert.equal(getTikzRenderConcurrency(4), 8);
    assert.equal(getTikzRenderConcurrency(8), 16);
    assert.equal(getTikzRenderConcurrency(16), 32);
    assert.equal(getTikzRenderConcurrency(64), 128);
  });

  it('floors fractional reported CPU values before doubling', (): void => {
    assert.equal(getTikzRenderConcurrency(3.9), 6);
  });

  it('falls back safely when the browser does not report CPU capacity', (): void => {
    assert.equal(getTikzRenderConcurrency(Number.NaN), 8);
  });
});
