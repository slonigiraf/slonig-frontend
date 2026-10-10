// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { formatSentenceCaseTitle } from './sentenceCase.js';

describe('sentence-case AI-generated names', (): void => {
  it('converts title-case headings to sentence case', (): void => {
    assert.equal(formatSentenceCaseTitle('This Is an Example of a Title'), 'This is an example of a title');
  });

  it('preserves common acronyms, proper nouns and mixed-case identifiers', (): void => {
    assert.equal(formatSentenceCaseTitle('Explore DNA With English and iPhone'), 'Explore DNA with English and iPhone');
    assert.equal(formatSentenceCaseTitle('Identify TP53 and BRCA1'), 'Identify TP53 and BRCA1');
  });

  it('preserves the native capitalization of German, Turkish, and Spanish titles', (): void => {
    assert.equal(formatSentenceCaseTitle('Die Grundlagen der Mathematik', 'de'), 'Die Grundlagen der Mathematik');
    assert.equal(formatSentenceCaseTitle('İstanbul ve Türkçe', 'tr'), 'İstanbul ve Türkçe');
    assert.equal(formatSentenceCaseTitle('La teoría de conjuntos', 'es'), 'La teoría de conjuntos');
  });

  it('does not alter mathematical markup or numbers within math', (): void => {
    assert.equal(formatSentenceCaseTitle('Compare <kx>x + Y</kx> With a Number'), 'Compare <kx>x + Y</kx> with a number');
  });
});
