// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { parseSplitConcepts, splitConceptPrompt } from './splitConcept.js';

const parent = { title: 'Reading and writing numbers', description: 'Read and write the numbers 1 through 3.' };
const siblings = [{ title: 'Counting forward', description: 'Count in order.' }];
const valid = JSON.stringify({ concepts: [
  { title: 'Reading numbers', description: 'Recognize printed numerals.' },
  { title: 'Writing numbers', description: 'Write each numeral.' }
] });

describe('Split a Concept into children', () => {
  it('parses independently teachable child concepts and sentence-cases titles', () => {
    assert.deepEqual(parseSplitConcepts(valid, parent, siblings), [
      { title: 'Reading numbers', description: 'Recognize printed numerals.' },
      { title: 'Writing numbers', description: 'Write each numeral.' }
    ]);
  });

  it('keeps the parent on empty, single, malformed or duplicate suggestions', () => {
    assert.throws(() => parseSplitConcepts('{"concepts":[]}', parent, siblings), /cannot be split/);
    assert.throws(() => parseSplitConcepts('{"concepts":[{"title":"One","description":"Just one"}]}', parent, siblings), /cannot be split/);
    assert.throws(() => parseSplitConcepts('{"concepts":[{"title":"One"},{"title":"Two","description":"Fine"}]}', parent, siblings), /missing its title or description/);
    assert.throws(() => parseSplitConcepts('{"concepts":[{"title":"Counting forward","description":"Duplicate"},{"title":"Two","description":"Fine"}]}', parent, siblings), /duplicate/);
    assert.throws(() => parseSplitConcepts('{"concepts":[{"title":"Writing Numbers","description":"First"},{"title":"writing numbers","description":"Second"}]}', parent, siblings), /duplicate/);
    assert.throws(() => parseSplitConcepts('{"concepts":[{"title":"Reading and writing numbers","description":"Parent"},{"title":"Two","description":"Second"}]}', parent, siblings), /duplicate/);
  });

  it('limits the split to the parent and includes source context', () => {
    const prompt = splitConceptPrompt('Chapter 1', '--- page 2 ---\nSource material', parent, siblings, 'en-math', 'en', 8);

    assert.match(prompt, /Source material/);
    assert.match(prompt, /Reading and writing numbers/);
    assert.match(prompt, /Do not duplicate any existing sibling Concepts/);
    assert.match(prompt, /already atomic/);
  });
});
