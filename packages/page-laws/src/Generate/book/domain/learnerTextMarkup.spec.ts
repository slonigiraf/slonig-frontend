// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { assertSupportedLearnerTextMarkup } from './learnerTextMarkup.js';

describe('learner-facing markup validation', (): void => {
  it('accepts exactly the renderer-supported tags and backtick code formats', (): void => {
    [
      'Plain text with a comparison 3 < 5.',
      '<kx>x < y</kx> and <code>foo()</code>',
      '<code><div class="x">literal HTML example</div></code>',
      '`<br>` is code, as is ``<img>``.',
      '```html\n<strong>Code sample</strong>\n```'
    ].forEach((content) => assert.doesNotThrow(() => assertSupportedLearnerTextMarkup(content, 'Test field')));
  });

  it('rejects unknown, mismatched, modified, and unclosed HTML tags', (): void => {
    [
      '<b>bold</b>',
      '<br />',
      '<DIV class="x">block</DIV>',
      '<kx class="math">x</kx>',
      '<KX>x</KX>',
      '<kx>unclosed',
      '<kx><b>invalid in math</b></kx>',
      '</code>',
      '<code>unclosed'
    ].forEach((content) => assert.throws(
      () => assertSupportedLearnerTextMarkup(content, 'Question'),
      /Question contains unsupported HTML tag/
    ));
  });
});
