// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chapterLevelMissingConcept, fixChapterConceptsPrompt, parseMissingChapterConcepts } from './fixConcepts.js';

describe('fix concepts', (): void => {
  it('stores Fix-generated concepts at chapter scope on page 0', (): void => {
    assert.deepEqual(chapterLevelMissingConcept(42, 7, {
      description: 'The bottom number in a fraction.',
      title: 'Denominator'
    }), {
      bookPage: [42, 0],
      chapterId: 7,
      description: 'The bottom number in a fraction.',
      title: 'Denominator'
    });
  });

  it('builds a conservative chapter-level prompt from metadata and existing concepts', (): void => {
    const prompt = fixChapterConceptsPrompt('Fractions', '# Fractions\n\nA fraction has a numerator and denominator.', [{ title: 'Numerator', description: 'The top number in a fraction.' }], 'en-math', 'en', 10);

    assert.match(prompt, /Fractions/);
    assert.match(prompt, /en-math/);
    assert.match(prompt, /learner age 10/);
    assert.match(prompt, /Numerator/);
    assert.match(prompt, /A fraction has a numerator and denominator/);
    assert.match(prompt, /primary evidence/);
  });

  it('keeps only complete missing concepts and removes exact title duplicates', (): void => {
    const result = parseMissingChapterConcepts(JSON.stringify({
      concepts: [
        { title: 'Numerator', description: 'A renamed duplicate.' },
        { title: 'Denominator', description: 'The bottom number in a fraction.' },
        { title: 'Denominator', description: 'Duplicate candidate.' },
        { title: '', description: 'Invalid.' }
      ]
    }), [{ title: 'Numerator', description: 'The top number in a fraction.' }]);

    assert.deepEqual(result, { concepts: [{ title: 'Denominator', description: 'The bottom number in a fraction.' }] });
  });

  it('rejects malformed response shapes', (): void => {
    assert.throws(() => parseMissingChapterConcepts('{"items":[]}'), /invalid Fix Concepts data/);
  });
});
