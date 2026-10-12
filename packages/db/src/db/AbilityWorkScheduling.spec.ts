// Copyright 2026 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { abilityFixHasChanges, abilityFixHasTextChanges, effectiveAbilityFixInstructions, emptyAbilityFixInstructions, prepareAbilityFixForScheduling } from './AbilityWork.js';

describe('Fix Ability scheduling without comments', (): void => {
  it('regenerates both exercises with no comments and no detected issues', (): void => {
    const instructions = prepareAbilityFixForScheduling(emptyAbilityFixInstructions());
    assert.equal(instructions.overall, '');
    assert.equal(instructions.regenerateExercises, true);
    assert.equal(abilityFixHasChanges(instructions), true);
    assert.equal(abilityFixHasTextChanges(effectiveAbilityFixInstructions(instructions)), true);
  });

  it('regenerates exercises and retains existing image errors for repair', (): void => {
    const instructions = emptyAbilityFixInstructions();
    instructions.exercise1QuestionImage = 'Overlapping question labels';
    instructions.exercise2AnswerImage = 'Answer diagram has wrong scale';
    const scheduled = prepareAbilityFixForScheduling(instructions);
    assert.equal(scheduled.regenerateExercises, true);
    assert.equal(scheduled.exercise1QuestionImage, 'Overlapping question labels');
    assert.equal(scheduled.exercise2AnswerImage, 'Answer diagram has wrong scale');
    assert.equal(effectiveAbilityFixInstructions(scheduled).exercise2AnswerImage, 'Answer diagram has wrong scale');
    assert.equal(abilityFixHasTextChanges(scheduled), true);
  });

  it('respects detailed text feedback without forcing both questions to change', (): void => {
    const instructions = emptyAbilityFixInstructions();
    instructions.exercise1Answer = 'Correct the mathematical result';
    instructions.exercise1QuestionImage = 'Missing labels';
    const scheduled = prepareAbilityFixForScheduling(instructions);
    assert.equal(scheduled.regenerateExercises, false);
    assert.equal(scheduled.exercise1Answer, 'Correct the mathematical result');
    assert.equal(scheduled.exercise1QuestionImage, 'Missing labels');
  });

  it('preserves explicit short-form priority over automatically detected errors', (): void => {
    const instructions = emptyAbilityFixInstructions();
    instructions.overall = 'Change the age level';
    instructions.exercise1QuestionImage = 'Overlapping labels';
    const scheduled = prepareAbilityFixForScheduling(instructions);
    assert.equal(scheduled.regenerateExercises, true);
    assert.equal(scheduled.overall, 'Change the age level');
    assert.equal(scheduled.exercise1QuestionImage, '');
  });

  it('does not force regeneration when reading a legacy image-only queue entry', (): void => {
    const instructions = emptyAbilityFixInstructions();
    instructions.exercise1QuestionImage = 'Overlapping labels';
    const loaded = effectiveAbilityFixInstructions(instructions);
    assert.equal(loaded.regenerateExercises, undefined);
    assert.equal(abilityFixHasTextChanges(loaded), false);
  });
});
