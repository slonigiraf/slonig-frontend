// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { processExtractedChapterContent } from './bookProcessing.js';

describe('chapter content processing', (): void => {
  it('processes a whole chapter as one batch and restores page ownership', async (): Promise<void> => {
    const prompts: string[] = [];
    const processed = await processExtractedChapterContent({
      chapter: 'Chapter 1',
      pages: [
        {
          concepts: [{ description: 'A description', title: 'Concept A' }],
          exercises: [{ abilityMode: 'reasoning', description: 'Book task', solution: 'Book solution', title: 'Book exercise' }],
          pageNumber: 4
        },
        {
          concepts: [{ description: 'B description', title: 'Concept B' }],
          exercises: [],
          pageNumber: 5
        }
      ]
    }, (prompt) => {
      prompts.push(prompt);

      if (prompts.length === 1) {
        assert.match(prompt, /Concept A/);
        assert.match(prompt, /Concept B/);
        assert.doesNotMatch(prompt, /sourcePageNumber/);

        return Promise.resolve(JSON.stringify({ exercises: [
          { abilityMode: 'reasoning', conceptIndex: 0, description: 'Generated A', solution: 'Solution A', title: 'Exercise A' },
          { abilityMode: 'reasoning', conceptIndex: 1, description: 'Generated B', solution: 'Solution B', title: 'Exercise B' }
        ] }));
      }

      assert.doesNotMatch(prompt, /sourcePageNumber/);

      return Promise.resolve('{"reviews":[]}');
    });

    assert.equal(processed.chapter, 'Chapter 1');
    assert.equal(prompts.length, 2);
    assert.deepEqual(processed.pages.map(({ pageNumber }) => pageNumber), [4, 5]);
    assert.deepEqual(processed.pages[0].concepts.map(({ title }) => title), ['Concept A']);
    assert.deepEqual(processed.pages[1].concepts.map(({ title }) => title), ['Concept B']);
    assert.deepEqual(processed.pages[0].exercises.map(({ title }) => title), ['Book exercise', 'Exercise A']);
    assert.deepEqual(processed.pages[1].exercises.map(({ title }) => title), ['Exercise B']);
    assert.equal(processed.pages[0].exercises.find(({ title }) => title === 'Exercise A')?.conceptIndex, 0);
    assert.equal(processed.pages[1].exercises[0].conceptIndex, 0);
  });

  it('rejects duplicate page numbers inside one chapter batch', async (): Promise<void> => {
    await assert.rejects(() => processExtractedChapterContent({
      chapter: 'Chapter 1',
      pages: [
        { concepts: [], exercises: [], pageNumber: 1 },
        { concepts: [], exercises: [], pageNumber: 1 }
      ]
    }, () => Promise.resolve('{}')), /duplicate page number 1/);
  });
});
