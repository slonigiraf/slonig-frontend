// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { KATEX_MULTILINE_REQUIREMENTS_PROMPT, LEARNER_TEXT_MARKUP_PROMPT, MATH_DISPLAY_REQUIREMENTS_PROMPT, NUMBER_LINE_MARKER_ALIGNMENT_PROMPT } from './shared.js';

describe('shared book-generation KaTeX instructions', (): void => {
  it('requires plain words inside kx tags to use LaTeX text mode', (): void => {
    for (const prompt of [LEARNER_TEXT_MARKUP_PROMPT, MATH_DISPLAY_REQUIREMENTS_PROMPT]) {
      assert.ok(prompt.includes(String.raw`\text{hundreds}`));
      assert.ok(prompt.includes(String.raw`\text{tens}`));
      assert.ok(prompt.includes(String.raw`\text{ones}`));
      assert.ok(prompt.includes('<kx>...</kx>'));
    }
  });

  it('requires valid KaTeX row separators and JSON escaping, never newline escapes inside math', (): void => {
    const parsedMath = String.raw`<kx>\begin{aligned}5.8 &\approx 6,\\31.2 &\approx 30;\\30 \div 6 &= 5\end{aligned}</kx>`;
    const jsonMath = JSON.stringify(parsedMath).slice(1, -1);

    for (const prompt of [LEARNER_TEXT_MARKUP_PROMPT, MATH_DISPLAY_REQUIREMENTS_PROMPT]) {
      assert.ok(prompt.includes(KATEX_MULTILINE_REQUIREMENTS_PROMPT));
      assert.ok(prompt.includes(parsedMath));
      assert.ok(prompt.includes(jsonMath));
      assert.ok(prompt.includes(String.raw`NEVER use the literal \n`));
      assert.ok(prompt.includes(String.raw`\\\\ (four backslash characters)`));
      assert.ok(prompt.includes(String.raw`\begin{aligned}`));
    }
    assert.equal(JSON.parse(`"${jsonMath}"`), parsedMath);
  });

  it('requires every plotted number-line marker to sit directly on the line', (): void => {
    assert.ok(MATH_DISPLAY_REQUIREMENTS_PROMPT.includes(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT));
    assert.match(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT, /centered directly ON the number-line stroke/);
    assert.match(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT, /same y-coordinate/);
    assert.match(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT, /offsetting a label must never move the point marker/);
    assert.match(NUMBER_LINE_MARKER_ALIGNMENT_PROMPT, /question visuals show only points already given/);
  });

  it('shows the correctly formatted example and JSON escaping', (): void => {
    assert.ok(MATH_DISPLAY_REQUIREMENTS_PROMPT.includes(String.raw`<kx>9 \text{hundreds} \div 6 = 1</kx>`));
    assert.ok(MATH_DISPLAY_REQUIREMENTS_PROMPT.includes(String.raw`\\text{hundreds}`));
    assert.ok(MATH_DISPLAY_REQUIREMENTS_PROMPT.includes(String.raw`\\div`));
  });
});
