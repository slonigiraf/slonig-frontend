// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { nextStoredTikzValidity, shouldSkipStoredTikzCompile } from './tikzValidation.js';

describe('TikZ persisted validation', (): void => {
  it('skips an unchanged source already marked invalid', (): void => {
    assert.equal(shouldSkipStoredTikzCompile('\\begin{tikzpicture}x\\end{tikzpicture}', false, '\\begin{tikzpicture}x\\end{tikzpicture}'), true);
  });

  it('retries as soon as the stored data changes', (): void => {
    assert.equal(shouldSkipStoredTikzCompile('old', false, 'new'), false);
    assert.equal(shouldSkipStoredTikzCompile('old ', false, 'old'), false);
  });

  it('does not suppress sources that have not failed', (): void => {
    assert.equal(shouldSkipStoredTikzCompile('same', undefined, 'same'), false);
    assert.equal(shouldSkipStoredTikzCompile('same', true, 'same'), false);
  });

  it('makes invalid sticky for the exact same source', (): void => {
    assert.equal(nextStoredTikzValidity('same', false, 'same', false), undefined);
    assert.equal(nextStoredTikzValidity('same', false, 'same', true), undefined);
  });

  it('ignores stale render results after data changes', (): void => {
    assert.equal(nextStoredTikzValidity('new', undefined, 'old', true), undefined);
    assert.equal(nextStoredTikzValidity('new', true, 'old', false), undefined);
  });

  it('persists first success or failure for the current source', (): void => {
    assert.equal(nextStoredTikzValidity('same', undefined, 'same', false), true);
    assert.equal(nextStoredTikzValidity('same', true, 'same', true), false);
  });
});
