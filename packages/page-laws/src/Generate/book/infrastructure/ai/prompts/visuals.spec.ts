// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NUMBER_LINE_MARKER_ALIGNMENT_PROMPT } from './shared.js';
import { OPEN_ROUTER_SOLUTION_RASTER_PROMPT, OPEN_ROUTER_VISUAL_SPEC_PROMPT } from './visuals.js';

describe('number-line point placement in visual-generation prompts', (): void => {
  it('instructs question and solution vector creation to align marks with the axis', (): void => {
    for (const purpose of ['question', 'solution'] as const) {
      const prompt = OPEN_ROUTER_VISUAL_SPEC_PROMPT('Plot a point at 3 on the number line.', purpose);

      assert.ok(prompt.includes(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT));
      assert.match(prompt, /same y-coordinate/);
    }
  });

  it('keeps marker alignment when updating an existing vector scene', (): void => {
    const prompt = OPEN_ROUTER_VISUAL_SPEC_PROMPT('Mark 3 on the number line.', 'solution', '{"elements":[]}');

    assert.match(prompt, /vector-patch/);
    assert.ok(prompt.includes(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT));
  });

  it('includes point placement guidance for raster solution images', (): void => {
    const prompt = OPEN_ROUTER_SOLUTION_RASTER_PROMPT('Mark 3 on the number line.');

    assert.ok(prompt.includes(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT));
  });
});
