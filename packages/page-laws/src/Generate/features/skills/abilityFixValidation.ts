// Copyright 2026 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AbilityFixInstructions } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../abilities/abilities.js';

/** A plain "Regenerate" request means new exercises, not another copy of the same ones. */
export function isWholeAbilityRegenerationRequest (request: string): boolean {
  return /^(?:please\s+)?(?:regenerate|re-generate|redo|rewrite)(?:\s+(?:(?:the|this|whole|entire)\s+)?ability)?[.!]?$/i.test(request.trim());
}

function comparableText (text: string): string {
  return text.trim().replace(/\s+/g, ' ');
}

function changed (before: string, after: string): boolean {
  return comparableText(before) !== comparableText(after);
}

/** AI fixes must not create two copies of one exercise in the same Ability. */
function comparableQuestion (text: string): string {
  return comparableText(text).toLocaleLowerCase().replace(/[.!?]+$/g, '');
}

/**
 * Validate the AI's *visible* change before writing a content-addressed Ability.
 * A well-formed but unchanged response used to be treated as a successful fix,
 * removing the job from the queue even though the reader showed no difference.
 * Throwing here lets requestValidatedJson ask the model to repair its answer.
 */
export function assertAbilityFixResultChanged (
  original: GeneratedAbility,
  candidate: GeneratedAbility,
  instructions: AbilityFixInstructions
): GeneratedAbility {
  const note = instructions.overall?.trim();

  if (candidate.q.length !== 2 || !candidate.q.every(({ h }) => h.trim()) ||
      comparableQuestion(candidate.q[0].h) === comparableQuestion(candidate.q[1].h)) {
    throw new Error('The two exercises in this Ability must have different, non-empty questions. Rewrite the duplicated exercise with a distinct question and matching answer.');
  }

  const regenerateExercises = Boolean(instructions.regenerateExercises) || (note ? isWholeAbilityRegenerationRequest(note) : false);

  if (note || regenerateExercises) {
    const changedExercises = original.q.map((exercise, index) =>
      changed(exercise.h, candidate.q[index].h) || changed(exercise.a, candidate.q[index].a)
    );

    if (regenerateExercises && original.q.some((exercise, index) => !changed(exercise.h, candidate.q[index].h))) {
      throw new Error('Regenerate requested two new exercises, but at least one question was not rewritten. Create meaningfully different questions for both exercises, with matching correct answers.');
    }

    if (!changed(original.h, candidate.h) && !changed(original.i, candidate.i) && !changedExercises.some(Boolean)) {
      throw new Error('The proposed Ability is unchanged. Apply the requested correction to the learner-facing text instead of returning the original.');
    }
  } else {
    const requestedFields: Array<[Exclude<keyof AbilityFixInstructions, 'regenerateExercises'>, boolean]> = [
      ['title', changed(original.h, candidate.h)],
      ['exercise1Question', changed(original.q[0].h, candidate.q[0].h)],
      ['exercise1Answer', changed(original.q[0].a, candidate.q[0].a)],
      ['exercise2Question', changed(original.q[1].h, candidate.q[1].h)],
      ['exercise2Answer', changed(original.q[1].a, candidate.q[1].a)]
    ];
    const pending = requestedFields.filter(([key]) => instructions[key]?.trim());

    if (pending.some(([, didChange]) => !didChange)) {
      const unchanged = pending.filter(([, didChange]) => !didChange).map(([key]) => key).join(', ');
      throw new Error(`The requested Ability text field(s) did not change: ${unchanged}. Correct these fields rather than repeating their original content.`);
    }
  }

  return candidate;
}
