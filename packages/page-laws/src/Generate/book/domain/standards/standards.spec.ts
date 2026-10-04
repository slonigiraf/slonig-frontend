// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { embeddingCosineDistance, mergeStandardsMatches, moduleStandardsText, parseStandardsMatches, STANDARDS_MATCH_RUNS, standardEmbeddingInput, standardsCandidatesFromEmbeddings, standardsConceptEmbeddingInput, standardsConceptFingerprint, standardsConceptInputs, standardsMatchesFromEmbeddings, standardsMatchingPrompt, standardsPathForBookSubject, type StandardsCatalog } from './standards.js';
import { loadStandardsCatalogsForBookSubject } from '../../infrastructure/standards/standardsCatalog.js';
import { loadStoredBookStandards } from '../../infrastructure/storage/standardsStorage.js';

const catalog: StandardsCatalog = {
  framework: 'ccss',
  label: 'Common Core State Standards',
  path: 'data/standards/en/math/common-core.json',
  standards: [
    { code: 'CCSS.6.RP.A.2', context: '6 > Understand ratio concepts', description: 'Understand the concept of a unit rate.' },
    { code: 'CCSS.6.EE.A.1', context: '6 > Apply and extend arithmetic', description: 'Write and evaluate numerical expressions involving whole-number exponents.' }
  ]
};

