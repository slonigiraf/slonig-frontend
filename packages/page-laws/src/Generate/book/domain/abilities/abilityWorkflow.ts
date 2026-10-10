// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept, Exercise } from '@slonigiraf/db';
import type { AbilityExerciseImagePrompts, GeneratedAbility } from '../../../../abilities/abilities.js';

import { parseGeneratedAbilities } from '../../../../abilities/abilities.js';
import { stripMarkdownImageReferences } from '../content/markdownImages.js';
import { ABILITY_EXPLICIT_CONCEPT_PRACTICE_PROMPT, ABILITY_MEANINGFUL_VARIATION_PROMPT, ABILITY_SPATIAL_AND_REPRESENTATION_FIDELITY_PROMPT } from '../../infrastructure/ai/prompts/abilities.js';

export interface AtomicAbilityConversion {
  ability: GeneratedAbility;
  exerciseId: number;
  skillIndex: number;
  imagePrompts?: [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];
}

export type ExerciseAbilityConversion = AtomicAbilityConversion;

export interface AbilityWorkflowRunOptions {
  maxOutputTokens?: number;
  repairContext?: string;
  validationCycles?: number;
}

export type AbilityWorkflowJsonRunner = <T>(prompt: string, parse: (content: string) => T, options?: AbilityWorkflowRunOptions) => Promise<T>;

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseJson (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

function normalized (value: string): string {
  return value.toLocaleLowerCase().replace(/<kx>|<\/kx>/g, '').replace(/\s+/g, ' ').trim();
}

export function transportCompactAbilitySourceExercise ({ description, id, imageDescription = '', solution = '', solutionImageDescription = '', title }: Exercise): unknown {
  return {
    id,
    title,
    task: stripMarkdownImageReferences(description),
    solution,
    questionVisual: imageDescription,
    solutionVisual: solutionImageDescription
  };
}

function parseImagePromptPair (value: unknown): [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts] {
  if (!Array.isArray(value) || value.length !== 2) {
    throw new Error('Every visual plan must contain exactly two image prompt decisions.');
  }

  const prompts = value.map((item) => {
    if (!isRecord(item) || typeof item.changesImage !== 'boolean' || typeof item.p !== 'string' || typeof item.i !== 'string') {
      throw new Error('Every visual decision must contain changesImage, p, and i.');
    }

    return { changesImage: item.changesImage, i: item.i.trim(), p: item.p.trim() };
  }) as [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];

  return prompts;
}

export function parseGeneratedAtomicAbility (content: string, exercise: Exercise, sourceConcept?: Pick<BookConcept, 'title' | 'description'>): AtomicAbilityConversion[] {
  if (exercise.id === undefined) {
    throw new Error('Every source Exercise must have one unique id before Ability generation.');
  }

  const parsed = parseJson(content);
  const values = isRecord(parsed) ? parsed.abilities : undefined;

  if (!Array.isArray(values) || values.length !== 1) {
    throw new Error('OpenRouter must return exactly one generated Ability for the source Exercise.');
  }

  const value = values[0];

  if (!isRecord(value) || value.exerciseId !== exercise.id || value.skillIndex !== 0) {
    throw new Error('The generated Ability must identify its source Exercise and use skillIndex 0.');
  }

  // An Ability title is relationship data: the model returns only content,
  // and the parser inserts the exact linked Concept title before validation.
  const [ability] = parseGeneratedAbilities(JSON.stringify([value.ability]), 1, { fixedTitle: sourceConcept?.title ?? exercise.title });
  const imagePrompts = parseImagePromptPair(value.imagePrompts);
  const hasQuestionVisual = Boolean(exercise.imageDescription?.trim());
  const hasSolutionVisual = Boolean(exercise.solutionImageDescription?.trim());
  const hasAnyReturnedVisual = imagePrompts.some(({ changesImage, i, p }) => changesImage || i || p);

  if (!hasQuestionVisual && !hasSolutionVisual && hasAnyReturnedVisual) {
    throw new Error('A text-only Ability must not create visual prompts.');
  }

  const normalizedPrompts = imagePrompts.map((prompt): AbilityExerciseImagePrompts => {
    if (hasQuestionVisual && !prompt.p) {
      throw new Error('A source Exercise with a required question visual must keep a question visual for every Ability exercise.');
    }

    if (hasSolutionVisual && !prompt.i) {
      throw new Error('A source Exercise with a required solution visual must keep a solution visual for every Ability exercise.');
    }

    if (hasSolutionVisual && prompt.changesImage && (!hasQuestionVisual || !prompt.p || !prompt.i)) {
      throw new Error('A modified solution visual requires both the source question visual and solution visual.');
    }

    return {
      changesImage: hasSolutionVisual ? prompt.changesImage : false,
      i: hasSolutionVisual ? prompt.i : '',
      p: hasQuestionVisual ? prompt.p : ''
    };
  }) as [AbilityExerciseImagePrompts, AbilityExerciseImagePrompts];

  if (hasSolutionVisual) {
    const changeModes = new Set(normalizedPrompts.map(({ changesImage }) => changesImage));

    if (changeModes.size !== 1) {
      throw new Error('Both Ability exercises must use the same solution visual mode.');
    }
  }

  if (hasQuestionVisual) {
    const [firstQuestion, secondQuestion] = ability.q;
    const sameQuestionText = normalized(firstQuestion.h) === normalized(secondQuestion.h);

    if (sameQuestionText && normalized(normalizedPrompts[0].p) === normalized(normalizedPrompts[1].p)) {
      throw new Error('The two Ability exercises must use different concrete input parameters in their text or question visuals.');
    }
  }

  return [{
    ability,
    exerciseId: exercise.id,
    ...(hasQuestionVisual || hasSolutionVisual ? { imagePrompts: normalizedPrompts } : {}),
    skillIndex: 0
  }];
}

export async function generateAtomicAbilityExercise (
  language: string,
  chapterTitle: string,
  exercise: Exercise,
  runJson: AbilityWorkflowJsonRunner,
  sourceConcept?: Pick<BookConcept, 'title' | 'description'>
): Promise<AtomicAbilityConversion[]> {
  if (exercise.id === undefined) {
    throw new Error('Every source Exercise must have one unique id before Ability generation.');
  }

  const exerciseId = exercise.id;
  const source = {
    ...transportCompactAbilitySourceExercise(exercise),
    ...(sourceConcept ? { sourceConcept: { title: sourceConcept.title, description: sourceConcept.description } } : {})
  };

  return runJson(
    abilityGenerationRequestPrompt(language, chapterTitle, source),
    (content) => parseGeneratedAtomicAbility(content, exercise, sourceConcept),
    {
      maxOutputTokens: 3_200,
      repairContext: `Return exactly one abilities[] entry for exerciseId=${exerciseId} with skillIndex=0, one final ability, and exactly two imagePrompts. Do not return ability.h or any title; the application copies it from the linked Concept. Do not return a blueprint or internal plan. Source question visual present=${Boolean(exercise.imageDescription?.trim())}; source solution visual present=${Boolean(exercise.solutionImageDescription?.trim())}.`,
      validationCycles: 1
    }
  );
}

export const generateExerciseAbility = generateAtomicAbilityExercise;

export function abilityGenerationRequestPrompt (language: string, chapterTitle: string, source: unknown): string {
  return `Generate exactly one final learner Ability from this one source Exercise in a single pass. Before writing the answer, silently determine the complete reusable Exercise-level skill: its input, inseparable operation or operation sequence, expected output, stable method/rule, direction, reasoning depth, difficulty, and visual requirements. Use that internal plan to keep both practice instances aligned, but DO NOT output the plan or a blueprint. Do not split a coherent multi-step Exercise into smaller skills.

Chapter: ${chapterTitle}
Language: ${language}

SOURCE ALIGNMENT: The source contains its Exercise task, solution, questionVisual, solutionVisual, and (when linked) sourceConcept title and description. For EACH of the two generated tasks separately, verify that the question and answer exercise the exact same concept and complete Exercise-level skill as the source, including every inseparable operation, direction, representation, output format, solution method, reasoning depth, age-appropriate difficulty, and required visuals. Both tasks must follow the same reusable task template and instructional meaning; their safe concrete inputs, contexts, spatial arrangements, and corresponding answers/visuals may vary. Never introduce an operation or topic not taught by the source Concept. If the Exercise and Concept appear inconsistent, keep the Exercise's actual required operation while remaining within the Concept's scope; do not generate unrelated tasks. Do NOT generate, copy, or return an Ability title. The application assigns Ability.h from sourceConcept.title directly, or uses the Exercise title when a legacy caller has no sourceConcept. Treat sourceConcept.title and description only as context for generating questions and answers.

${ABILITY_EXPLICIT_CONCEPT_PRACTICE_PROMPT}

${ABILITY_MEANINGFUL_VARIATION_PROMPT}

FINAL ABILITY
Create exactly one Ability with exactly two concrete practice instances. The Ability must represent the complete source Exercise rather than one convenient sub-step. Both questions must preserve the same complete input type, operation or operation sequence, output type, method, direction, reasoning depth, and difficulty. Vary meaningful, instructionally safe concrete task data, arrangements, or contexts and independently recalculate each answer. Keep tasks <=32 words and answers <=38 words. Do not emit an Ability-level h/name/title field; the application supplies it. Do not use hints, tutorial prose, answer choices, book references, or placeholder task text such as "Task 1" or "Task 2". Use <kx>...</kx> for mathematical notation. ability.i="", ability.t=3, and q[].p/q[].i must remain empty because images are materialized later.

IMAGE PROMPTS
${ABILITY_SPATIAL_AND_REPRESENTATION_FIDELITY_PROMPT}

Return exactly two imagePrompts, one per final question. The SOURCE EXERCISE fields questionVisual and solutionVisual are authoritative evidence boundaries. If source.questionVisual is empty, p must be ""; if it is nonempty, p must be a complete standalone specification of the task-essential starting visual for that concrete question without leaking the answer. If source.solutionVisual is empty, i must be "" and changesImage=false. If source.solutionVisual is nonempty, i must specify the complete correct solution visual. Set changesImage=true only when that solution is the correctly modified version of the same supplied question visual; in that case p and i must describe the same visual before and after the requested change and preserve every unchanged object/layout. Otherwise changesImage=false. Never invent decorative or optional visuals and never drop a required source visual.

Return only this JSON shape with exactly one abilities[] entry and NO blueprint field, NO Ability title field (the q[].h fields below are task questions, not titles):
{"abilities":[{"exerciseId":123,"skillIndex":0,"ability":{"i":"","t":3,"q":[{"h":"Convert <kx>3</kx> km to m.","a":"<kx>3000</kx> m","p":"","i":""},{"h":"Convert <kx>7</kx> km to m.","a":"<kx>7000</kx> m","p":"","i":""}]},"imagePrompts":[{"changesImage":false,"p":"","i":""},{"changesImage":false,"p":"","i":""}]}]}

SOURCE EXERCISE:
${JSON.stringify(source)}`;
}
