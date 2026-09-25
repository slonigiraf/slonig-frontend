// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chapterLevelMissingConcept, fixChapterConceptsPrompt, parseMissingChapterConcepts } from './fixConcepts.js';

describe('fix concepts', (): void => {
  it('stores Fix-generated concepts on their source page with the Fix attempt', (): void => {
    assert.deepEqual(chapterLevelMissingConcept(42, 7, {
      description: 'The bottom number in a fraction.',
      pageNumber: 12,
      title: 'Denominator'
    }, 2), {
      attempt: 2,
      bookPage: [42, 12],
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
    assert.match(prompt, /pageNumber/);
    assert.match(prompt, /page delimiters/);
    assert.match(prompt, /clearly do not belong/);
    assert.match(prompt, /removeConceptIndexes/);
    assert.match(prompt, /conceptIndex/);
  });

  it('keeps only complete missing concepts and removes exact title duplicates', (): void => {
    const result = parseMissingChapterConcepts(JSON.stringify({
      concepts: [
        { title: 'Numerator', description: 'A renamed duplicate.', pageNumber: 4 },
        { title: 'Denominator', description: 'The bottom number in a fraction.', pageNumber: 5 },
        { title: 'Denominator', description: 'Duplicate candidate.', pageNumber: 5 },
        { title: '', description: 'Invalid.', pageNumber: 5 },
        { title: 'Outside', description: 'Wrong page.', pageNumber: 99 }
      ]
    }), [{ title: 'Numerator', description: 'The top number in a fraction.' }], new Set([4, 5]));

    assert.deepEqual(result, { concepts: [{ title: 'Denominator', description: 'The bottom number in a fraction.', pageNumber: 5 }], removeConceptIndexes: [] });
  });

  it('keeps only valid unique existing-concept removal indexes', (): void => {
    const result = parseMissingChapterConcepts(JSON.stringify({
      concepts: [],
      removeConceptIndexes: [2, 0, 2, -1, 3, 1.5, '1']
    }), [
      { title: 'Numerator', description: 'The top number in a fraction.' },
      { title: 'Denominator', description: 'The bottom number in a fraction.' },
      { title: 'Unrelated', description: 'This belongs to another chapter.' }
    ]);

    assert.deepEqual(result, { concepts: [], removeConceptIndexes: [0, 2] });
  });

  it('accepts older Fix concepts responses without removals', (): void => {
    assert.deepEqual(parseMissingChapterConcepts('{"concepts":[]}'), { concepts: [], removeConceptIndexes: [] });
  });

  it('rejects malformed response shapes', (): void => {
    assert.throws(() => parseMissingChapterConcepts('{"items":[]}'), /invalid Fix Concepts data/);
    assert.throws(() => parseMissingChapterConcepts('{"concepts":[],"removeConceptIndexes":"bad"}'), /invalid Fix Concepts data/);
  });
});
