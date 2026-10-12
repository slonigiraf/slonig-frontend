// Copyright 2026 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AbilityFixInstructions } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../abilities/abilities.js';

import { abilityFixHasTextChanges, effectiveAbilityFixInstructions } from '@slonigiraf/db';
import { isTikzCode } from '../../../Edit/tikz.js';

/** A single plan is shared by the cost estimate and queued execution. Each
 * answer figure is produced AFTER its exercise's question figure has passed QA. */
export interface AbilityFixPlan {
  fullRegeneration: boolean;
  regenerateText: boolean;
  questionImages: number[];
  answerImages: number[];
}

export function planAbilityFix (request: AbilityFixInstructions, ability: GeneratedAbility): AbilityFixPlan {
  const instructions = effectiveAbilityFixInstructions(request);
  const fullRegeneration = Boolean(instructions.regenerateExercises || instructions.overall.trim());
  const questionImages: number[] = [];
  const answerImages: number[] = [];

  ability.q.slice(0, 2).forEach((exercise, index) => {
    const number = index + 1;
    const questionNote = instructions[`exercise${number}QuestionImage` as 'exercise1QuestionImage' | 'exercise2QuestionImage']?.trim();
    const answerNote = instructions[`exercise${number}AnswerImage` as 'exercise1AnswerImage' | 'exercise2AnswerImage']?.trim();
    const questionTextNote = instructions[`exercise${number}Question` as 'exercise1Question' | 'exercise2Question']?.trim();
    const answerTextNote = instructions[`exercise${number}Answer` as 'exercise1Answer' | 'exercise2Answer']?.trim();
    const hasQuestionVisual = Boolean(exercise.p?.trim() || exercise.pPrompt?.trim());
    const hasAnswerVisual = Boolean(exercise.i?.trim() || exercise.iPrompt?.trim());

    // A whole-Ability Fix always supplies a fresh question-and-answer figure
    // for BOTH exercises. Targeted edits retain the original scope.
    const answerNeedsQuestion = Boolean((answerNote || (answerTextNote && hasAnswerVisual)) && !isTikzCode(exercise.p));
    const regenerateQuestion = fullRegeneration || Boolean(questionNote) || Boolean(questionTextNote && hasQuestionVisual) || answerNeedsQuestion;
    const regenerateAnswer = fullRegeneration || Boolean(answerNote) ||
      Boolean((regenerateQuestion || answerTextNote) && (hasQuestionVisual || hasAnswerVisual));

    if (regenerateQuestion) questionImages.push(index);
    if (regenerateAnswer) answerImages.push(index);
  });

  return { fullRegeneration, regenerateText: abilityFixHasTextChanges(instructions), questionImages, answerImages };
}

/** Preserve the new questions/answers, not obsolete diagrams from the old
 * exercises. Image generation always uses fresh semantic visual descriptions. */
export function prepareRegeneratedAbilityVisuals (ability: GeneratedAbility, original?: GeneratedAbility): GeneratedAbility {
  return {
    ...ability,
    q: ability.q.map((exercise, index) => ({
      ...exercise,
      p: '',
      i: '',
      pError: undefined,
      iError: undefined,
      pPrompt: (exercise.pPrompt?.trim() && exercise.pPrompt.trim() !== original?.q[index]?.pPrompt?.trim())
        ? exercise.pPrompt.trim()
        : `Draw the diagram required for this question without showing the answer: ${exercise.h}`,
      iPrompt: (exercise.iPrompt?.trim() && exercise.iPrompt.trim() !== original?.q[index]?.iPrompt?.trim())
        ? exercise.iPrompt.trim()
        : `Complete the question diagram to show the correct answer: ${exercise.a || exercise.h}`
    }))
  };
}
