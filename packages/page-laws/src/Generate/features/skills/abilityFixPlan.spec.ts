// Copyright 2026 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { emptyAbilityFixInstructions, prepareAbilityFixForScheduling } from '@slonigiraf/db';
import { planAbilityFix, prepareRegeneratedAbilityVisuals } from './abilityFixPlan.js';
import type { GeneratedAbility } from '../../../abilities/abilities.js';

const original: GeneratedAbility = {
  t: 3, i: '', h: 'Coordinates', q: [
    { h: 'Plot A', a: '(2,3)', p: '\\begin{tikzpicture}\\end{tikzpicture}', i: '\\begin{tikzpicture}\\end{tikzpicture}', pPrompt: 'Blank grid', iPrompt: 'Plot point A' },
    { h: 'Plot B', a: '(4,1)', p: '\\begin{tikzpicture}\\end{tikzpicture}', i: '\\begin{tikzpicture}\\end{tikzpicture}', pPrompt: 'Second grid', iPrompt: 'Plot point B' }
  ]
};

describe('Queued Fix Ability plan', () => {
  it('plans one text request + two question images/QA + two dependent answer images/QA', () => {
    const scheduled = prepareAbilityFixForScheduling(emptyAbilityFixInstructions());
    const plan = planAbilityFix(scheduled, original);

    assert.equal(plan.fullRegeneration, true);
    assert.equal(plan.regenerateText, true);
    assert.deepEqual(plan.questionImages, [0, 1]);
    assert.deepEqual(plan.answerImages, [0, 1]);
    assert.equal(Number(plan.regenerateText) + 2 * (plan.questionImages.length + plan.answerImages.length), 9);
  });

  it('whole-Ability feedback schedules all images even when detailed notes are overridden', () => {
    const instructions = emptyAbilityFixInstructions();
    instructions.overall = 'Adapt this Ability for 8-year-olds';
    instructions.exercise1QuestionImage = 'Old error';
    const plan = planAbilityFix(prepareAbilityFixForScheduling(instructions), original);

    assert.equal(plan.fullRegeneration, true);
    assert.deepEqual(plan.questionImages, [0, 1]);
    assert.deepEqual(plan.answerImages, [0, 1]);
  });

  it('targeted answer-image repair uses its existing question without rewriting unrelated images', () => {
    const instructions = emptyAbilityFixInstructions();
    instructions.exercise2AnswerImage = 'Correct the marked point';
    const plan = planAbilityFix(instructions, original);

    assert.equal(plan.regenerateText, false);
    assert.deepEqual(plan.questionImages, []);
    assert.deepEqual(plan.answerImages, [1]);
  });

  it('regenerates the question first when the requested answer has no usable question TikZ', () => {
    const instructions = emptyAbilityFixInstructions();
    instructions.exercise2AnswerImage = 'Correct the marked point';
    const ability = { ...original, q: [original.q[0], { ...original.q[1], p: '' }] };
    const plan = planAbilityFix(instructions, ability);

    assert.deepEqual(plan.questionImages, [1]);
    assert.deepEqual(plan.answerImages, [1]);
  });

  it('clears obsolete image sources and creates fresh visual specifications for all exercises', () => {
    const rewritten = { ...original, q: original.q.map(({ pPrompt: _p, iPrompt: _i, ...exercise }) => ({ ...exercise })) };
    const prepared = prepareRegeneratedAbilityVisuals(rewritten);

    assert.ok(prepared.q.every(({ p, i, pPrompt, iPrompt }) => !p && !i && pPrompt && iPrompt));
    assert.ok(prepared.q[0].pPrompt?.includes('Plot A'));
    const changed = { ...original, q: [{ ...original.q[0], h: 'Find a different point' }, original.q[1]] };
    const fresh = prepareRegeneratedAbilityVisuals(changed, original);
    assert.ok(fresh.q[0].pPrompt?.includes('Find a different point'), 'copied old visual prompts must be replaced');
  });
});
