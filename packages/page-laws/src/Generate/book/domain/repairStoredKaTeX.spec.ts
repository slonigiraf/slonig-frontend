// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { fixCorruptedKaTeXText, repairStoredAbilityKaTeX } from './repairStoredKaTeX.js';

const math = String.raw`<kx>4 \times 23 + \frac{1}{2} + \begin{matrix}a \neq b \rightarrow c\end{matrix}</kx>`;

function makeAbility (text: string): string {
  return JSON.stringify({ h: 'Multiply', i: '', q: [
    { h: text, a: text, i: 9, p: 10, pPrompt: 'Keep me' },
    { h: 'Unchanged', a: '<kx>1 + 2 = 3</kx>', i: null, p: null }
  ], t: 3 });
}

describe('book-wide stored KaTeX repair', (): void => {
  it('restores JSON control-character damage in previously generated math', (): void => {
    const broken = JSON.parse(String.raw`{"value":"<kx>4 \times 23 + \frac{1}{2} + \begin{matrix}a \neq b \rightarrow c\\end{matrix}</kx>"}`) as { value: string };
    const fixed = fixCorruptedKaTeXText(broken.value);

    assert.equal(fixed.text, math);
    assert.equal(fixed.commandsFixed, 5);
  });

  it('repairs old Ability JSON and preserves its images, prompts and schema', (): void => {
    const original = makeAbility(`Work out ${math}`);
    const parsed = JSON.parse(original) as { q: Array<{ h: string; a: string; i: number | null; p: number | null }> };

    parsed.q[0].h = parsed.q[0].h.replace(String.raw`\times`, '\t' + 'imes').replace(String.raw`\frac`, '\f' + 'rac');
    parsed.q[0].a = parsed.q[0].a.replace(String.raw`\neq`, '\n' + 'eq');
    const brokenContent = JSON.stringify(parsed);
    const repaired = repairStoredAbilityKaTeX(brokenContent);

    assert.ok(repaired);
    assert.equal(repaired.commandsFixed, 3);
    assert.deepEqual(JSON.parse(repaired.content), JSON.parse(original));
    assert.equal(repairStoredAbilityKaTeX(repaired.content), null);
  });

  it('does not change correct math, ordinary tabs/newlines or prose outside math', (): void => {
    const valid = makeAbility(`Tab\tinside prose\nLine break. ${math}`);

    assert.equal(repairStoredAbilityKaTeX(valid), null);
    assert.deepEqual(fixCorruptedKaTeXText('Outside <code>4\times</code> and ordinary tab\times'), {
      text: 'Outside <code>4\times</code> and ordinary tab\times', commandsFixed: 0
    });
    assert.equal(fixCorruptedKaTeXText('<kx>first\nsecond</kx>').commandsFixed, 0);
  });

  it('repairs raw unescaped JSON math and invalid JSON, without touching unrelated fields', (): void => {
    const raw = String.raw`{"h":"Title","q":[{"h":"<kx>4 \times 2 + \alpha</kx>","a":"8"}]}`;
    const result = repairStoredAbilityKaTeX(raw);

    assert.ok(result);
    assert.equal((JSON.parse(result.content) as { q: Array<{ h: string }> }).q[0].h,
      String.raw`<kx>4 \times 2 + \alpha</kx>`);
  });

  it('fixes literal doubled backslashes left by an earlier Fix KaTeX run', (): void => {
    const broken = String.raw`<kx>4 \\times 3 = 12</kx> square meters.`;
    const corrected = String.raw`<kx>4 \times 3 = 12</kx> square meters.`;
    const result = fixCorruptedKaTeXText(broken);

    assert.deepEqual(result, { text: corrected, commandsFixed: 1 });
    assert.equal(fixCorruptedKaTeXText(result.text).commandsFixed, 0);

    const stored = makeAbility(broken);
    const repaired = repairStoredAbilityKaTeX(stored);

    assert.ok(repaired);
    assert.equal(repaired.commandsFixed, 2); // question and answer
    assert.equal((JSON.parse(repaired.content) as { q: Array<{ a: string }> }).q[0].a, corrected);
    assert.equal(repairStoredAbilityKaTeX(repaired.content), null);
  });

  it('keeps correct JSON escaping, legitimate KaTeX line breaks and prose intact', (): void => {
    const correct = String.raw`<kx>4 \times 3 = 12</kx>`;
    const lineBreak = String.raw`<kx>\\\times</kx>`; // \\ row break followed by \times
    const otherLineBreak = String.raw`<kx>\\ x + y</kx>`;
    const unrelated = String.raw`Outside <kx>word \\hello</kx> and \\times`;

    assert.equal(repairStoredAbilityKaTeX(makeAbility(correct)), null);
    assert.deepEqual(fixCorruptedKaTeXText(lineBreak), { text: lineBreak, commandsFixed: 0 });
    assert.deepEqual(fixCorruptedKaTeXText(otherLineBreak), { text: otherLineBreak, commandsFixed: 0 });
    assert.deepEqual(fixCorruptedKaTeXText(unrelated), { text: unrelated, commandsFixed: 0 });
  });

  it('fixes other known double-escaped commands without touching unrelated data', (): void => {
    const overescaped = String.raw`<kx>\\frac{1}{2} + \\sqrt{9} + \\alpha</kx>`;
    const correct = String.raw`<kx>\frac{1}{2} + \sqrt{9} + \alpha</kx>`;

    assert.deepEqual(fixCorruptedKaTeXText(overescaped), { text: correct, commandsFixed: 3 });
    assert.equal(repairStoredAbilityKaTeX(makeAbility(correct)), null);
  });

  it('returns null when no repair is necessary', (): void => {
    assert.equal(repairStoredAbilityKaTeX(makeAbility(math)), null);
    assert.equal(repairStoredAbilityKaTeX(JSON.stringify({ h: 'Plain text', q: [] })), null);
  });
});
