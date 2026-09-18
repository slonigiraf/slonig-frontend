// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { bookAgeLabel, getBookAgeSamplePageNumbers, normalizeBookAge, parseDetectedBookAge } from './bookAge.js';
import { BOOK_AGE_DETECTION_PROMPT } from './constants.js';

describe('book age', () => {
  it('normalizes whole-number ages', () => {
    assert.equal(normalizeBookAge(12), 12);
    assert.equal(normalizeBookAge('17'), 17);
    assert.equal(normalizeBookAge(30), 30);
    assert.equal(normalizeBookAge(2), undefined);
    assert.equal(normalizeBookAge(31), undefined);
    assert.equal(normalizeBookAge(12.5), undefined);
    assert.equal(normalizeBookAge('unknown'), undefined);
  });

  it('parses the detected age from json', () => {
    assert.equal(parseDetectedBookAge('{"age":14}'), 14);
    assert.equal(parseDetectedBookAge('```json\n{"learnerAge":10}\n```'), 10);
    assert.equal(parseDetectedBookAge('{"age":30}'), 30);
    assert.throws(() => parseDetectedBookAge('{"age":31}'));
    assert.throws(() => parseDetectedBookAge('{"age":"twelve"}'));
  });

  it('uses up to three representative pages across a book', () => {
    assert.deepEqual(getBookAgeSamplePageNumbers(100), [25, 50, 75]);
    assert.deepEqual(getBookAgeSamplePageNumbers(3), [1, 2, 3]);
    assert.deepEqual(getBookAgeSamplePageNumbers(2), [1, 2]);
    assert.deepEqual(getBookAgeSamplePageNumbers(0), []);
    assert.deepEqual(getBookAgeSamplePageNumbers(100, [1, 24, 49, 77, 99]), [24, 49, 77]);
  });

  it('asks the model for a single whole-number age', () => {
    const prompt = BOOK_AGE_DETECTION_PROMPT('en', 'en-math', [{ pageNumber: 25, text: 'Solve quadratic equations by factoring.' }]);

    assert.match(prompt, /single most appropriate typical learner age/i);
    assert.match(prompt, /one integer from 3 through 30/i);
    assert.match(prompt, /exactly one property named "age"/i);
    assert.match(prompt, /do not return an age range/i);
    assert.doesNotMatch(prompt, /{"age":12}/);
  });

  it('labels unset and stored ages', () => {
    assert.equal(bookAgeLabel(), 'Learner age not detected');
    assert.equal(bookAgeLabel(11), '11 years');
  });
});
