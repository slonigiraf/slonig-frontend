// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { BOOK_SUBJECT_OPTIONS, automaticBookSubjectForLanguage, bookSubjectLabel, normalizeBookSubject, parseDetectedBookSubject } from './bookSubject.js';
import { BOOK_SUBJECT_DETECTION_PROMPT } from './constants.js';

describe('bookSubject', () => {
  it('normalizes supported subject values to the canonical category names', () => {
    assert.equal(normalizeBookSubject('en-math'), 'en-math');
    assert.equal(normalizeBookSubject('Math'), 'en-math');
    assert.equal(normalizeBookSubject('mathematics'), 'en-math');
    assert.equal(normalizeBookSubject('en-ela'), 'en-ela');
    assert.equal(normalizeBookSubject('English Language Arts'), 'en-ela');
    assert.equal(normalizeBookSubject('en-science'), 'en-science');
    assert.equal(normalizeBookSubject('science'), 'en-science');
    assert.equal(normalizeBookSubject('na'), 'na');
    assert.equal(normalizeBookSubject('other'), 'na');
    assert.equal(normalizeBookSubject('history'), undefined);
  });

  it('parses JSON responses into canonical category names', () => {
    assert.equal(parseDetectedBookSubject('{"subject":"en-math"}'), 'en-math');
    assert.equal(parseDetectedBookSubject('{"bookSubject":"en-ela"}'), 'en-ela');
    assert.equal(parseDetectedBookSubject('```json\n{"category":"en-science"}\n```'), 'en-science');
    assert.equal(parseDetectedBookSubject('{"subject":"Math"}'), 'en-math');
    assert.throws(() => parseDetectedBookSubject('{"subject":"History"}'));
  });

  it('hard-gates every non-English book to na', () => {
    assert.equal(automaticBookSubjectForLanguage('ru'), 'na');
    assert.equal(automaticBookSubjectForLanguage('fr'), 'na');
    assert.equal(automaticBookSubjectForLanguage('zh-CN'), 'na');
    assert.equal(automaticBookSubjectForLanguage('en'), undefined);
    assert.equal(automaticBookSubjectForLanguage('EN-us'), undefined);
  });

  it('uses the subject model only for English books', () => {
    const prompt = BOOK_SUBJECT_DETECTION_PROMPT('en', [{ pageNumber: 42, text: 'Fractions and decimal operations.' }]);

    assert.match(prompt, /only used for English books/);
    assert.match(prompt, /non-English books are assigned na before this prompt is called/);
    assert.match(prompt, /en-math, en-ela, en-science, na/);
    assert.match(prompt, /{"subject":"en-math"}/);
  });

  it('exposes exactly the supported manual choices', () => {
    assert.deepEqual(BOOK_SUBJECT_OPTIONS.map(({ value }) => value), ['en-math', 'en-ela', 'en-science', 'na']);
    assert.equal(bookSubjectLabel(undefined), 'Book subject not detected');
    assert.equal(bookSubjectLabel('en-ela'), 'en-ela');
  });
});