describe('chapter standards', (): void => {
  it('runs AI standards confirmation three times and reconciles with a 2-of-3 majority', (): void => {
    assert.equal(STANDARDS_MATCH_RUNS, 3);
    assert.deepEqual(mergeStandardsMatches([
      [
        { code: 'CCSS.6.RP.A.2', framework: 'ccss' },
        { code: 'CCSS.6.EE.A.1', framework: 'ccss' }
      ],
      [{ code: 'CCSS.6.RP.A.2', framework: 'ccss' }],
      []
    ], Math.floor(STANDARDS_MATCH_RUNS / 2) + 1), [{ code: 'CCSS.6.RP.A.2', framework: 'ccss' }]);
  });

  it('derives the standards directory from the detected book subject', (): void => {
    assert.equal(standardsPathForBookSubject('en-math'), 'data/standards/en/math');
    assert.equal(standardsPathForBookSubject('en-ela'), 'data/standards/en/ela');
    assert.equal(standardsPathForBookSubject('en-science'), 'data/standards/en/science');
    assert.equal(standardsPathForBookSubject('na'), undefined);
    assert.equal(standardsPathForBookSubject(undefined), undefined);
  });

  it('loads and flattens the standards files selected by the book subject', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL): Promise<Response> => {
      const url = String(input);

      requested.push(url);

      if (url.includes('common-core.json')) {
        return new Response(JSON.stringify([{
          a: [{
            s: [{ d: 'Understand the concept of a unit rate.', i: '6.RP.A.2' }],
            t: 'Understand ratio concepts'
          }],
          g: '6'
        }]), { status: 200 });
      }

      return new Response('{}', { status: 200 });
    }) as typeof fetch;

    try {
      const catalogs = await loadStandardsCatalogsForBookSubject('en-math');
      const commonCore = catalogs.find(({ framework }) => framework === 'ccss');

      assert.equal(catalogs.length, 3);
      assert.ok(requested.some((url) => url.includes('data/standards/en/math/common-core.json')));
      assert.deepEqual(commonCore?.standards, [{
        code: 'CCSS.6.RP.A.2',
        context: '6 > Understand ratio concepts',
        description: 'Understand the concept of a unit rate.'
      }]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('normalizes and deduplicates chapter concepts before matching', (): void => {
    assert.deepEqual(standardsConceptInputs([
      { description: '  Description  ', title: '  Concept  ' },
      { description: 'Description', title: 'Concept' },
      { description: 'Ignored', title: '   ' }
    ]), [{ description: 'Description', title: 'Concept' }]);
  });

  it('builds embedding inputs from concept title + description and standard context + description', (): void => {
    assert.equal(standardsConceptEmbeddingInput({ description: '  Compares two quantities.  ', title: '  Unit rate  ' }), 'Unit rate\nCompares two quantities.');
    assert.equal(standardEmbeddingInput(catalog.standards[0]), '6 > Understand ratio concepts\nUnderstand the concept of a unit rate.');
  });

  it('computes cosine distance for concept heatmaps', (): void => {
    assert.ok(Math.abs((embeddingCosineDistance([1, 0], [1, 0]) ?? Infinity) - 0) < 1e-12);
    assert.ok(Math.abs((embeddingCosineDistance([1, 0], [0, 1]) ?? Infinity) - 1) < 1e-12);
    assert.ok(Math.abs((embeddingCosineDistance([1, 0], [-1, 0]) ?? Infinity) - 2) < 1e-12);
    assert.equal(embeddingCosineDistance([], []), undefined);
  });

  it('selects the nearest standard embedding for each concept, removes duplicates, and keeps the nearest chapter distance', (): void => {
    const embeddings = new Map<string, number[]>([
      ['CCSS.6.RP.A.2', [1, 0]],
      ['CCSS.6.EE.A.1', [0, 1]]
    ]);

    const secondConceptY = Math.sqrt(0.51);

    const matches = standardsMatchesFromEmbeddings([
      [0.6, -0.8],
      [0.7, secondConceptY]
    ], catalog, embeddings);

    assert.deepEqual(matches.map(({ code, framework }) => ({ code, framework })), [
      { code: 'CCSS.6.RP.A.2', framework: 'ccss' },
      { code: 'CCSS.6.EE.A.1', framework: 'ccss' }
    ]);
    // The first concept selects the ratio standard, but the second concept is
    // actually nearer to it. The chapter distance therefore uses 0.7.
    assert.ok(Math.abs((matches[0].distance ?? Infinity) - 0.3) < 1e-12);
    assert.ok(Math.abs((matches[1].distance ?? Infinity) - (1 - secondConceptY)) < 1e-12);
  });

  it('sends the AI only standards selected by embedding retrieval', (): void => {
    const embeddings = new Map<string, number[]>([
      ['CCSS.6.RP.A.2', [1, 0]],
      ['CCSS.6.EE.A.1', [0, 1]]
    ]);
    const { catalog: candidates } = standardsCandidatesFromEmbeddings([[1, 0]], catalog, embeddings);
    const prompt = standardsMatchingPrompt('Ratios', [{
      description: 'A unit rate compares two quantities with a second quantity of one.',
      title: 'Unit rates'
    }], candidates);

    assert.deepEqual(candidates.standards.map(({ code }) => code), ['CCSS.6.RP.A.2']);
    assert.match(prompt, /embedding-retrieved candidate list/i);
    assert.match(prompt, /CCSS\.6\.RP\.A\.2/);
    assert.doesNotMatch(prompt, /CCSS\.6\.EE\.A\.1/);
  });

  it('accepts AI output only when the code is inside the embedding candidate catalog', (): void => {
    const candidateCatalog: StandardsCatalog = { ...catalog, standards: [catalog.standards[0]] };

    assert.deepEqual(parseStandardsMatches('{"codes":["CCSS.6.RP.A.2"]}', candidateCatalog), [
      { code: 'CCSS.6.RP.A.2', framework: 'ccss' }
    ]);
    assert.throws(
      () => parseStandardsMatches('{"codes":["CCSS.6.EE.A.1"]}', candidateCatalog),
      /not present in data\/standards\/en\/math\/common-core\.json/i
    );
  });

  it('writes Virginia standards with the SOL prefix and normalizes the old VA SOL prefix', (): void => {
    assert.equal(moduleStandardsText([
      { code: 'VA SOL.6.1.a', framework: 'vaSol' },
      { code: 'SOL.6.2', framework: 'vaSol' },
      { code: '6.3', framework: 'vaSol' }
    ]), 'SOL.6.1.a, SOL.6.2, SOL.6.3');
  });

  it('changes the cache fingerprint when chapter concepts change', (): void => {
    assert.notEqual(
      standardsConceptFingerprint([{ description: 'First description', title: 'First' }], 'data/standards/en/math'),
      standardsConceptFingerprint([{ description: 'Second description', title: 'Second' }], 'data/standards/en/math')
    );
  });

  it('changes the cache fingerprint when the book subject selects a different standards path', (): void => {
    const concepts = [{ description: 'Description', title: 'Concept' }];

    assert.notEqual(
      standardsConceptFingerprint(concepts, 'data/standards/en/math'),
      standardsConceptFingerprint(concepts, 'data/standards/en/ela')
    );
  });

  it('loads current concept-based stored standards, preserves distances, and normalizes old long-form CCSS codes inside them', (): void => {
    const originalLocalStorage = globalThis.localStorage;

    globalThis.localStorage = {
      length: 1,
      clear: () => undefined,
      getItem: () => JSON.stringify({ chapter: {
        conceptFingerprint: '1:abc',
        standards: [
          { code: 'CCSS.MATH.CONTENT.6.EE.A.1', distance: 0.1234, framework: 'ccss' },
          { code: 'VA SOL.6.1.a', framework: 'vaSol' }
        ]
      } }),
      key: () => null,
      removeItem: () => undefined,
      setItem: () => undefined
    };

    try {
      assert.deepEqual(loadStoredBookStandards(1).chapter, {
        conceptFingerprint: '1:abc',
        standards: [
          { code: 'CCSS.6.EE.A.1', distance: 0.1234, framework: 'ccss' },
          { code: 'SOL.6.1.a', framework: 'vaSol' }
        ]
      });
    } finally {
      globalThis.localStorage = originalLocalStorage;
    }
  });
});
