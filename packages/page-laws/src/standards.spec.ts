// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { completeStandardsCompatibility, conceptFingerprint, parseStandardsAssignment, parseStandardsCompatibility, standardsAssignmentPrompt, standardsCompatibilityPrompt } from './standards.js';

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
    const compatibilityPrompt = standardsCompatibilityPrompt('Ratios', [{ title: 'Unit rate', description: 'Compare two quantities.' }]);
    const assignmentPrompt = standardsAssignmentPrompt('Ratios', [{ title: 'Unit rate', description: 'Compare two quantities.' }], ['ccss', 'teks']);

    assert.match(compatibilityPrompt, /compatibility pass/i);
    assert.match(compatibilityPrompt, /do not return standard codes yet/i);
    assert.match(compatibilityPrompt, /ALL four keys present/i);
    assert.match(compatibilityPrompt, /not a single-choice classification/i);
    assert.match(assignmentPrompt, /ONLY from the compatible frameworks/i);
    assert.match(assignmentPrompt, /Common Core State Standards \(ccss\)/);
    assert.match(assignmentPrompt, /Texas Essential Knowledge and Skills \(teks\)/);
    assert.match(assignmentPrompt, /Search EACH compatible framework independently/i);
    assert.match(assignmentPrompt, /NGSS\.4-ESS3-1/);
    assert.match(assignmentPrompt, /TEKS\.MA\.6\.3\.D/);
    assert.match(assignmentPrompt, /VA SOL\.CE\.6\.6\.a/);
  });

  it('changes the fingerprint when chapter concepts change', (): void => {
    assert.notEqual(
      conceptFingerprint([{ title: 'A', description: 'First' }]),
      conceptFingerprint([{ title: 'A', description: 'Second' }])
    );
  });
});
