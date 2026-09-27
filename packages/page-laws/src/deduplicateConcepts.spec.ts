// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deduplicateConceptsPrompt, parseDeduplicateConceptPairs, type DeduplicateConceptInput } from './deduplicateConcepts.js';

const concepts: DeduplicateConceptInput[] = [
  { chapterId: 2, chapterTitle: 'Earlier', conceptId: 10, description: 'Understand equivalent fractions.', title: 'Equivalent fractions' },
  { chapterId: 7, chapterTitle: 'Later', conceptId: 20, description: 'Recognize fractions with the same value.', title: 'Equivalent fractions' },
  { chapterId: 9, chapterTitle: 'Latest', conceptId: 30, description: 'Recognize fractions that name the same value.', title: 'Same-value fractions' }
];

describe('Deduplicate concepts', (): void => {
  it('tells the model to find only cross-chapter near-equivalent concepts', (): void => {
    const prompt = deduplicateConceptsPrompt(concepts, 'en-math', 'en', 10);

    assert.match(prompt, /clear cross-chapter duplicate concepts/i);
    assert.match(prompt, /GREATER chapterId will be deleted/);
    assert.match(prompt, /"conceptId":10/);
  });

  it('always keeps the concept from the lowest chapter id regardless of pair order', (): void => {
    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":20,"conceptIdB":10}]}', concepts), [
      { deletedConceptId: 20, keptConceptId: 10 }
    ]);
  });

  it('collapses connected duplicate pairs so only the earliest chapter concept remains', (): void => {
    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":10,"conceptIdB":20},{"conceptIdA":20,"conceptIdB":30}]}', concepts), [
      { deletedConceptId: 20, keptConceptId: 10 },
      { deletedConceptId: 30, keptConceptId: 10 }
    ]);
  });

  it('never deletes another concept from the same earliest chapter through a duplicate chain', (): void => {
    const sameEarliestChapter = [...concepts, { chapterId: 2, chapterTitle: 'Earlier', conceptId: 11, description: 'Another equivalent-fraction wording.', title: 'Equivalent value' }];

    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":10,"conceptIdB":20},{"conceptIdA":11,"conceptIdB":20}]}', sameEarliestChapter), [
      { deletedConceptId: 20, keptConceptId: 10 }
    ]);
  });

  it('rejects same-chapter pairs', (): void => {
    const sameChapter = [...concepts, { chapterId: 7, chapterTitle: 'Later', conceptId: 40, description: 'x', title: 'x' }];

    assert.throws(() => parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":20,"conceptIdB":40}]}', sameChapter), /cross-chapter inventory/);
  });

  it('accepts an empty duplicate list', (): void => {
    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[]}', concepts), []);
  });
});
