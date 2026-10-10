// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { rasterizeTikzSvg } from './tikzRaster.js';

describe('TikZ visual QA rasterization', (): void => {
  it('refuses an SVG-text fallback when rasterization is unavailable', async (): Promise<void> => {
    if (typeof document === 'undefined') {
      await assert.rejects(rasterizeTikzSvg('<svg xmlns="http://www.w3.org/2000/svg"/>'), /browser canvas/);
    }
  });
});
