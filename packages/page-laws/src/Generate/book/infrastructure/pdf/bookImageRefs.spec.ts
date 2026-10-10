// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { markdownImageReferences, stripMarkdownImageReferences } from './bookImageRefs.js';

describe('book exercise image references', (): void => {
  it('parses image references and strips them from display text', (): void => {
    const description = 'Compare the figures. ![](./images/first.jpg) ![] (./images/second.jpg)';

    assert.deepEqual(markdownImageReferences(description), ['./images/first.jpg', './images/second.jpg']);
    assert.equal(stripMarkdownImageReferences(description), 'Compare the figures.');
  });

});
