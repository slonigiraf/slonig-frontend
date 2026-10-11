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

Generate exactly ONE Ability directly from this Concept, not from an Exercise. The Concept description defines the learning objective; choose a narrowly scoped operation the learner can actually perform, without inventing unrelated material. The two q items must be independently answerable concrete practice tasks using the SAME method and different safe inputs. Set the Ability h to the Concept title exactly, without changing language, wording or capitalization.

Output language (ISO 639-1): ${language}
Chapter: ${chapterTitle}
${learnerAge === undefined ? '' : `Learner age: ${learnerAge}`}
Concept title: ${concept.title}
Concept description: ${concept.description}

Return only JSON: {"abilities":[{"h":"Concept title","i":"","t":3,"q":[{"h":"Concrete task one","a":"Correct answer one","p":"","i":"","pPrompt":"","iPrompt":""},{"h":"Concrete task two","a":"Correct answer two","p":"","i":"","pPrompt":"","iPrompt":""}]}]}
For the direct Concept workflow, q[].p and q[].i are image data fields and MUST BOTH be "" at initial creation. Specify required visuals exclusively in q[].pPrompt (question image description) and q[].iPrompt (solution image description); use "" for unused prompts. When a solution image completely answers the task, q[].a MUST be "" and q[].iPrompt must contain the COMPLETE standalone image-generation specification, with no written answer text. Example image-only q entry: {"h":"Draw the completed figure.","a":"","p":"","i":"","pPrompt":"","iPrompt":"Draw a clean completed figure with all correct labels and geometry..."}. Check each of the two tasks separately. Never disclose a question-visual answer in its task text.`;
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

  const abilities = await runJson(prompt, (json) => parseGeneratedAbilities(json, 1, { fixedTitle: concept.title, visualPromptsOnly: true }), {
    maxOutputTokens: 3_200,
    repairContext: `Return exactly this JSON shape: {"abilities":[{"h":${JSON.stringify(concept.title)},"i":"","t":3,"q":[{"h":"complete nonempty learner question","a":"correct written answer OR empty string for an image-only solution","p":"","i":"","pPrompt":"question image prompt or empty string","iPrompt":"solution image prompt or empty string"},{"h":"second distinct nonempty learner question","a":"correct written answer OR empty string for an image-only solution","p":"","i":"","pPrompt":"question image prompt or empty string","iPrompt":"solution image prompt or empty string"}]}]}. Every exercise must have nonempty h, image-data fields p:"" and i:"", and both prompt fields pPrompt and iPrompt as strings ("" if unused). EITHER a must contain a nonempty textual answer OR iPrompt must contain a complete standalone solution-image prompt. For an image-only answer keep a:"" and put the entire image prompt ONLY in iPrompt. Do not put prompts in p or i. Never omit the question or either exercise.`, 
    validationCycles: 2
  });

  return abilities[0];
}
