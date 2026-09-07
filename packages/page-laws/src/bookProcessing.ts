// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';

export const CONCEPT_SPLIT_PASSES = 2;
export const EXERCISE_SPLIT_PASSES = 2;
export const GENERATED_EXERCISES_PER_CONCEPT = 4;
export const exerciseAbilityModes = ['perceptual observation', 'perceptual discrimination', 'transformation', 'reasoning', 'generation'] as const;

export interface ProcessingConcept {
  description: string;
  title: string;
}

export type ProcessingExercise = Omit<Exercise, 'bookPage' | 'conceptId' | 'id'> & {
  conceptIndex?: number;
  source: 'book' | 'generated';
};

export interface ExtractedPageContent {
  chapter: string;
  concepts: ProcessingConcept[];
  exercises: Array<Omit<ProcessingExercise, 'source'>>;
}

export interface ProcessedPageContent {
  chapter: string;
  concepts: ProcessingConcept[];
  exercises: ProcessingExercise[];
}

export type BookProcessingAi = (prompt: string) => Promise<string>;

const CONCEPT_SPLIT_PROMPT = 'Split only the supplied concepts into the smallest useful, independently learnable concepts. Do not create, modify, split, or return exercises. Preserve the input language and all useful information. Avoid duplicate concepts. For every output item, copy inputIndex from the concept it refines. Return only JSON: {"concepts":[{"inputIndex":0,"title":"...","description":"..."}]}. Every inputIndex must have at least one output.';

const GENERATE_EXERCISES_PROMPT = `For every supplied refined concept, generate exactly ${GENERATED_EXERCISES_PER_CONCEPT} complete exercises in the input language. Each exercise must train that concept and use a different abilityMode where possible. abilityMode must be one of: ${exerciseAbilityModes.join(', ')}. Include a correct explicit step-by-step solution. Use <kx>...</kx> for every mathematical expression. Copy conceptIndex exactly. Return only JSON: {"exercises":[{"conceptIndex":0,"title":"...","description":"complete task","abilityMode":"reasoning","solution":"step-by-step solution"}]}.`;

const EXERCISE_SPLIT_PROMPT = 'Split only the supplied exercises into the smallest useful, independently answerable exercises. Do not create, modify, split, or return concepts. Keep an exercise unchanged when it is already atomic. Preserve the complete task, language, abilityMode, and a correct step-by-step solution. Avoid duplicates. For every output item, copy inputIndex from the exercise it refines. Return only JSON: {"exercises":[{"inputIndex":0,"title":"...","description":"complete atomic task","abilityMode":"reasoning","solution":"step-by-step solution"}]}. Every inputIndex must have at least one output.';

function parseJsonObject (content: string): Record<string, unknown> {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();

  try {
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as Record<string, unknown>;
  }
}

