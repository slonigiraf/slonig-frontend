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

  it('repairs imageDescription without storing any Exercise image bytes', (): void => {
    const original = {
      ...createExercise(1),
      imageDescription: 'An inaccurate description.'
    };
    const [review] = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        errors: ['The image description is inaccurate.'],
        exercise: {
          abilityMode: original.abilityMode,
          description: original.description,
          imageDescription: 'A triangle with side lengths 3, 4, and 5.',
          solution: original.solution,
          title: original.title
        },
        hasErrors: true,
        index: 0
      }]
    }), [original], [1]).reviews;

    assert.equal(review.exercise?.imageDescription, 'A triangle with side lengths 3, 4, and 5.');
    assert.equal('image' in (review.exercise ?? {}), false);
    assert.equal('images' in (review.exercise ?? {}), false);
  });

  it('accepts partial reviews and allows the highest-thinking Exercise to be kept regardless of input order', (): void => {
    const first = createExercise(1);
    const second = createExercise(2);
    const keepFirst = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedExerciseId: 2, keptExerciseId: 1 }],
      reviews: []
    }), [first, second], [1, 2]);
    const keepSecond = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedExerciseId: 1, keptExerciseId: 2 }],
      reviews: []
    }), [first, second], [1, 2]);

    assert.deepEqual(keepFirst, { duplicatePairs: [{ deletedExerciseId: 2, keptExerciseId: 1 }], reviews: [] });
    assert.deepEqual(keepSecond, { duplicatePairs: [{ deletedExerciseId: 1, keptExerciseId: 2 }], reviews: [] });
  });

  it('accepts partial same-concept duplicate selection without requiring exactly one retained Exercise', (): void => {
    const first = createExercise(1);
    const second = createExercise(2);
    const third = createExercise(3);

    assert.deepEqual(parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedExerciseId: 1, keptExerciseId: 2 }],
      reviews: []
    }), [first, second, third], [1, 2, 3]), {
      duplicatePairs: [{ deletedExerciseId: 1, keptExerciseId: 2 }],
      reviews: []
    });

    assert.deepEqual(parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: []
    }), [first, second, third], [1, 2, 3]), {
      duplicatePairs: [],
      reviews: []
    });
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
    assert.match(fixExercisesPrompt, /imageDescription/i);
    assert.match(fixExercisesPrompt, /only visual field/i);
    assert.match(fixExercisesPrompt, /decorative, illustrative/i);
    assert.match(fixExercisesPrompt, /conceptId/i);
    assert.match(fixExercisesPrompt, /preference rather than an absolute cardinality rule/i);
    assert.match(fixExercisesPrompt, /most learner thinking and information transformation/i);
    assert.match(fixExercisesPrompt, /merely asks the learner to explain/i);
    assert.match(fixExercisesPrompt, /weaker or redundant same-concept Exercises/i);
    assert.match(fixExercisesPrompt, /duplicatePairs/i);
    assert.match(fixExercisesPrompt, /keptExerciseId/i);
    assert.match(fixExercisesPrompt, /deletedExerciseId/i);
    assert.match(fixExercisesPrompt, /earliest supplied index only as a final tie-breaker/i);
    assert.match(fixExercisesPrompt, /omit correct Exercises/i);
    assert.match(fixExercisesPrompt, /Do not return or change database identity or relationship fields/i);
  });
});
