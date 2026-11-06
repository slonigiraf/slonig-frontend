// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseModelJson } from './modelJson.js';

describe('AI JSON with learner math', (): void => {
  it('repairs JSON-valid control escapes before they destroy LaTeX commands', (): void => {
    // JSON.parse does NOT throw for these malformed model strings.
    const raw = String.raw`{"math":"<kx>4 \times 23 + \frac{1}{2} + \begin{matrix}a \neq \right)</kx>"}`;
    const expected = String.raw`<kx>4 \times 23 + \frac{1}{2} + \begin{matrix}a \neq \right)</kx>`;

    assert.notEqual((JSON.parse(raw) as { math: string }).math, expected);
    assert.deepEqual(parseModelJson(raw), { math: expected });
  });

  it('repairs unrecognized JSON escapes in math with the existing fallback', (): void => {
    const raw = String.raw`{"math":"<kx>\sqrt{9} + \alpha + \underbrace{x}_{y}</kx>"}`;

    assert.deepEqual(parseModelJson(raw), {
      math: String.raw`<kx>\sqrt{9} + \alpha + \underbrace{x}_{y}</kx>`
    });
  });

  it('does not alter correctly escaped math or literal quote escapes', (): void => {
    const value = { math: String.raw`<kx>\text{"hello"} + 4 \times 23</kx>` };
    const encoded = JSON.stringify(value);

    assert.deepEqual(parseModelJson(encoded), value);
  });

  it('keeps JSON Unicode escapes, ordinary tabs and non-math content intact', (): void => {
    const raw = String.raw`{"math":"<kx>\u03b1 = 1</kx>","description":"first\tsecond","note":"\times"}`;

    assert.deepEqual(parseModelJson(raw), { math: '<kx>α = 1</kx>', description: 'first\tsecond', note: '\t' + 'imes' });
  });

  it('accepts fenced responses and mixed escaped/unescaped formulas', (): void => {
    const raw = '```json\n' + String.raw`{"math":"<kx>\times + \\frac{2}{3}</kx>"}` + '\n```';

    assert.deepEqual(parseModelJson(raw), { math: String.raw`<kx>\times + \frac{2}{3}</kx>` });
  });
});
