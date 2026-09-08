// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { exerciseDisplayImages, markdownImageReferences, resolveMarkdownImageAssets, stripMarkdownImageReferences } from './bookImageRefs.js';

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

  it('keeps an existing Exercise image first and deduplicates recovered images', (): void => {
    assert.deepEqual(exerciseDisplayImages(
      { image: 'data:image/png;base64,b25l', images: ['data:image/png;base64,b25l', 'data:image/png;base64,dHdv'] },
      ['data:image/png;base64,dHdv', 'data:image/png;base64,dGhyZWU=']
    ), ['data:image/png;base64,b25l', 'data:image/png;base64,dHdv', 'data:image/png;base64,dGhyZWU=']);
  });
});
