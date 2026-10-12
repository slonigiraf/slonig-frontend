// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBookTitle, formatChapterTitle } from './chapterTitles.js';

describe('book and chapter headings', (): void => {
  it('preserves capitalization chosen by the model or editor', (): void => {
    assert.equal(formatBookTitle('this is an example of a title'), 'this is an example of a title');
    assert.equal(formatBookTitle('  INTRODUCTION TO DNA and iPhone DESIGN  '), 'INTRODUCTION TO DNA and iPhone DESIGN');
    assert.equal(formatBookTitle('  Solving  <kx>X + y</kx>  '), 'Solving <kx>X + y</kx>');
  });

  it('removes leading numeric, decimal, chapter-prefixed and roman-numbered headings', (): void => {
    assert.equal(formatChapterTitle('Chapter 1. Fractions'), 'Fractions');
    assert.equal(formatChapterTitle('1. Fractions'), 'Fractions');
    assert.equal(formatChapterTitle('Chapter 2: linear equations'), 'linear equations');
    assert.equal(formatChapterTitle('3.1. shapes and spaces'), 'shapes and spaces');
    assert.equal(formatChapterTitle('§ 4 fractions of a whole'), 'fractions of a whole');
    assert.equal(formatChapterTitle('IV. introduction to geometry'), 'introduction to geometry');
    assert.equal(formatChapterTitle('I am learning'), 'I am learning');
    assert.equal(formatChapterTitle('Chapter 5: Working With DNA and iPhone'), 'Working With DNA and iPhone');
    assert.equal(formatChapterTitle('Chapter 2'), 'Untitled chapter');
  });

  it('keeps native-language capitalization instead of forcing English lowercase', (): void => {
    assert.equal(formatBookTitle('Die Grundlagen der Mathematik', 'de'), 'Die Grundlagen der Mathematik');
    assert.equal(formatChapterTitle('3. Grundlagen der Mathematik', 'de'), 'Grundlagen der Mathematik');
    assert.equal(formatBookTitle('İstanbul ve Türkçe', 'tr'), 'İstanbul ve Türkçe');
    assert.equal(formatChapterTitle('2. La teoría de conjuntos', 'es'), 'La teoría de conjuntos');
  });
});
