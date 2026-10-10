// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isTikzImageQaPassed, tikzSourceVersion, type Image } from './Image.js';

const original = '\\begin{tikzpicture}\\draw (0,0)--(1,1);\\end{tikzpicture}';
const revised = '\\begin{tikzpicture}\\draw (0,0)--(2,2);\\end{tikzpicture}';

function imageWithRenderOnly (): Image {
  return { id: 123, type: 'tikz', prompt: 'Draw a diagonal line', data: original, valid: true, renderStatus: 'passed' };
}

describe('source-versioned TikZ visual QA', (): void => {
  it('does not equate a successful SVG render with a passed visual review', (): void => {
    assert.equal(isTikzImageQaPassed(imageWithRenderOnly()), false);
  });

  it('accepts only a clean vision result for the current rendered source', (): void => {
    const sourceVersion = tikzSourceVersion(original);
    const reviewed: Image = {
      ...imageWithRenderOnly(),
      sourceVersion,
      visualQaStatus: 'passed',
      detectedIssues: [],
      reviewResult: { sourceVersion, hasErrors: false, errors: [], reviewedAt: 1, attempt: 2 }
    };

    assert.equal(isTikzImageQaPassed(reviewed), true);
    assert.equal(isTikzImageQaPassed({ ...reviewed, visualQaStatus: 'failed' }), false);
    assert.equal(isTikzImageQaPassed({ ...reviewed, reviewResult: { ...reviewed.reviewResult!, hasErrors: true } }), false);
    assert.equal(isTikzImageQaPassed({ ...reviewed, detectedIssues: ['Clipped label'] }), false);
    assert.equal(isTikzImageQaPassed({ ...reviewed, renderStatus: 'failed' }), false);
    assert.equal(isTikzImageQaPassed({ ...reviewed, data: revised }), false);
  });

  it('invalidates the approval when TikZ source changes', (): void => {
    assert.notEqual(tikzSourceVersion(original), tikzSourceVersion(revised));
  });
});
