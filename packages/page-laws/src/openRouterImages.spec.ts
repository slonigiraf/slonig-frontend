// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { svgMarkupToDataUrl } from './openRouterImages.js';

describe('Ability SVG generation', (): void => {
  it('encodes a self-contained SVG as an image data URL', (): void => {
    const result = svgMarkupToDataUrl('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>');

    assert.match(result ?? '', /^data:image\/svg\+xml;base64,/);
  });

  it('rejects SVG that embeds external or executable content', (): void => {
    assert.equal(svgMarkupToDataUrl('<svg><script>alert(1)</script></svg>'), undefined);
    assert.equal(svgMarkupToDataUrl('<svg><image href="https://example.com/a.png" /></svg>'), undefined);
  });
});
