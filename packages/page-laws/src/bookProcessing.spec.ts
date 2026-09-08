// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { areAllBookPagesConceptsProcessed, calculatePageSymbolStatistics, CONCEPT_SPLIT_PASSES, countUnprocessedBookPages, EXERCISE_SPLIT_PASSES, exerciseAbilityModes, GENERATED_EXERCISES_PER_CONCEPT, isWithinTwoStandardDeviations, MAX_EXERCISE_GENERATION_RETRIES, processExtractedPageContent } from './bookProcessing.js';

describe('book processing pipeline', (): void => {

  it('calculates book page symbol statistics and identifies pages within two standard deviations', (): void => {
    const statistics = calculatePageSymbolStatistics(['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100), 'd'.repeat(200)]);

    assert.ok(statistics);
    assert.equal(statistics.mean, 125);
    assert.ok(Math.abs(statistics.standardDeviation - 43.30127018922193) < 1e-10);
    assert.equal(isWithinTwoStandardDeviations(100, statistics), true);
    assert.equal(isWithinTwoStandardDeviations(220, statistics), false);
  });

  it('treats equal-length pages as within two standard deviations when standard deviation is zero', (): void => {
    const statistics = calculatePageSymbolStatistics(['a'.repeat(50), 'b'.repeat(50)]);

    assert.ok(statistics);
    assert.equal(statistics.mean, 50);
    assert.equal(statistics.standardDeviation, 0);
    assert.equal(isWithinTwoStandardDeviations(50, statistics), true);
    assert.equal(isWithinTwoStandardDeviations(49, statistics), false);
  });

  it('includes zero-symbol recognized pages in the book mean and standard deviation', (): void => {
    const statistics = calculatePageSymbolStatistics(['', 'a'.repeat(100), 'b'.repeat(100)]);

    assert.ok(statistics);
    assert.ok(Math.abs(statistics.mean - (200 / 3)) < 1e-10);
    assert.ok(statistics.standardDeviation > 0);
  });

  it('treats a processed page with zero concepts as complete for the Exercises stage', (): void => {
    const pages = [
      { conceptsProcessed: true, pageNumber: 1 },
      { conceptsProcessed: true, pageNumber: 2 },
      { conceptsProcessed: true, pageNumber: 3 }
    ];

    assert.equal(areAllBookPagesConceptsProcessed(3, pages), true);
    assert.equal(countUnprocessedBookPages(3, pages), 0);
  });

  it('keeps Exercises locked only while a page is actually unprocessed', (): void => {
    const pages = [
      { conceptsProcessed: true, pageNumber: 1 },
      { conceptsProcessed: false, pageNumber: 2 },
      { conceptsProcessed: true, pageNumber: 3 }
    ];

    assert.equal(areAllBookPagesConceptsProcessed(3, pages), false);
    assert.equal(countUnprocessedBookPages(3, pages), 1);
  });

  it('refines concepts, generates and merges exercises, then splits only the merged exercises', async (): Promise<void> => {
    const prompts: string[] = [];

    const runAi = (prompt: string): Promise<string> => {
      prompts.push(prompt);

      if (prompts.length === 1) {
        assert.doesNotMatch(prompt, /Book exercise/);

        return Promise.resolve(JSON.stringify({ concepts: [
          { description: 'First refinement', inputIndex: 0, title: 'Refined A' },
          { description: 'Second refinement', inputIndex: 0, title: 'Refined B' }
        ] }));
      }

      if (prompts.length === 2) {
        assert.match(prompt, /Refined A/);
        assert.match(prompt, /Refined B/);
        assert.doesNotMatch(prompt, /Book exercise/);

        return Promise.resolve(JSON.stringify({ concepts: [
          { description: 'Atomic A', inputIndex: 0, title: 'Atomic A' },
          { description: 'Atomic B', inputIndex: 1, title: 'Atomic B' }
        ] }));
      }

      if (prompts.length === 3) {
        assert.match(prompt, /Atomic A/);
        assert.match(prompt, /Atomic B/);
        assert.doesNotMatch(prompt, /Broad concept/);

        return Promise.resolve(JSON.stringify({ exercises: Array.from({ length: 8 }, (_, index) => ({
          abilityMode: exerciseAbilityModes[index % exerciseAbilityModes.length],
          conceptIndex: Math.floor(index / 4),
          description: `Generated task ${index}`,
          solution: `Generated solution ${index}`,
          title: `Generated ${index}`
        })) }));
      }

      const parsed = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: Array<{ abilityMode: string; description: string; inputIndex: number; solution: string; title: string }> };

      assert.equal(parsed.exercises.length, 9);
      assert.ok(parsed.exercises.some(({ title }) => title === 'Book exercise'));
      assert.ok(parsed.exercises.some(({ title }) => title === 'Generated 0'));

      return Promise.resolve(JSON.stringify({ exercises: parsed.exercises }));
    };

    const result = await processExtractedPageContent({
      chapter: 'Chapter',
      concepts: [{ description: 'Broad description', title: 'Broad concept' }],
      exercises: [{ abilityMode: 'reasoning', description: 'Complete book task', solution: 'Book solution', title: 'Book exercise' }]
    }, runAi);

    assert.equal(CONCEPT_SPLIT_PASSES, 2);
    assert.equal(EXERCISE_SPLIT_PASSES, 2);
    assert.equal(GENERATED_EXERCISES_PER_CONCEPT, 4);
    assert.equal(prompts.length, 5);
    assert.deepEqual(result.concepts.map(({ title }) => title), ['Atomic A', 'Atomic B']);
    assert.equal(result.exercises.length, 9);
    assert.equal(result.exercises.filter(({ source }) => source === 'book').length, 1);
    assert.equal(result.exercises.filter(({ source }) => source === 'generated').length, 8);
    assert.deepEqual(new Set(result.exercises.filter(({ source }) => source === 'generated').map(({ conceptIndex }) => conceptIndex)), new Set([0, 1]));
    assert.ok(result.exercises.every(({ abilityMode }) => exerciseAbilityModes.includes(abilityMode as typeof exerciseAbilityModes[number])));
  });

  it('generates and stores an image for a generated Exercise that requires one', async (): Promise<void> => {
    const prompts: string[] = [];
    const generatedImages: string[] = [];
    const runAi = (prompt: string): Promise<string> => {
      prompts.push(prompt);

      if (prompts.length <= 2) {
        return Promise.resolve(JSON.stringify({ concepts: [{ description: 'Atomic', inputIndex: 0, title: 'Concept' }] }));
      }

      if (prompts.length === 3) {
        return Promise.resolve(JSON.stringify({ exercises: [{
          abilityMode: 'perceptual observation',
          conceptIndex: 0,
          description: 'Read the marked value from the number line.',
          imageDescription: 'A horizontal number line from 0 to 10 with a single unlabeled point at 6.',
          solution: 'The marked value is 6.',
          title: 'Read the number line'
        }] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: unknown[] };

      return Promise.resolve(JSON.stringify({ exercises: input.exercises }));
    };
    const generateImage = (prompt: string): Promise<string> => {
      generatedImages.push(prompt);

      return Promise.resolve('data:image/png;base64,Z2VuZXJhdGVk');
    };
    const result = await processExtractedPageContent({
      chapter: 'Chapter',
      concepts: [{ description: 'Atomic', title: 'Concept' }],
      exercises: []
    }, runAi, generateImage);

    assert.equal(result.exercises.length, 1);
    assert.equal(result.exercises[0].image, 'data:image/png;base64,Z2VuZXJhdGVk');
    assert.deepEqual(result.exercises[0].images, ['data:image/png;base64,Z2VuZXJhdGVk']);
    assert.match(result.exercises[0].imageDescription ?? '', /number line/i);
    assert.deepEqual(generatedImages, [result.exercises[0].imageDescription]);
  });

  it('retains prior results when a split pass is empty', async (): Promise<void> => {
    let request = 0;

    const result = await processExtractedPageContent({
      chapter: 'Chapter',
      concepts: [{ description: 'Atomic', title: 'Concept' }],
      exercises: []
    }, () => Promise.resolve(request++ < 2 ? '{}' : JSON.stringify({ exercises: [] })));

    assert.deepEqual(result.concepts, [{ description: 'Atomic', title: 'Concept' }]);
    assert.deepEqual(result.exercises, []);
  });

  it('retries missing concepts together up to three times', async (): Promise<void> => {
    const prompts: string[] = [];
    const exercise = (conceptIndex: number): Record<string, unknown> => ({ abilityMode: 'reasoning', conceptIndex, description: `Task ${conceptIndex}`, solution: `Solution ${conceptIndex}`, title: `Exercise ${conceptIndex}` });

    const runAi = (prompt: string): Promise<string> => {
      prompts.push(prompt);

      if (prompts.length <= 2) {
        return Promise.resolve('{}');
      }

      if (prompts.length === 3) {
        return Promise.resolve(JSON.stringify({ exercises: [exercise(0)] }));
      }

      if (prompts.length <= 5) {
        const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { concepts: Array<{ conceptIndex: number }> };

        assert.deepEqual(input.concepts.map(({ conceptIndex }) => conceptIndex), [1]);

        return Promise.resolve('{"exercises":[]}');
      }

      if (prompts.length === 6) {
        assert.match(prompt, /recovery attempt 3 of 3/i);

        return Promise.resolve(JSON.stringify({ exercises: [exercise(1)] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: unknown[] };

      return Promise.resolve(JSON.stringify({ exercises: input.exercises }));
    };

    const result = await processExtractedPageContent({
      chapter: 'Chapter',
      concepts: [{ description: 'A', title: 'Concept A' }, { description: 'B', title: 'Concept B' }],
      exercises: []
    }, runAi);

    assert.equal(MAX_EXERCISE_GENERATION_RETRIES, 3);
    assert.equal(prompts.length, 8);
    assert.deepEqual(result.exercises.map(({ conceptIndex }) => conceptIndex), [0, 1]);
  });
});
