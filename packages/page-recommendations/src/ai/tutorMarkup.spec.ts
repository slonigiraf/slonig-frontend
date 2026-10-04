/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { sanitizeGeneratedTutorMarkup } from './tutorMarkup.js';

describe('AI tutor generated markup sanitizing', (): void => {
  it('keeps mathematical KaTeX markup', (): void => {
    assert.equal(
      sanitizeGeneratedTutorMarkup('Use <kx>x^2 + y^2 = r^2</kx> and <kx>\\frac{1}{3}</kx>.'),
      'Use <kx>x^2 + y^2 = r^2</kx> and <kx>\\frac{1}{3}</kx>.',
    );
  });

  it('unwraps programming identifiers and prose accidentally marked as KaTeX', (): void => {
    assert.equal(
      sanitizeGeneratedTutorMarkup('Import <kx>useState</kx>, not <kx>import useState from "react"</kx>.'),
      'Import useState, not import useState from "react".',
    );
    assert.equal(
      sanitizeGeneratedTutorMarkup('<kx>Атрибут onClick должен содержать функцию, а не вызывать setMessage(\'Sent\') сразу.</kx>'),
      'Атрибут onClick должен содержать функцию, а не вызывать setMessage(\'Sent\') сразу.',
    );
  });

  it('does not rewrite code fences or inline code containing kx-looking text', (): void => {
    const source = '```html\n<kx>not math</kx>\n``` and `<kx>also code</kx>`';

    assert.equal(sanitizeGeneratedTutorMarkup(source), source);
  });

  it('keeps LaTeX text commands but rejects long prose even if it contains a command', (): void => {
    assert.equal(
      sanitizeGeneratedTutorMarkup('<kx>\\text{speed} = \\frac{distance}{time}</kx>'),
      '<kx>\\text{speed} = \\frac{distance}{time}</kx>',
    );
    assert.equal(
      sanitizeGeneratedTutorMarkup('<kx>\\span это обычный текст с несколькими словами внутри</kx>'),
      '\\span это обычный текст с несколькими словами внутри',
    );
  });
});
