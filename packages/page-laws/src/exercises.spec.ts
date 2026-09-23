// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import type { Exercise } from '@slonigiraf/db';

import { strict as assert } from 'node:assert';

import { ABILITY_WORKFLOW_SYSTEM_PROMPT, FIX_EXERCISES_PROMPT, GENERATE_EXERCISES_PROMPT, REPAIR_SYSTEM_PROMPT } from './constants.js';
import { missingGeneratedExerciseConceptIndexes, parseExerciseRepairResult } from './exercises.js';

function createExercise (id: number, title = `Exercise ${id}`): Exercise {
  return {
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

  it('repairs question and solution visual descriptions without storing Exercise image bytes', (): void => {
    const original = {
      ...createExercise(1),
      imageDescription: 'An inaccurate description.',
      solutionImageDescription: 'An inaccurate solution visual.'
    };
    const [review] = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        errors: ['The image description is inaccurate.'],
        exercise: {
          description: original.description,
          imageDescription: 'A triangle with side lengths 3, 4, and 5.',
          solution: original.solution,
          solutionImageDescription: 'The same triangle with the correct altitude drawn from the top vertex to the base.',
          title: original.title
        },
        hasErrors: true,
        index: 0
      }]
    }), [original], [1]).reviews;

    assert.equal(review.exercise?.imageDescription, 'A triangle with side lengths 3, 4, and 5.');
    assert.match(review.exercise?.solutionImageDescription ?? '', /correct altitude/i);
    assert.equal('image' in (review.exercise ?? {}), false);
    assert.equal('images' in (review.exercise ?? {}), false);
  });

  it('allows Fix Exercises to remove an unnecessary solution image description', (): void => {
    const original = {
      ...createExercise(1),
      description: 'Calculate the x-coordinate of the point <kx>(2,3)</kx>.',
      solution: 'The x-coordinate is <kx>2</kx>.',
      solutionImageDescription: 'A coordinate plane with the point (2,3) plotted and labeled.'
    };
    const [review] = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        errors: ['The solution visual is unnecessary.'],
        exercise: {
          description: original.description,
          imageDescription: '',
          solution: original.solution,
          solutionImageDescription: '',
          title: original.title
        },
        hasErrors: true,
        index: 0
      }]
    }), [original], [1]).reviews;

    assert.equal(review.exercise?.solutionImageDescription ?? '', '');
    assert.equal('solutionImageDescription' in (review.exercise ?? {}), false);
  });

  it('allows Fix Exercises to add a missing solution image description', (): void => {
    const original = {
      ...createExercise(1),
      description: 'Sketch the graph of <kx>y=x+1</kx>.',
      solution: 'Plot two points and draw the straight line through them.',
      solutionImageDescription: ''
    };
    const [review] = parseExerciseRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        errors: ['The required solution image description is missing.'],
        exercise: {
          description: original.description,
          imageDescription: '',
          solution: original.solution,
          solutionImageDescription: 'A coordinate plane showing the completed straight line y=x+1 through correctly plotted points such as (0,1) and (1,2).',
          title: original.title
        },
        hasErrors: true,
        index: 0
      }]
    }), [original], [1]).reviews;

    assert.match(review.exercise?.solutionImageDescription ?? '', /y=x\+1/i);
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
    assert.match(FIX_EXERCISES_PROMPT, /factual/i);
    assert.match(FIX_EXERCISES_PROMPT, /mathematical/i);
    assert.match(FIX_EXERCISES_PROMPT, /grammatical/i);
    assert.match(FIX_EXERCISES_PROMPT, /yes\/no or equivalent binary-response task/i);
    assert.match(FIX_EXERCISES_PROMPT, /treat every existing yes\/no or equivalent binary-response Exercise as erroneous/i);
    assert.match(FIX_EXERCISES_PROMPT, /do not merely swap yes\/no for true\/false or another two-choice format/i);
    assert.match(FIX_EXERCISES_PROMPT, /age-level mismatch/i);
    assert.match(FIX_EXERCISES_PROMPT, /AGE-LEVEL AUDIT/i);
    assert.match(FIX_EXERCISES_PROMPT, /learnerAge/i);
    assert.match(FIX_EXERCISES_PROMPT, /vocabulary, sentence complexity, assumed prerequisite knowledge, cognitive load/i);
    assert.match(FIX_EXERCISES_PROMPT, /same learning target, required method, represented form, and learner modality/i);
    assert.match(FIX_EXERCISES_PROMPT, /KaTeX/i);
    assert.match(FIX_EXERCISES_PROMPT, /imageDescription/i);
    assert.match(FIX_EXERCISES_PROMPT, /only visual-description fields/i);
    assert.match(FIX_EXERCISES_PROMPT, /decorative, illustrative/i);
    assert.match(FIX_EXERCISES_PROMPT, /Preserve the Exercise's learner modality/i);
    assert.doesNotMatch(FIX_EXERCISES_PROMPT, /abilityMode/i);
    assert.match(FIX_EXERCISES_PROMPT, /Preserve the represented form/i);
    assert.match(FIX_EXERCISES_PROMPT, /Prefer one short sentence/i);
    assert.match(FIX_EXERCISES_PROMPT, /6-16 words/i);
    assert.match(FIX_EXERCISES_PROMPT, /needless verbosity/i);
    assert.match(FIX_EXERCISES_PROMPT, /non-obvious solution that omits essential solving steps/i);
    assert.match(FIX_EXERCISES_PROMPT, /essential steps in logical order/i);
    assert.doesNotMatch(FIX_EXERCISES_PROMPT, /fraction-representation concepts|fraction strip|number line/i);
    assert.match(FIX_EXERCISES_PROMPT, /solutionImageDescription/i);
    assert.match(FIX_EXERCISES_PROMPT, /EXPECTED ANSWER FORMAT/i);
    assert.match(FIX_EXERCISES_PROMPT, /draw, sketch, plot, graph, construct/i);
    assert.match(FIX_EXERCISES_PROMPT, /existing nonempty solutionImageDescription is not proof/i);
    assert.match(FIX_EXERCISES_PROMPT, /Clear it when this answer-format audit/i);
    assert.match(FIX_EXERCISES_PROMPT, /conceptId/i);
    assert.match(FIX_EXERCISES_PROMPT, /preference rather than an absolute cardinality rule/i);
    assert.match(FIX_EXERCISES_PROMPT, /most learner thinking and information transformation/i);
    assert.match(FIX_EXERCISES_PROMPT, /strongest age-appropriate Exercise/i);
    assert.match(FIX_EXERCISES_PROMPT, /without exceeding that learner age/i);
    assert.match(FIX_EXERCISES_PROMPT, /age-appropriateness overrides preserving an incompatible original difficulty/i);
    assert.match(FIX_EXERCISES_PROMPT, /merely asks the learner to explain/i);
    assert.match(FIX_EXERCISES_PROMPT, /weaker or redundant same-concept Exercises/i);
    assert.match(FIX_EXERCISES_PROMPT, /duplicatePairs/i);
    assert.match(FIX_EXERCISES_PROMPT, /keptExerciseId/i);
    assert.match(FIX_EXERCISES_PROMPT, /deletedExerciseId/i);
    assert.match(FIX_EXERCISES_PROMPT, /earliest supplied index only as a final tie-breaker/i);
    assert.match(FIX_EXERCISES_PROMPT, /omit correct Exercises/i);
    assert.match(FIX_EXERCISES_PROMPT, /Do not return or change database identity or relationship fields/i);
  });

  it('includes learner age in Exercise, Ability, and repair prompt context', (): void => {
    const learnerAge = 9;
    const exercisePrompt = GENERATE_EXERCISES_PROMPT('English', learnerAge);
    const abilityPrompt = ABILITY_WORKFLOW_SYSTEM_PROMPT('en', 'Fractions', learnerAge);
    const repairPrompt = REPAIR_SYSTEM_PROMPT('en', learnerAge);

    assert.match(exercisePrompt, /current learner age is 9 years/i);
    assert.match(exercisePrompt, /visual content appropriate for a 9-year-old learner/i);
    assert.match(abilityPrompt, /current learner age is 9 years/i);
    assert.match(repairPrompt, /current learner age is 9 years/i);
  });

  it('prohibits yes/no and equivalent binary-response generated Exercises', (): void => {
    const prompt = GENERATE_EXERCISES_PROMPT('English');

    assert.match(prompt, /Never generate a yes\/no Exercise or any equivalent binary-response task/i);
    assert.match(prompt, /true\/false, correct\/incorrect, right\/wrong, does\/does not, can\/cannot/i);
    assert.match(prompt, /substantive answer content beyond a binary judgment/i);
    assert.match(prompt, /Do not evade this rule by replacing yes\/no with another two-option wording/i);
  });

  it('asks generated Exercise solutions to show non-obvious solving steps', (): void => {
    const prompt = GENERATE_EXERCISES_PROMPT('English');

    assert.match(prompt, /make the solving method visible whenever the answer is not immediately obvious/i);
    assert.match(prompt, /non-obvious or multi-step task/i);
    assert.match(prompt, /essential steps in logical order/i);
    assert.match(prompt, /intermediate calculations, transformations, or reasons/i);
    assert.match(prompt, /do not skip a meaningful transition/i);
  });
});

describe('missing generated exercises', (): void => {
  it('returns zero-based concept ranks that have no generated exercise', (): void => {
    const concepts = [{ id: 10 }, { id: 11 }, { id: 12 }, { id: 13 }, { id: 14 }];
    const exercises = [
      { conceptId: 10, source: 'generated' },
      { conceptId: 12, source: 'generated' }
    ] as Array<Pick<Exercise, 'conceptId' | 'source'>>;

    assert.deepEqual(missingGeneratedExerciseConceptIndexes(concepts, exercises), [1, 3, 4]);
  });

  it('does not count a non-generated exercise as the generated exercise shown in the Exercise tab', (): void => {
    const concepts = [{ id: 10 }, { id: 11 }];
    const exercises = [
      { conceptId: 10, source: 'book' },
      { conceptId: 11, source: 'generated' }
    ] as Array<Pick<Exercise, 'conceptId' | 'source'>>;

    assert.deepEqual(missingGeneratedExerciseConceptIndexes(concepts, exercises), [0]);
  });

  it('treats concepts without an id as missing because no exercise can link to them', (): void => {
    assert.deepEqual(missingGeneratedExerciseConceptIndexes([{ id: undefined }], []), [0]);
  });
});

