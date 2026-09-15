// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { abilityQuestionFingerprint, completeStandardsCompatibility, loadStoredBookStandards, parseStandardsAssignment, parseStandardsCompatibility, representativeAbilityQuestions, standardsAssignmentPrompt, standardsCompatibilityPrompt } from './standards.js';

describe('chapter standards', (): void => {
  it('keeps only valid codes and preserves the requested framework order', (): void => {
    assert.deepEqual(parseStandardsAssignment(JSON.stringify({ standards: {
      ccss: ['CCSS.6.NS.B.3', 'CCSS.6.NS.B.3'],
      ngss: ['NGSS.4-ESS3-1'],
      teks: ['TEKS.MA.6.3.D'],
      vaSol: ['VA SOL.CE.6.6.a']
    } })), [
      { code: 'CCSS.6.NS.B.3', framework: 'ccss' },
      { code: 'NGSS.4-ESS3-1', framework: 'ngss' },
      { code: 'TEKS.MA.6.3.D', framework: 'teks' },
      { code: 'VA SOL.CE.6.6.a', framework: 'vaSol' }
    ]);
  });

  it('normalizes long-form Common Core math codes to the compact CCSS format', (): void => {
    assert.deepEqual(parseStandardsAssignment(JSON.stringify({ standards: {
      ccss: ['CCSS.MATH.CONTENT.6.EE.A.1'], ngss: [], teks: [], vaSol: []
    } })), [{ code: 'CCSS.6.EE.A.1', framework: 'ccss' }]);
  });

  it('normalizes previously stored long-form Common Core math codes on load', (): void => {
    const originalLocalStorage = globalThis.localStorage;

    globalThis.localStorage = {
      length: 1,
      clear: () => undefined,
      getItem: () => JSON.stringify({ chapter: {
        abilityQuestionFingerprint: '1:abc',
        standards: [{ code: 'CCSS.MATH.CONTENT.6.EE.A.1', framework: 'ccss' }]
      } }),
      key: () => null,
      removeItem: () => undefined,
      setItem: () => undefined
    };

    try {
      assert.equal(loadStoredBookStandards(1).chapter?.standards[0]?.code, 'CCSS.6.EE.A.1');
    } finally {
      globalThis.localStorage = originalLocalStorage;
    }
  });

  it('rejects malformed codes instead of storing invented formats', (): void => {
    assert.throws(() => parseStandardsAssignment(JSON.stringify({ standards: {
      ccss: ['6.NS.B.3'], ngss: [], teks: [], vaSol: []
    } })), /invalid ccss standard code/i);
  });

  it('allows a framework to have no applicable standards', (): void => {
    assert.deepEqual(parseStandardsAssignment(JSON.stringify({ standards: {
      ccss: [], ngss: ['NGSS.MS-ESS3-3'], teks: [], vaSol: []
    } })), [{ code: 'NGSS.MS-ESS3-3', framework: 'ngss' }]);
  });

  it('parses compatibility in canonical framework order', (): void => {
    assert.deepEqual(parseStandardsCompatibility('{"compatible":["vaSol","ccss","ngss"]}'), ['ccss', 'ngss', 'vaSol']);
  });


  it('parses explicit compatibility decisions for every framework', (): void => {
    assert.deepEqual(parseStandardsCompatibility('{"compatibility":{"ccss":true,"ngss":false,"teks":true,"vaSol":true}}'), ['ccss', 'teks', 'vaSol']);
  });

  it('keeps TEKS and Virginia SOL as crosswalk targets when CCSS or NGSS is compatible', (): void => {
    assert.deepEqual(completeStandardsCompatibility(['ccss']), ['ccss', 'teks', 'vaSol']);
    assert.deepEqual(completeStandardsCompatibility(['ngss']), ['ngss', 'teks', 'vaSol']);
  });

  it('rejects unknown compatibility framework keys', (): void => {
    assert.throws(() => parseStandardsCompatibility('{"compatible":["ccss","unknown"]}'), /unknown standards framework/i);
  });

  it('builds a separate compatibility pass before code assignment', (): void => {
    const compatibilityPrompt = standardsCompatibilityPrompt('Ratios', [{ question: 'Find the unit rate for 12 miles in 3 hours.' }]);
    const assignmentPrompt = standardsAssignmentPrompt('Ratios', [{ question: 'Find the unit rate for 12 miles in 3 hours.' }], ['ccss', 'teks']);

    assert.match(compatibilityPrompt, /compatibility pass/i);
    assert.match(compatibilityPrompt, /do not return standard codes yet/i);
    assert.match(compatibilityPrompt, /ALL four keys present/i);
    assert.match(compatibilityPrompt, /not a single-choice classification/i);
    assert.match(compatibilityPrompt, /one representative question from each finalized two-question Ability pair/i);
    assert.match(compatibilityPrompt, /Representative Ability questions:/i);
    assert.doesNotMatch(compatibilityPrompt, /Concepts:/i);
    assert.match(assignmentPrompt, /ONLY from the compatible frameworks/i);
    assert.match(assignmentPrompt, /Common Core State Standards \(ccss\)/);
    assert.match(assignmentPrompt, /Texas Essential Knowledge and Skills \(teks\)/);
    assert.match(assignmentPrompt, /Search EACH compatible framework independently/i);
    assert.match(assignmentPrompt, /Representative Ability questions:/i);
    assert.doesNotMatch(assignmentPrompt, /Concepts:/i);
    assert.match(assignmentPrompt, /CCSS\.6\.EE\.A\.1 rather than CCSS\.MATH\.CONTENT\.6\.EE\.A\.1/);
    assert.match(assignmentPrompt, /NGSS\.4-ESS3-1/);
    assert.match(assignmentPrompt, /TEKS\.MA\.6\.3\.D/);
    assert.match(assignmentPrompt, /VA SOL\.CE\.6\.6\.a/);
  });

  it('takes exactly the first question from each Ability pair', (): void => {
    assert.deepEqual(representativeAbilityQuestions([
      { q: [{ h: 'First A' }, { h: 'Second A' }] },
      { q: [{ h: 'First B' }, { h: 'Second B' }] }
    ]), [{ question: 'First A' }, { question: 'First B' }]);
  });

  it('rejects an Ability that is not a complete two-question pair', (): void => {
    assert.throws(() => representativeAbilityQuestions([{ q: [{ h: 'Only one' }] }]), /exactly two nonempty questions/i);
  });

  it('changes the fingerprint when representative Ability questions change', (): void => {
    assert.notEqual(
      abilityQuestionFingerprint([{ question: 'First' }]),
      abilityQuestionFingerprint([{ question: 'Second' }])
    );
  });
});
