// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { applyFixChapterConceptsPass, chapterLevelMissingConcept, parseFixedConcept, parseMissingChapterConcepts, proposedFixChapterConcepts } from './fixConcepts.js';
import { fixChapterConceptsPrompt, fixSingleConceptPrompt } from '../../application/concepts/conceptPrompts.js';

describe('fix concepts', (): void => {
  it('builds and parses a single-concept AI repair request', (): void => {
    const prompt = fixSingleConceptPrompt(
      'Fractions',
      '--- page 4 ---\nA denominator tells how many equal parts make the whole.',
      { description: 'Bottom number.', title: 'Denominator' },
      'en-math',
      'en',
      10
    );

    assert.match(prompt, /same narrowly teachable concept/);
    assert.match(prompt, /Fractions/);
    assert.match(prompt, /native capitalization rules for concept titles/);
    assert.match(prompt, /ONLY permitted HTML-like markup is <kx>/);
    assert.match(prompt, /Treat unsupported HTML tags in the current title or description as errors/);
    assert.deepEqual(parseFixedConcept('{"title":"Denominator","description":"The bottom number shows how many equal parts make the whole."}'), {
      description: 'The bottom number shows how many equal parts make the whole.',
      title: 'Denominator'
    });
  });

  it('preserves Fix with AI concept capitalization', (): void => {
    assert.equal(parseFixedConcept('{"title":"Finding the Main Idea","description":"An example description."}').title, 'Finding the Main Idea');
  });

  it('preserves native capitalized nouns in non-English repairs', (): void => {
    assert.equal(parseFixedConcept('{"title":"Die Grundlagen der Mathematik","description":"Ein Überblick."}', 'de').title, 'Die Grundlagen der Mathematik');
    assert.equal(parseMissingChapterConcepts('{"concepts":[{"title":"Die Grundlagen der Mathematik","description":"Ein Überblick.","pageNumber":1}]}', [], new Set([1]), 'de').concepts[0].title, 'Die Grundlagen der Mathematik');
  });

  it('keeps capitalization in new and saved Fix concepts', (): void => {
    const result = parseMissingChapterConcepts(JSON.stringify({ concepts: [{ title: 'The Main Idea in DNA', description: 'An explanation.', pageNumber: 1 }] }), [], new Set([1]));

    assert.equal(result.concepts[0].title, 'The Main Idea in DNA');
    assert.equal(chapterLevelMissingConcept(42, 7, result.concepts[0]).title, 'The Main Idea in DNA');
  });

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
    assert.match(prompt, /native capitalization rules for newly generated concept titles/);
    assert.match(prompt, /Numerator/);
    assert.match(prompt, /A fraction has a numerator and denominator/);
    assert.match(prompt, /primary evidence/);
    assert.match(prompt, /pageNumber/);
    assert.match(prompt, /page delimiters/);
    assert.match(prompt, /clearly do not belong/);
    assert.match(prompt, /incorrectly bundles multiple independently teachable skills/);
    assert.match(prompt, /Writing numerals 0-5/);
    assert.match(prompt, /normal removals plus additions/);
    assert.match(prompt, /Duplicate review IS part of Fix Concepts/i);
    assert.match(prompt, /LOWEST conceptIndex/i);
    assert.match(prompt, /ONLY permitted HTML-like markup is <kx>/);
    assert.match(prompt, /propose its conceptIndex for removal AND a corrected replacement concept/);
    assert.match(prompt, /later Deduplicate Concepts stage/i);
    assert.match(prompt, /removeConceptIndexes/);
    assert.match(prompt, /conceptIndex/);
  });

  it('keeps complete Fix proposals without deduplicating them', (): void => {
    const result = parseMissingChapterConcepts(JSON.stringify({
      concepts: [
        { title: 'Numerator', description: 'A renamed duplicate.', pageNumber: 4 },
        { title: 'Denominator', description: 'The bottom number in a fraction.', pageNumber: 5 },
        { title: 'Denominator', description: 'Duplicate candidate.', pageNumber: 5 },
        { title: '', description: 'Invalid.', pageNumber: 5 },
        { title: 'Outside', description: 'Wrong page.', pageNumber: 99 }
      ]
    }), [{ title: 'Numerator', description: 'The top number in a fraction.' }], new Set([4, 5]));

    assert.deepEqual(result, { concepts: [
      { title: 'Numerator', description: 'A renamed duplicate.', pageNumber: 4 },
      { title: 'Denominator', description: 'The bottom number in a fraction.', pageNumber: 5 },
      { title: 'Denominator', description: 'Duplicate candidate.', pageNumber: 5 }
    ], removeConceptIndexes: [] });
  });

  it('feeds the first pass additions and removals into the second pass and resolves indexes against that draft', (): void => {
    const original = [
      { id: 1, bookPage: [42, 4] as [number, number], title: 'Broad concept', description: 'Bundled idea' },
      { id: 2, bookPage: [42, 4] as [number, number], title: 'Keep', description: 'Keep this concept' }
    ];
    const first = applyFixChapterConceptsPass({ inventory: original, removed: [] }, {
      concepts: [{ title: 'New concept', description: 'Initial guess', pageNumber: 4 }],
      removeConceptIndexes: [0]
    }, 42, 7);

    assert.deepEqual(first.inventory.map(({ title }) => title), ['Keep', 'New concept']);
    assert.deepEqual(first.removed, [original[0]]);

    // The second pass removes the unsaved first-pass addition (index 1),
    // NOT the original concept with id 2 at index 1 in the first inventory.
    const second = applyFixChapterConceptsPass(first, {
      concepts: [{ title: 'Correct concept', description: 'Refined second pass', pageNumber: 5 }],
      removeConceptIndexes: [1]
    }, 42, 7);

    assert.deepEqual(second.removed, [original[0]]);
    assert.deepEqual(second.inventory.map(({ title }) => title), ['Keep', 'Correct concept']);
    assert.deepEqual(proposedFixChapterConcepts(second), [{ title: 'Correct concept', description: 'Refined second pass', pageNumber: 5 }]);
  });

  it('accepts a split proposal as one removal plus isolated replacement concepts', (): void => {
    const result = parseMissingChapterConcepts(JSON.stringify({
      concepts: Array.from({ length: 6 }, (_, numeral) => ({
        title: `Writing numeral ${numeral}`,
        description: `Write the numeral ${numeral} correctly.`,
        pageNumber: 8
      })),
      removeConceptIndexes: [0]
    }), [{ title: 'Writing numerals 0-5', description: 'Write the numerals from 0 through 5.' }], new Set([8]));

    assert.equal(result.concepts.length, 6);
    assert.deepEqual(result.concepts.map(({ title }) => title), [
      'Writing numeral 0',
      'Writing numeral 1',
      'Writing numeral 2',
      'Writing numeral 3',
      'Writing numeral 4',
      'Writing numeral 5'
    ]);
    assert.deepEqual(result.removeConceptIndexes, [0]);
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

  it('rejects unsupported HTML tags in single and chapter Fix concepts responses', (): void => {
    assert.throws(() => parseFixedConcept(JSON.stringify({ title: 'Title', description: '<p>description</p>' })), /unsupported HTML tag/);
    assert.throws(() => parseMissingChapterConcepts(JSON.stringify({
      concepts: [{ title: '<b>Bad</b>', description: 'Meaning', pageNumber: 1 }]
    }), [], new Set([1])), /unsupported HTML tag/);
    const supported = parseFixedConcept(JSON.stringify({ title: 'Using <code>for</code> loops', description: 'Compare <kx>x < 3</kx>.' }));

    assert.equal(supported.title, 'Using <code>for</code> loops');
  });

  it('rejects malformed response shapes', (): void => {
    assert.throws(() => parseMissingChapterConcepts('{"items":[]}'), /invalid Fix Concepts data/);
    assert.throws(() => parseMissingChapterConcepts('{"concepts":[],"removeConceptIndexes":"bad"}'), /invalid Fix Concepts data/);
  });
});
