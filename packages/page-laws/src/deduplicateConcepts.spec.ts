// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { deduplicateConceptCandidates, deduplicateConceptsPrompt, parseDeduplicateConceptPairs, type DeduplicateConceptCandidatePair, type DeduplicateConceptInput } from './deduplicateConcepts.js';

const concepts: DeduplicateConceptInput[] = [
  { chapterId: 2, chapterTitle: 'Earlier', conceptId: 10, description: 'Understand equivalent fractions.', title: 'Equivalent fractions' },
  { chapterId: 7, chapterTitle: 'Later', conceptId: 20, description: 'Recognize fractions with the same value.', title: 'Equivalent fractions' },
  { chapterId: 9, chapterTitle: 'Latest', conceptId: 30, description: 'Recognize fractions that name the same value.', title: 'Same-value fractions' }
];

describe('Deduplicate concepts', (): void => {
  const candidates: DeduplicateConceptCandidatePair[] = [
    { conceptIdA: 10, conceptIdB: 20, cosineDistance: 0.08 },
    { conceptIdA: 20, conceptIdB: 30, cosineDistance: 0.12 }
  ];

  it('asks the model only to confirm embedding-generated candidate pairs', (): void => {
    const prompt = deduplicateConceptsPrompt(concepts, candidates, 'en-math', 'en', 10);

    assert.match(prompt, /embedding-generated candidate list/i);
    assert.match(prompt, /Review ONLY the supplied candidate pairs/i);
    assert.match(prompt, /LOWEST chapterId/i);
    assert.match(prompt, /LOWEST conceptId/i);
    assert.match(prompt, /"conceptId":10/);
    assert.match(prompt, /"cosineDistance":0.08/);
  });

  it('creates only close embedding neighbors as AI confirmation candidates', (): void => {
    const embeddings = new Map<number, number[]>([
      [10, [1, 0]],
      [20, [0.99, 0.1]],
      [30, [0, 1]]
    ]);
    const generated = deduplicateConceptCandidates(concepts, embeddings, 0.1, 2);

    assert.equal(generated.length, 1);
    assert.equal(generated[0].conceptIdA, 10);
    assert.equal(generated[0].conceptIdB, 20);
  });

  it('rejects AI pairs that were not selected by embeddings', (): void => {
    assert.throws(
      () => parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":10,"conceptIdB":30}]}', concepts, candidates),
      /outside the embedding candidate list/
    );
  });

  it('always keeps the concept from the lowest chapter id regardless of pair order', (): void => {
    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":20,"conceptIdB":10}]}', concepts), [
      { deletedConceptId: 20, keptConceptId: 10 }
    ]);
  });

  it('collapses connected duplicate pairs so every implicated non-canonical concept is removed', (): void => {
    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":10,"conceptIdB":20},{"conceptIdA":20,"conceptIdB":30}]}', concepts), [
      { deletedConceptId: 20, keptConceptId: 10 },
      { deletedConceptId: 30, keptConceptId: 10 }
    ]);
  });

  it('does not ignore a duplicate concept in the same earliest chapter', (): void => {
    const sameEarliestChapter = [...concepts, { chapterId: 2, chapterTitle: 'Earlier', conceptId: 11, description: 'Another equivalent-fraction wording.', title: 'Equivalent value' }];

    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":10,"conceptIdB":20},{"conceptIdA":11,"conceptIdB":20}]}', sameEarliestChapter), [
      { deletedConceptId: 11, keptConceptId: 10 },
      { deletedConceptId: 20, keptConceptId: 10 }
    ]);
  });

  it('processes same-chapter duplicate pairs and breaks the keep tie by concept id', (): void => {
    const sameChapter = [...concepts, { chapterId: 7, chapterTitle: 'Later', conceptId: 40, description: 'x', title: 'x' }];

    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":40,"conceptIdB":20}]}', sameChapter), [
      { deletedConceptId: 40, keptConceptId: 20 }
    ]);
  });

  it('processes repeated returned pairs without changing the duplicate result', (): void => {
    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":10,"conceptIdB":20},{"conceptIdA":20,"conceptIdB":10}]}', concepts), [
      { deletedConceptId: 20, keptConceptId: 10 }
    ]);
  });

  it('fails only when a returned pair cannot be resolved to the supplied book inventory', (): void => {
    assert.throws(
      () => parseDeduplicateConceptPairs('{"duplicatePairs":[{"conceptIdA":10,"conceptIdB":999}]}', concepts),
      /outside the supplied inventory/
    );
  });

  it('accepts an empty duplicate list', (): void => {
    assert.deepEqual(parseDeduplicateConceptPairs('{"duplicatePairs":[]}', concepts), []);
  });
});
