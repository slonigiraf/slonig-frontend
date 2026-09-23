// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { getTikzRenderConcurrency } from './tikzConcurrency.js';

describe('TikZ render concurrency', (): void => {
  it('keeps low-core machines conservative', (): void => {
    assert.equal(getTikzRenderConcurrency(1), 1);
    assert.equal(getTikzRenderConcurrency(2), 1);
  });

  it('keeps one core free on ordinary multi-core machines', (): void => {
    assert.equal(getTikzRenderConcurrency(4), 3);
    assert.equal(getTikzRenderConcurrency(8), 7);
  });

  it('caps very large machines to avoid flooding the browser', (): void => {
    assert.equal(getTikzRenderConcurrency(16), 8);
    assert.equal(getTikzRenderConcurrency(64), 8);
  });

  it('falls back safely when the browser does not report CPU capacity', (): void => {
    assert.equal(getTikzRenderConcurrency(Number.NaN), 3);
  });
});
