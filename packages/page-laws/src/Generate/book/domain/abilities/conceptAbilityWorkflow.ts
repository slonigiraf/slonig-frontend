// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../../abilities/abilities.js';

import { parseGeneratedAbilities } from '../../../../abilities/abilities.js';
import type { AbilityWorkflowJsonRunner } from './abilityWorkflow.js';
import { ABILITY_GENERATION_INSTRUCTIONS_PROMPT, CONCEPT_ABILITY_EXERCISE_QUALITY_PROMPT } from '../../infrastructure/ai/prompts/abilities.js';

/** The actual direct Concept -> Ability request, reused by the UI request preview. */
export function conceptAbilityGenerationPrompt (
  language: string,
  chapterTitle: string,
  concept: Pick<BookConcept, 'title' | 'description'>,
  learnerAge?: number
): string {
  return `${ABILITY_GENERATION_INSTRUCTIONS_PROMPT}

${CONCEPT_ABILITY_EXERCISE_QUALITY_PROMPT}

Generate exactly ONE Ability directly from this Concept, not from an Exercise. The Concept description defines the learning objective; choose a narrowly scoped operation the learner can actually perform, without inventing unrelated material. The two q items must be independently answerable concrete practice tasks using the SAME method and different safe inputs. Each q[].h must clearly name or refer to the Concept and require the learner to identify how it applies, understand its meaning, and use it in the task; a problem that merely happens to involve the Concept is insufficient. Set the Ability h to the Concept title exactly, without changing language, wording or capitalization.

Output language (ISO 639-1): ${language}
Chapter: ${chapterTitle}
${learnerAge === undefined ? '' : `Learner age: ${learnerAge}`}
Concept title: ${concept.title}
Concept description: ${concept.description}

Return only JSON: {"abilities":[{"h":"Concept title","i":"","t":3,"q":[{"h":"Concrete task one","a":"Correct answer one","p":"","i":""},{"h":"Concrete task two","a":"Correct answer two","p":"","i":""}]}]}
For the direct Concept workflow, apply the explicit visual input/output rules above: q[].p and q[].i are empty unless a required visual exists, in which case they contain full standalone generation specifications (never image bytes/URLs). Check each of the two tasks separately. Never disclose a question-visual answer in its task text.`;
}

/** Generate a complete practice Ability directly from a persisted Concept. */
export async function generateConceptAbility (
  language: string,
  chapterTitle: string,
  concept: BookConcept,
  runJson: AbilityWorkflowJsonRunner,
  learnerAge?: number
): Promise<GeneratedAbility> {
  if (concept.id === undefined) throw new Error('A saved Concept id is required to generate an Ability.');

  const prompt = conceptAbilityGenerationPrompt(language, chapterTitle, concept, learnerAge);

  const abilities = await runJson(prompt, (json) => parseGeneratedAbilities(json, 1, { fixedTitle: concept.title }), {
    maxOutputTokens: 3_200,
    repairContext: `Return exactly one Ability with h equal to ${JSON.stringify(concept.title)} and two concrete, correctly solved practice tasks.`,
    validationCycles: 2
  });

  return abilities[0];
}
