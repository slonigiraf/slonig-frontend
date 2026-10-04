// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { exerciseGenerationRequestEstimate, processExtractedChapterContent } from './bookProcessing.js';

describe('chapter content processing', (): void => {
  it('processes a whole chapter as one batch and restores page ownership', async (): Promise<void> => {
    const prompts: string[] = [];
    const processed = await processExtractedChapterContent({
      chapter: 'Chapter 1',
      pages: [
        {
          concepts: [{ description: 'A description', title: 'Concept A' }],
          exercises: [{ description: 'Book task', solution: 'Book solution', title: 'Book exercise' }],
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
      assert.match(prompt, /Concept A/);
      assert.match(prompt, /Concept B/);
      assert.match(prompt, /single generation pass/i);
      assert.doesNotMatch(prompt, /sourcePageNumber/);

      return Promise.resolve(JSON.stringify({ exercises: [
        { conceptIndex: 0, description: 'Generated A', solution: 'Solution A', title: 'Exercise A' },
        { conceptIndex: 1, description: 'Generated B', solution: 'Solution B', title: 'Exercise B' }
      ] }));
    });

    assert.equal(processed.chapter, 'Chapter 1');
    assert.equal(prompts.length, 1);
    assert.deepEqual(processed.pages.map(({ pageNumber }) => pageNumber), [4, 5]);
    assert.deepEqual(processed.pages[0].concepts.map(({ title }) => title), ['Concept A']);
    assert.deepEqual(processed.pages[1].concepts.map(({ title }) => title), ['Concept B']);
    assert.deepEqual(processed.pages[0].exercises.map(({ title }) => title), ['Exercise A']);
    assert.deepEqual(processed.pages[1].exercises.map(({ title }) => title), ['Exercise B']);
    assert.equal(processed.pages[0].exercises.find(({ title }) => title === 'Exercise A')?.conceptIndex, 0);
    assert.equal(processed.pages[1].exercises[0].conceptIndex, 0);
  });


  it('estimates one exercise-generation request per chapter from unique concepts', (): void => {
    const estimate = exerciseGenerationRequestEstimate({
      chapter: 'Chapter 1',
      pages: [
        { concepts: [{ description: 'A description', title: 'Concept A' }], pageNumber: 4 },
        {
          concepts: [
            { description: 'A description', title: 'Concept A' },
            { description: 'B description', title: 'Concept B' }
          ],
          pageNumber: 5
        }
      ]
    }, 'English', 12);

    assert.ok(estimate);
    assert.equal(estimate.outputTokens, 640);
    assert.match(estimate.input, /Concept A/);
    assert.match(estimate.input, /Concept B/);
    assert.doesNotMatch(estimate.input, /sourcePageNumber/);
    assert.equal((estimate.input.match(/"conceptIndex":/g) ?? []).length, 2);
  });

  it('does not estimate an AI request for a chapter with no concepts', (): void => {
    assert.equal(exerciseGenerationRequestEstimate({ chapter: 'Empty', pages: [{ concepts: [], pageNumber: 1 }] }), undefined);
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
