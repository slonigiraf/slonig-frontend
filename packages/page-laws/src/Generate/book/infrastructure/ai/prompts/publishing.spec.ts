// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { COURSE_NAMES_PROMPT } from './publishing.js';

describe('fix book and chapter names prompt', (): void => {
  it('requires topic-only chapter names rather than numbered chapter labels', (): void => {
    const prompt = COURSE_NAMES_PROMPT({ bookName: 'Math', chapters: [{ id: 1, title: 'Chapter 1. Fractions' }] });

    assert.match(prompt, /MANDATORY CHAPTER-TITLE RULE/);
    assert.match(prompt, /"Chapter 1\. Fractions" must become "Fractions"/);
    assert.match(prompt, /"1\. Fractions" must also become "Fractions"/);
    assert.match(prompt, /ALL chapter titles/);
  });
});
