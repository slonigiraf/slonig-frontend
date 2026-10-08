// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBookTitle, formatChapterTitle } from './chapterTitles.js';

describe('book and chapter headings', (): void => {
  it('uses title case while preserving acronyms and proper mixed-case names', (): void => {
    assert.equal(formatBookTitle('this is an example of a title'), 'This Is an Example of a Title');
    assert.equal(formatBookTitle('INTRODUCTION TO DNA and iPhone DESIGN'), 'Introduction to DNA and iPhone Design');
  });

  it('removes leading numeric, decimal, chapter-prefixed and roman-numbered headings', (): void => {
    assert.equal(formatChapterTitle('Chapter 2: linear equations'), 'Linear Equations');
    assert.equal(formatChapterTitle('3.1. shapes and spaces'), 'Shapes and Spaces');
    assert.equal(formatChapterTitle('§ 4 fractions of a whole'), 'Fractions of a Whole');
    assert.equal(formatChapterTitle('IV. introduction to geometry'), 'Introduction to Geometry');
    assert.equal(formatChapterTitle('I Am Learning'), 'I Am Learning');
    assert.equal(formatChapterTitle('Chapter 2'), 'Untitled Chapter');
  });
});
