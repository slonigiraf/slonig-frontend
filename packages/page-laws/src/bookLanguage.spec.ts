// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { bookLanguageLabel, getMiddleBookPageNumbers, parseDetectedBookLanguage } from './bookLanguage.js';
import { BOOK_LANGUAGE_DETECTION_PROMPT } from './constants.js';

describe('book language detection', (): void => {
  it('selects the middle three pages', (): void => {
    assert.deepEqual(getMiddleBookPageNumbers(1), [1]);
    assert.deepEqual(getMiddleBookPageNumbers(2), [1, 2]);
    assert.deepEqual(getMiddleBookPageNumbers(3), [1, 2, 3]);
    assert.deepEqual(getMiddleBookPageNumbers(10), [4, 5, 6]);
    assert.deepEqual(getMiddleBookPageNumbers(11), [5, 6, 7]);
  });

  it('builds an AI prompt from middle-page text', (): void => {
    const prompt = BOOK_LANGUAGE_DETECTION_PROMPT([
      { pageNumber: 4, text: 'Some text' },
      { pageNumber: 5, text: 'More text' },
      { pageNumber: 6, text: 'Final text' }
    ]);

    assert.match(prompt, /primary natural language/i);
    assert.match(prompt, /Mathpix MMD text/i);
    assert.match(prompt, /ISO 639-1/i);
    assert.match(prompt, /--- page 4 ---/);
    assert.match(prompt, /--- page 6 ---/);
  });

  it('parses ISO language codes from AI JSON', (): void => {
    assert.equal(parseDetectedBookLanguage('{"language":"ru"}'), 'ru');
    assert.equal(parseDetectedBookLanguage('{"languageCode":"tr-TR"}'), 'tr');
    assert.equal(parseDetectedBookLanguage('```json\n{"code":"EN"}\n```'), 'en');
    assert.throws(() => parseDetectedBookLanguage('{"language":"english"}'));
  });

  it('formats common language codes for the reader header', (): void => {
    assert.equal(bookLanguageLabel('en'), 'English');
    assert.equal(bookLanguageLabel('ru'), 'Russian');
    assert.equal(bookLanguageLabel('xx'), 'XX');
    assert.equal(bookLanguageLabel(), 'Book language not detected');
  });
});
