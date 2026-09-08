// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { markdownImageReferences, resolveMarkdownImageAssets, stripMarkdownImageReferences } from './bookImageRefs.js';

describe('book exercise image references', (): void => {
  it('resolves Mathpix Markdown image paths and removes the raw Markdown from display text', (): void => {
    const description = 'Compare the figures. ![](./images/first.jpg) ![] (./images/second.jpg)';
    const assets = [
      { dataUrl: 'data:image/jpeg;base64,Zmlyc3Q=', name: 'images/first.jpg' },
      { dataUrl: 'data:image/jpeg;base64,c2Vjb25k', name: 'book/images/second.jpg' }
    ];

    assert.deepEqual(markdownImageReferences(description), ['./images/first.jpg', './images/second.jpg']);
    assert.deepEqual(resolveMarkdownImageAssets(description, assets), assets);
    assert.equal(stripMarkdownImageReferences(description), 'Compare the figures.');
  });

});