function normalizedKey ({ description, title }: ProcessingConcept): string {
  return `${title}\n${description}`.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

function deduplicate<T extends ProcessingConcept> (items: T[]): T[] {
  const seen = new Set<string>();

  return items.filter((item) => {
    const key = normalizedKey(item);

    if (!key || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

function splitConceptsResult (content: string, inputs: ProcessingConcept[]): ProcessingConcept[] {
  const values = parseJsonObject(content).concepts;

  if (!Array.isArray(values) || !values.length) {
    return inputs;
  }

  const parsed = values.flatMap((value): Array<ProcessingConcept & { inputIndex: number }> => {
    const item = value as Partial<ProcessingConcept> & { inputIndex?: unknown };

    return Number.isInteger(item.inputIndex) && Number(item.inputIndex) >= 0 && Number(item.inputIndex) < inputs.length && typeof item.title === 'string' && item.title.trim() && typeof item.description === 'string'
      ? [{ description: item.description.trim(), inputIndex: Number(item.inputIndex), title: item.title.trim() }]
      : [];
  });
  const complete = inputs.flatMap((input, inputIndex) => {
    const replacements = parsed.filter((item) => item.inputIndex === inputIndex).map(({ description, title }) => ({ description, title }));

    return replacements.length ? replacements : [input];
  });

  return deduplicate(complete);
}

function generatedExercisesResult (content: string, concepts: ProcessingConcept[]): ProcessingExercise[] {
  const values = parseJsonObject(content).exercises;

  if (!Array.isArray(values)) {
    return [];
  }

  return deduplicate(values.flatMap((value): ProcessingExercise[] => {
    const item = value as Partial<ProcessingExercise> & { conceptIndex?: unknown };
    const conceptIndex = Number(item.conceptIndex);

    return Number.isInteger(conceptIndex) && conceptIndex >= 0 && conceptIndex < concepts.length && typeof item.title === 'string' && item.title.trim() && typeof item.description === 'string' && item.description.trim() && typeof item.solution === 'string' && item.solution.trim() && typeof item.abilityMode === 'string' && exerciseAbilityModes.includes(item.abilityMode as typeof exerciseAbilityModes[number])
      ? [{ abilityMode: item.abilityMode, conceptIndex, description: item.description.trim(), solution: item.solution.trim(), source: 'generated', title: item.title.trim() }]
      : [];
  }));
}

function splitExercisesResult (content: string, inputs: ProcessingExercise[]): ProcessingExercise[] {
  const values = parseJsonObject(content).exercises;

  if (!Array.isArray(values) || !values.length) {
    return inputs;
  }

  const parsed = values.flatMap((value): Array<Omit<ProcessingExercise, 'conceptIndex' | 'source'> & { inputIndex: number }> => {
    const item = value as Partial<ProcessingExercise> & { inputIndex?: unknown };

    return Number.isInteger(item.inputIndex) && Number(item.inputIndex) >= 0 && Number(item.inputIndex) < inputs.length && typeof item.title === 'string' && item.title.trim() && typeof item.description === 'string' && item.description.trim() && typeof item.solution === 'string' && item.solution.trim() && typeof item.abilityMode === 'string' && exerciseAbilityModes.includes(item.abilityMode as typeof exerciseAbilityModes[number])
      ? [{ abilityMode: item.abilityMode, description: item.description.trim(), inputIndex: Number(item.inputIndex), solution: item.solution.trim(), title: item.title.trim() }]
      : [];
  });
  const complete = inputs.flatMap((input, inputIndex) => {
    const replacements = parsed.filter((item) => item.inputIndex === inputIndex).map(({ abilityMode, description, solution, title }) => ({ ...input, abilityMode, description, solution, title }));

    return replacements.length ? replacements : [input];
  });

  return deduplicate(complete);
}

export async function processExtractedPageContent (extracted: ExtractedPageContent, runAi: BookProcessingAi): Promise<ProcessedPageContent> {
  let concepts = deduplicate(extracted.concepts);

  for (let pass = 0; pass < CONCEPT_SPLIT_PASSES; pass++) {
    if (concepts.length) {
      const input = concepts.map((concept, inputIndex) => ({ ...concept, inputIndex }));

      concepts = splitConceptsResult(await runAi(`${CONCEPT_SPLIT_PROMPT}\nPass ${pass + 1} of ${CONCEPT_SPLIT_PASSES}.\n${JSON.stringify({ concepts: input })}`), concepts);
    }
  }

  const generatedExercises: ProcessingExercise[] = [];

  for (const [conceptIndex, concept] of concepts.entries()) {
    generatedExercises.push(...generatedExercisesResult(await runAi(`${GENERATE_EXERCISES_PROMPT}\n${JSON.stringify({ concepts: [{ ...concept, conceptIndex }] })}`), concepts));
  }

  let exercises: ProcessingExercise[] = deduplicate([
    ...extracted.exercises.map((exercise) => ({ ...exercise, source: 'book' as const })),
    ...generatedExercises
  ]);

  for (let pass = 0; pass < EXERCISE_SPLIT_PASSES; pass++) {
    if (exercises.length) {
      const input = exercises.map((exercise, inputIndex) => ({ ...exercise, inputIndex }));

      exercises = splitExercisesResult(await runAi(`${EXERCISE_SPLIT_PROMPT}\nPass ${pass + 1} of ${EXERCISE_SPLIT_PASSES}.\n${JSON.stringify({ exercises: input })}`), exercises);
    }
  }

  return { chapter: extracted.chapter, concepts, exercises };
}
