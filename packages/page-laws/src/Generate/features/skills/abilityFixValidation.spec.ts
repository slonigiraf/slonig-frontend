// Copyright 2026 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AbilityFixInstructions } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../abilities/abilities.js';
import { assertAbilityFixResultChanged, isWholeAbilityRegenerationRequest } from './abilityFixValidation.js';

const original: GeneratedAbility = {
  h: 'Addition', i: 'Practice addition', t: 3,
  q: [
    { h: 'What is 2 + 3?', a: '5', p: '', i: '' },
    { h: 'What is 4 + 5?', a: '9', p: '', i: '' }
  ]
};

const notes = (overall = ''): AbilityFixInstructions => ({
  overall, title: '', exercise1Question: '', exercise1QuestionImage: '',
  exercise1Answer: '', exercise1AnswerImage: '', exercise2Question: '',
  exercise2QuestionImage: '', exercise2Answer: '', exercise2AnswerImage: ''
});

describe('scheduled Fix Ability result validation', (): void => {
  it('recognizes plain whole-Ability regeneration instructions', (): void => {
    assert.equal(isWholeAbilityRegenerationRequest('Regenerate'), true);
    assert.equal(isWholeAbilityRegenerationRequest('Please regenerate the ability.'), true);
    assert.equal(isWholeAbilityRegenerationRequest('Correct the first answer'), false);
  });

  it('rejects unchanged output when no comments were submitted', (): void => {
    const withoutComments = { ...notes(), regenerateExercises: true };
    assert.throws(() => assertAbilityFixResultChanged(original, structuredClone(original), withoutComments), /two new exercises/);
  });

  it('rejects partial default regeneration even with existing image errors', (): void => {
    const withErrors = { ...notes(), regenerateExercises: true, exercise1QuestionImage: 'Diagram labels overlap' };
    const partial = structuredClone(original);
    partial.q[0].h = 'What is 7 + 6?';
    partial.q[0].a = '13';
    assert.throws(() => assertAbilityFixResultChanged(original, partial, withErrors), /two new exercises/);
  });

  it('accepts two changed questions for an unannotated scheduled regeneration', (): void => {
    const regenerated = structuredClone(original);
    regenerated.q[0].h = 'What is 8 + 6?';
    regenerated.q[0].a = '14';
    regenerated.q[1].h = 'What is 7 + 9?';
    regenerated.q[1].a = '16';
    assert.equal(assertAbilityFixResultChanged(original, regenerated, { ...notes(), regenerateExercises: true }), regenerated);
  });

  it('rejects identical output for Regenerate instead of marking the queue item successful', (): void => {
    assert.throws(() => assertAbilityFixResultChanged(original, structuredClone(original), notes('Regenerate')), /two new exercises/);
  });

  it('rejects an unchanged second exercise even if the first was changed', (): void => {
    const partial = structuredClone(original);
    partial.q[0].h = 'What is 8 + 3?';
    partial.q[0].a = '11';
    assert.throws(() => assertAbilityFixResultChanged(original, partial, notes('Regenerate')), /two new exercises/);
  });

  it('does not count answer-only edits as regenerating the entire Ability', (): void => {
    const answerOnly = structuredClone(original);
    answerOnly.q[0].a = '6';
    answerOnly.q[1].a = '10';
    assert.throws(() => assertAbilityFixResultChanged(original, answerOnly, notes('Regenerate')), /question was not rewritten/);
  });

  it('accepts two rewritten exercises with correct matching answers', (): void => {
    const corrected = structuredClone(original);
    corrected.q[0].h = 'What is 6 + 7?';
    corrected.q[0].a = '13';
    corrected.q[1].h = 'What is 9 + 5?';
    corrected.q[1].a = '14';
    assert.equal(assertAbilityFixResultChanged(original, corrected, notes('Regenerate')), corrected);
  });

  it('rejects whitespace-only changes for general feedback', (): void => {
    const same = structuredClone(original);
    same.q[0].h = ' What is 2  + 3?  ';
    assert.throws(() => assertAbilityFixResultChanged(original, same, notes('Make it clearer')), /unchanged/);
  });

  it('requires each specifically requested field to actually change', (): void => {
    const corrections = notes();
    corrections.exercise1Question = 'Rewrite this question';
    corrections.exercise2Answer = 'Correct this answer';
    const partial = structuredClone(original);
    partial.q[0].h = 'What is 10 + 1?';
    assert.throws(() => assertAbilityFixResultChanged(original, partial, corrections), /exercise2Answer/);
    partial.q[1].a = '14';
    assert.equal(assertAbilityFixResultChanged(original, partial, corrections), partial);
  });
});
