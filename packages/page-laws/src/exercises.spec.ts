// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import type { Exercise } from '@slonigiraf/db';

import { strict as assert } from 'node:assert';

import { fixExercisesPrompt } from './constants.js';
import { parseExerciseRepairResult } from './exercises.js';

function createExercise (id: number, title = `Exercise ${id}`): Exercise {
  return {
    abilityMode: 'reasoning',
    bookPage: [1, 1],
    conceptId: 10,
    description: `Calculate ${id} + 1.`,
    id,
    solution: `${id} + 1 = ${id + 1}.`,
    source: 'generated',
    title
  } as Exercise;
}

describe('exercise repair', (): void => {
  it('preserves database relationship fields while applying corrected content', (): void => {
    const original = createExercise(1);
    const result = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        errors: ['The solution was incorrect.'],
        exercise: {
          abilityMode: 'reasoning',
          description: 'Calculate 1 + 2.',
          solution: '1 + 2 = 3.',
          title: 'Add two small integers'
        },
        hasErrors: true,
        index: 0
      }]
    }), [original], [1]);

    assert.equal(result.reviews[0].exercise?.id, 1);
    assert.deepEqual(result.reviews[0].exercise?.bookPage, original.bookPage);
    assert.equal(result.reviews[0].exercise?.conceptId, original.conceptId);
    assert.equal(result.reviews[0].exercise?.source, original.source);
    assert.equal(result.reviews[0].exercise?.solution, '1 + 2 = 3.');
  });

  it('accepts partial reviews and validates duplicate deletion pairs', (): void => {
    const first = createExercise(1);
    const second = createExercise(2);
    const result = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedExerciseId: 2, keptExerciseId: 1 }],
      reviews: []
    }), [first, second], [1, 2]);

    assert.deepEqual(result, { duplicatePairs: [{ deletedExerciseId: 2, keptExerciseId: 1 }], reviews: [] });
    assert.throws(() => parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedExerciseId: 1, keptExerciseId: 2 }],
      reviews: []
    }), [first, second], [1, 2]));
  });

  it('rejects a claimed repair that does not change the Exercise', (): void => {
    const original = createExercise(1);

    assert.throws(() => parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        errors: ['Claimed error'],
        exercise: {
          abilityMode: original.abilityMode,
          description: original.description,
          solution: original.solution,
          title: original.title
        },
        hasErrors: true,
        index: 0
      }]
    }), [original], [1]));
  });

  it('requires the prompt to repair Exercises without changing relationships', (): void => {
    assert.match(fixExercisesPrompt, /factual/i);
    assert.match(fixExercisesPrompt, /mathematical/i);
    assert.match(fixExercisesPrompt, /grammatical/i);
    assert.match(fixExercisesPrompt, /KaTeX/i);
    assert.match(fixExercisesPrompt, /duplicatePairs/i);
    assert.match(fixExercisesPrompt, /keptExerciseId/i);
    assert.match(fixExercisesPrompt, /deletedExerciseId/i);
    assert.match(fixExercisesPrompt, /earliest supplied index/i);
    assert.match(fixExercisesPrompt, /omit correct Exercises/i);
    assert.match(fixExercisesPrompt, /Do not return or change database identity or relationship fields/i);
  });
});
