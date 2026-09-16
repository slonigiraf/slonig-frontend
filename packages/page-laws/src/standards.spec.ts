// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { loadStandardsCatalogsForBookSubject, loadStoredBookStandards, mergeStandardsMatches, moduleStandardsText, parseStandardsFixResult, parseStandardsMatches, STANDARDS_FIX_RUNS, STANDARDS_MATCH_RUNS, standardsCandidateShortlist, standardsConceptFingerprint, standardsConceptInputs, standardsFixInputs, standardsFixPrompt, standardsMatchingPrompt, standardsPathForBookSubject, type StandardsCatalog } from './standards.js';

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
  it('runs standards matching three times', (): void => {
    assert.equal(STANDARDS_MATCH_RUNS, 3);
    assert.equal(STANDARDS_FIX_RUNS, 3);
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

  it('builds a matching prompt from chapter concepts and the authoritative standards catalog', (): void => {
    const prompt = standardsMatchingPrompt('Ratios', [{
      description: 'A unit rate compares two quantities with a second quantity of one.',
      title: 'Unit rates'
    }], catalog);

    assert.match(prompt, /chapter concepts/i);
    assert.match(prompt, /complete set of codes/i);
    assert.match(prompt, /Never invent/i);
    assert.match(prompt, /Unit rates/);
    assert.match(prompt, /CCSS\.6\.RP\.A\.2/);
    assert.match(prompt, /data\/standards\/en\/math\/common-core\.json/);
    assert.doesNotMatch(prompt, /Ability questions/i);
  });

  it('retrieves a small relevant candidate set instead of sending a whole large catalog to matching', (): void => {
    const largeCatalog: StandardsCatalog = {
      ...catalog,
      standards: [
        ...Array.from({ length: 100 }, (_, index) => ({
          code: `CCSS.K.CC.A.${index}`,
          context: 'Kindergarten > Counting',
          description: `Count objects in an unrelated counting task number ${index}.`
        })),
        {
          code: 'CCSS.6.EE.A.2b',
          context: '6 > Apply and extend previous understandings of arithmetic to algebraic expressions',
          description: 'Identify parts of an expression using mathematical terms (sum, term, product, factor, quotient, coefficient).'
        }
      ]
    };
    const candidates = standardsCandidateShortlist([{
      description: 'A coefficient is a constant multiplied by a variable, and a term is a product in an expression.',
      title: 'Coefficient'
    }], largeCatalog, 20);

    assert.ok(candidates.some(({ code }) => code === 'CCSS.6.EE.A.2b'));
    assert.ok(candidates.length < largeCatalog.standards.length);
  });

  it('builds an independent deletion-only Fix standards prompt from concepts and assigned standards JSON', (): void => {
    const concepts = [{ description: 'A unit rate compares two quantities with a second quantity of one.', title: 'Unit rates' }];
    const inputs = standardsFixInputs([{ code: 'CCSS.6.RP.A.2', framework: 'ccss' }], [catalog]);
    const prompt = standardsFixPrompt('Ratios', concepts, inputs);

    assert.deepEqual(inputs, [{
      code: 'CCSS.6.RP.A.2',
      context: '6 > Understand ratio concepts',
      description: 'Understand the concept of a unit rate.',
      framework: 'ccss'
    }]);
    assert.match(prompt, /Concepts JSON/);
    assert.match(prompt, /Standards JSON/);
    assert.match(prompt, /independently/i);
    assert.match(prompt, /exactly one decision/i);
    assert.match(prompt, /required actions/i);
    assert.match(prompt, /deletion-only/i);
    assert.match(prompt, /Unit rates/);
    assert.match(prompt, /CCSS\.6\.RP\.A\.2/);
  });

  it('requires Fix standards to decide every assigned standard and never add new ones', (): void => {
    const inputs = standardsFixInputs([
      { code: 'CCSS.6.RP.A.2', framework: 'ccss' },
      { code: 'CCSS.6.EE.A.1', framework: 'ccss' }
    ], [catalog]);

    assert.deepEqual(parseStandardsFixResult('{"decisions":[{"framework":"ccss","code":"CCSS.6.RP.A.2","keep":true},{"framework":"ccss","code":"CCSS.6.EE.A.1","keep":false}]}', inputs), [
      { code: 'CCSS.6.RP.A.2', framework: 'ccss' }
    ]);
    assert.throws(
      () => parseStandardsFixResult('{"decisions":[{"framework":"ccss","code":"CCSS.7.RP.A.1","keep":true},{"framework":"ccss","code":"CCSS.6.EE.A.1","keep":false}]}', inputs),
      /not present in the assigned standards/i
    );
    assert.throws(
      () => parseStandardsFixResult('{"decisions":[{"framework":"ccss","code":"CCSS.6.RP.A.2","keep":true}]}', inputs),
      /did not return a decision/i
    );
  });

  it('joins standards detected across repeated matching runs without duplicates', (): void => {
    assert.deepEqual(mergeStandardsMatches([
      [{ code: 'CCSS.6.RP.A.2', framework: 'ccss' }],
      [{ code: 'CCSS.6.EE.A.1', framework: 'ccss' }],
      [
        { code: 'CCSS.6.RP.A.2', framework: 'ccss' },
        { code: '6.4A', framework: 'teks' }
      ]
    ]), [
      { code: 'CCSS.6.RP.A.2', framework: 'ccss' },
      { code: 'CCSS.6.EE.A.1', framework: 'ccss' },
      { code: '6.4A', framework: 'teks' }
    ]);
  });

  it('can require repeated matching runs to agree before a standard survives', (): void => {
    assert.deepEqual(mergeStandardsMatches([
      [
        { code: 'CCSS.6.RP.A.2', framework: 'ccss' },
        { code: 'CCSS.6.EE.A.1', framework: 'ccss' }
      ],
      [{ code: 'CCSS.6.RP.A.2', framework: 'ccss' }],
      []
    ], 2), [{ code: 'CCSS.6.RP.A.2', framework: 'ccss' }]);

    assert.deepEqual(mergeStandardsMatches([
      [
        { code: 'CCSS.6.RP.A.2', framework: 'ccss' },
        { code: 'CCSS.6.RP.A.2', framework: 'ccss' }
      ],
      []
    ], 2), []);
  });

  it('accepts only standard codes that were supplied in the catalog', (): void => {
    assert.deepEqual(parseStandardsMatches('{"codes":["CCSS.6.RP.A.2","CCSS.6.RP.A.2"]}', catalog), [
      { code: 'CCSS.6.RP.A.2', framework: 'ccss' }
    ]);

    assert.throws(
      () => parseStandardsMatches('{"codes":["CCSS.7.RP.A.1"]}', catalog),
      /not present in data\/standards\/en\/math\/common-core\.json/i
    );
  });

  it('normalizes a long-form Common Core response only when the normalized code exists in the supplied catalog', (): void => {
    const expressionCatalog: StandardsCatalog = {
      ...catalog,
      standards: [{ code: 'CCSS.6.EE.A.1', context: '6', description: 'Expressions' }]
    };

    assert.deepEqual(parseStandardsMatches('{"codes":["CCSS.MATH.CONTENT.6.EE.A.1"]}', expressionCatalog), [
      { code: 'CCSS.6.EE.A.1', framework: 'ccss' }
    ]);
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

  it('loads current concept-based stored standards and normalizes old long-form CCSS codes inside them', (): void => {
    const originalLocalStorage = globalThis.localStorage;

    globalThis.localStorage = {
      length: 1,
      clear: () => undefined,
      getItem: () => JSON.stringify({ chapter: {
        conceptFingerprint: '1:abc',
        standards: [
          { code: 'CCSS.MATH.CONTENT.6.EE.A.1', framework: 'ccss' },
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
          { code: 'CCSS.6.EE.A.1', framework: 'ccss' },
          { code: 'SOL.6.1.a', framework: 'vaSol' }
        ]
      });
    } finally {
      globalThis.localStorage = originalLocalStorage;
    }
  });
});
