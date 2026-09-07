// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { CONCEPT_SPLIT_PASSES, EXERCISE_SPLIT_PASSES, exerciseAbilityModes, GENERATED_EXERCISES_PER_CONCEPT, MAX_EXERCISE_GENERATION_RETRIES, processExtractedPageContent } from './bookProcessing.js';

describe('book processing pipeline', (): void => {
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
