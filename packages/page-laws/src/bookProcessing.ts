// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';

export const GENERATED_EXERCISES_PER_CONCEPT = 4;
export const MAX_EXERCISE_GENERATION_RETRIES = 3;
export const exerciseAbilityModes = ['perceptual observation', 'perceptual discrimination', 'transformation', 'reasoning', 'generation'] as const;

export interface ProcessingConcept {
  description: string;
  title: string;
}

export type ProcessingExercise = Omit<Exercise, 'bookPage' | 'conceptId' | 'id'> & {
  conceptIndex?: number;
  source: 'book' | 'generated';
};

export interface ExtractedChapterPageContent {
  concepts: ProcessingConcept[];
  exercises: Array<Omit<ProcessingExercise, 'source'>>;
  pageNumber: number;
}

export interface ExtractedChapterContent {
  chapter: string;
  pages: ExtractedChapterPageContent[];
}

export interface ProcessedChapterPageContent {
  concepts: ProcessingConcept[];
  exercises: ProcessingExercise[];
  pageNumber: number;
}

export interface ProcessedChapterContent {
  chapter: string;
  pages: ProcessedChapterPageContent[];
}

type LocatedProcessingConcept = ProcessingConcept & { sourcePageNumber: number };
type LocatedProcessingExercise = ProcessingExercise & { sourcePageNumber: number };

export type BookProcessingAi = (prompt: string) => Promise<string>;

export interface PageSymbolStatistics {
  mean: number;
  standardDeviation: number;
}

export interface PageConceptProcessingState {
  conceptsProcessed?: boolean;
  pageNumber: number;
}

export function areAllBookPagesConceptsProcessed (totalPages: number, pages: PageConceptProcessingState[]): boolean {
  if (!Number.isSafeInteger(totalPages) || totalPages <= 0) {
    return false;
  }

  const processedPageNumbers = new Set(pages.flatMap(({ conceptsProcessed, pageNumber }) => conceptsProcessed && Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages ? [pageNumber] : []));

  return processedPageNumbers.size === totalPages;
}

export function countUnprocessedBookPages (totalPages: number, pages: PageConceptProcessingState[]): number {
  if (!Number.isSafeInteger(totalPages) || totalPages <= 0) {
    return 0;
  }

  const processedPageNumbers = new Set(pages.flatMap(({ conceptsProcessed, pageNumber }) => conceptsProcessed && Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages ? [pageNumber] : []));

  return totalPages - processedPageNumbers.size;
}

export function calculatePageSymbolStatistics (pageTexts: string[]): PageSymbolStatistics | undefined {
  const symbolCounts = pageTexts.map((text) => text.length);

  if (!symbolCounts.length) {
    return undefined;
  }

  const mean = symbolCounts.reduce((sum, count) => sum + count, 0) / symbolCounts.length;
  const variance = symbolCounts.reduce((sum, count) => sum + Math.pow(count - mean, 2), 0) / symbolCounts.length;

  return { mean, standardDeviation: Math.sqrt(variance) };
}

export function isWithinTwoStandardDeviations (symbolCount: number, statistics?: PageSymbolStatistics): boolean {
  if (!statistics || !Number.isFinite(symbolCount)) {
    return false;
  }

  return Math.abs(symbolCount - statistics.mean) <= 2 * statistics.standardDeviation;
}

const CONCEPT_SPLIT_PROMPT = 'Split only the supplied concepts into the smallest useful, independently learnable concepts. Do not create, modify, split, or return exercises. Preserve the input language and all useful information. Avoid duplicate concepts. For every output item, copy inputIndex from the concept it refines. Return only JSON: {"concepts":[{"inputIndex":0,"title":"...","description":"..."}]}. Every inputIndex must have at least one output.';

const GENERATE_EXERCISES_PROMPT = `For every supplied refined concept, generate exactly ${GENERATED_EXERCISES_PER_CONCEPT} complete exercises in the input language. Each exercise must train that concept and use a different abilityMode where possible. abilityMode must be one of: ${exerciseAbilityModes.join(', ')}. Include a correct explicit step-by-step solution. Every Exercise must include both imageDescription and solutionImageDescription, normally as empty strings. Prefer a fully self-contained text-only exercise whenever the same learning objective, reasoning, transformation, or perceptual distinction can be trained without a visual. Never request a merely illustrative image for decoration, atmosphere, engagement, or to repeat information already present in the text. Use a nonempty imageDescription only when the learner must inspect spatial, geometric, diagrammatic, graphical, visual-comparison, or other visual information that cannot be stated in text without changing or giving away the task. In that exceptional case, imageDescription must be a complete standalone generation prompt describing exactly the educational visual the learner must inspect, without the answer and without referring to a source page or unseen figure. Independently audit the EXPECTED ANSWER FORMAT for every exercise. solutionImageDescription is REQUIRED whenever the learner's correct answer or the worked solution includes, produces, completes, or modifies a drawing or other visual artifact. This includes any task that asks the learner to draw, sketch, plot, graph, construct, trace, complete, mark, label, annotate, shade, color, connect, move, rotate, reflect, translate, rearrange, correct, or otherwise alter a figure, coordinate plane, number line, diagram, chart, table, map, geometric construction, model, or visual representation. It is also required when the step-by-step solution tells the learner to perform one of those visual actions, even if the final numeric/text answer could also be stated in words. Do NOT use a textual answer as a reason to omit a required solution visual. For these visual-output exercises, solutionImageDescription MUST be nonempty and must be a complete standalone generation prompt for the CORRECT finished solution visual, including all answer-bearing labels, coordinates, marks, lines, regions, transformations, and spatial relationships. When the learner modifies the question visual, solutionImageDescription must describe the completed correct version of that same visual, preserving unchanged objects, labels, scale, coordinate system, and layout. Leave solutionImageDescription empty only when the learner is expected to answer entirely in text/formulas and no drawing/plot/construction/marking is part of the requested answer or worked method. Before returning JSON, inspect every exercise one final time: if description or solution contains a visual-output action, solutionImageDescription must not be empty. Use <kx>...</kx> for every mathematical expression. Copy conceptIndex exactly. Return only JSON: {"exercises":[{"conceptIndex":0,"title":"...","description":"complete task","abilityMode":"reasoning","solution":"step-by-step solution","imageDescription":"","solutionImageDescription":""}]}.`;

const EXERCISE_SPLIT_PROMPT = 'Split only the supplied exercises into the smallest useful, independently answerable exercises. Do not create, modify, split, or return concepts. Keep an exercise unchanged when it is already atomic. Preserve the complete task, language, abilityMode, and a correct step-by-step solution. imageDescription describes only task-essential visual input; solutionImageDescription describes a required worked-solution visual output. Keep or create a nonempty imageDescription only when visual information is crucial to performing the task and writing that information into the question would change the skill or reveal what the learner must infer. NEVER erase an existing nonempty solutionImageDescription. You may improve or adapt it when splitting the exercise, but every split child that still has a visual-output answer must retain a complete nonempty solutionImageDescription. Independently audit the expected answer format. A nonempty solutionImageDescription is mandatory whenever the learner must draw, sketch, plot, graph, construct, trace, complete, mark, label, annotate, shade, color, connect, move, rotate, reflect, translate, rearrange, correct, or otherwise create/modify a figure, coordinate plane, number line, diagram, chart, table, map, geometric construction, model, or visual representation; it is also mandatory when the worked solution itself performs one of those visual actions. A text or numeric statement of the same answer does not make the visual optional when the exercise asks for visual production. If the learner modifies the question visual, solutionImageDescription must describe the complete correct updated version of the same visual, preserving unchanged objects, labels, scale, coordinate system, and layout. Leave solutionImageDescription empty only for exercises whose requested answer and worked method are entirely text/formulas with no required visual production. Never add decorative or merely illustrative visuals. Before returning, verify that no visual-output exercise has an empty solutionImageDescription. Avoid duplicates. For every output item, copy inputIndex from the exercise it refines. Return only JSON: {"exercises":[{"inputIndex":0,"title":"...","description":"complete atomic task","abilityMode":"reasoning","solution":"step-by-step solution","imageDescription":"","solutionImageDescription":""}]}. Every inputIndex must have at least one output.';

const EXERCISE_SOLUTION_VISUAL_AUDIT_PROMPT = 'Perform a dedicated solution-visual audit for EVERY supplied Exercise. Do not split, rewrite, delete, or otherwise change the Exercise. Decide only whether its expected answer or worked method requires a produced or modified visual. requiresSolutionImage MUST be true whenever the learner is asked to draw, sketch, plot, graph, construct, trace, complete, mark, label, annotate, shade, color, connect, move, rotate, reflect, translate, rearrange, correct, or otherwise create or alter a figure, coordinate plane, number line, diagram, chart, table, map, geometric construction, model, or visual representation. It MUST also be true when the solution steps perform one of those visual actions, even if the answer also contains text, numbers, or formulas. A textual statement of the same result does not replace the required solution visual. When requiresSolutionImage is true, solutionImageDescription MUST be a nonempty, complete, standalone image-generation description of the CORRECT finished visual, including answer-bearing geometry, coordinates, labels, marks, lines, regions, transformations, and spatial relationships. If the Exercise modifies a question visual, describe the completed correct version of that same visual and preserve all unchanged objects, labels, scale, coordinate system, and layout. When an Exercise already has a nonempty solutionImageDescription, NEVER return an empty replacement; preserve it unless you can make it more accurate or complete. requiresSolutionImage is false only when both the requested answer and the worked method are entirely text/formulas and contain no required visual production. Return one review for every input Exercise, preserving inputIndex exactly. Return only JSON: {"reviews":[{"inputIndex":0,"requiresSolutionImage":true,"solutionImageDescription":"complete correct solution visual"}]}. Do not return image bytes, URLs, filenames, markdown, or commentary.';




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
    const replacements = parsed.filter((item) => item.inputIndex === inputIndex).map(({ description, title }) => ({ ...input, description, title }));

    return replacements.length ? replacements : [input];
  });

  return deduplicate(complete);
}

function generatedExercisesResult (content: string, concepts: LocatedProcessingConcept[]): LocatedProcessingExercise[] {
  const values = parseJsonObject(content).exercises;

  if (!Array.isArray(values)) {
    return [];
  }

  return deduplicate(values.flatMap((value): LocatedProcessingExercise[] => {
    const item = value as Partial<ProcessingExercise> & { conceptIndex?: unknown };
    const conceptIndex = Number(item.conceptIndex);

    return Number.isInteger(conceptIndex) && conceptIndex >= 0 && conceptIndex < concepts.length && typeof item.title === 'string' && item.title.trim() && typeof item.description === 'string' && item.description.trim() && typeof item.solution === 'string' && item.solution.trim() && typeof item.abilityMode === 'string' && exerciseAbilityModes.includes(item.abilityMode as typeof exerciseAbilityModes[number])
      ? [{ abilityMode: item.abilityMode, conceptIndex, description: item.description.trim(), imageDescription: typeof item.imageDescription === 'string' ? item.imageDescription.trim() : '', solution: item.solution.trim(), solutionImageDescription: typeof item.solutionImageDescription === 'string' ? item.solutionImageDescription.trim() : '', source: 'generated', sourcePageNumber: concepts[conceptIndex].sourcePageNumber, title: item.title.trim() }]
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
      ? [{ abilityMode: item.abilityMode, description: item.description.trim(), imageDescription: typeof item.imageDescription === 'string' ? item.imageDescription.trim() : '', inputIndex: Number(item.inputIndex), solution: item.solution.trim(), solutionImageDescription: typeof item.solutionImageDescription === 'string' && item.solutionImageDescription.trim() ? item.solutionImageDescription.trim() : inputs[Number(item.inputIndex)].solutionImageDescription?.trim() ?? '', title: item.title.trim() }]
      : [];
  });
  const complete = inputs.flatMap((input, inputIndex) => {
    const replacements = parsed.filter((item) => item.inputIndex === inputIndex).map(({ abilityMode, description, imageDescription, solution, solutionImageDescription, title }) => ({ ...input, abilityMode, description, imageDescription, solution, solutionImageDescription, title }));

    return replacements.length ? replacements : [input];
  });

  return deduplicate(complete);
}


function auditSolutionVisualsResult (content: string, inputs: ProcessingExercise[]): ProcessingExercise[] {
  const values = parseJsonObject(content).reviews;

  if (!Array.isArray(values) || !values.length) {
    return inputs;
  }

  const updates = new Map<number, string>();

  values.forEach((value): void => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return;
    }

    const item = value as { inputIndex?: unknown; requiresSolutionImage?: unknown; solutionImageDescription?: unknown };
    const inputIndex = Number(item.inputIndex);
    const solutionImageDescription = typeof item.solutionImageDescription === 'string' ? item.solutionImageDescription.trim() : '';

    if (Number.isInteger(inputIndex) && inputIndex >= 0 && inputIndex < inputs.length && item.requiresSolutionImage === true && solutionImageDescription) {
      updates.set(inputIndex, solutionImageDescription);
    }
  });

  return inputs.map((exercise, inputIndex) => ({
    ...exercise,
    solutionImageDescription: updates.get(inputIndex) || exercise.solutionImageDescription?.trim() || ''
  }));
}

export async function processExtractedChapterContent (extracted: ExtractedChapterContent, runAi: BookProcessingAi): Promise<ProcessedChapterContent> {
  const { chapter, pages } = extracted;

  if (!pages.length) {
    return { chapter, pages: [] };
  }

  const pageNumbers = new Set<number>();

  for (const { pageNumber } of pages) {
    if (pageNumbers.has(pageNumber)) {
      throw new Error(`Chapter processing batch contains duplicate page number ${pageNumber}.`);
    }

    pageNumbers.add(pageNumber);
  }

  const concepts: LocatedProcessingConcept[] = deduplicate(pages.flatMap(({ concepts, pageNumber }) =>
    concepts.map((concept) => ({ ...concept, sourcePageNumber: pageNumber }))
  ));

  let generatedExercises: LocatedProcessingExercise[] = concepts.length
    ? generatedExercisesResult(await runAi(`${GENERATE_EXERCISES_PROMPT}\n${JSON.stringify({ concepts: concepts.map(({ sourcePageNumber: _sourcePageNumber, ...concept }, conceptIndex) => ({ ...concept, conceptIndex })) })}`), concepts)
    : [];

  for (let retry = 0; retry < MAX_EXERCISE_GENERATION_RETRIES; retry++) {
    const coveredConcepts = new Set(generatedExercises.flatMap(({ conceptIndex }) => conceptIndex === undefined ? [] : [conceptIndex]));
    const missingConcepts = concepts.flatMap(({ sourcePageNumber: _sourcePageNumber, ...concept }, conceptIndex) => coveredConcepts.has(conceptIndex) ? [] : [{ ...concept, conceptIndex }]);

    if (!missingConcepts.length) {
      break;
    }

    const recovered = generatedExercisesResult(await runAi(`${GENERATE_EXERCISES_PROMPT}\nThis is recovery attempt ${retry + 1} of ${MAX_EXERCISE_GENERATION_RETRIES}. Generate exercises only for every supplied concept that still has no exercise.\n${JSON.stringify({ concepts: missingConcepts })}`), concepts);

    generatedExercises = deduplicate([...generatedExercises, ...recovered]);
  }

  let exercises: LocatedProcessingExercise[] = deduplicate([
    ...pages.flatMap(({ exercises, pageNumber }) => exercises.map((exercise) => ({ ...exercise, source: 'book' as const, sourcePageNumber: pageNumber }))),
    ...generatedExercises
  ]);

  if (exercises.length) {
    const input = exercises.map(({ sourcePageNumber: _sourcePageNumber, ...exercise }, inputIndex) => ({ ...exercise, inputIndex }));

    exercises = auditSolutionVisualsResult(await runAi(`${EXERCISE_SOLUTION_VISUAL_AUDIT_PROMPT}\n${JSON.stringify({ exercises: input })}`), exercises) as LocatedProcessingExercise[];
  }

  const localConceptIndexes = new Map<number, Map<number, number>>();

  concepts.forEach(({ sourcePageNumber }, chapterConceptIndex) => {
    const pageIndexes = localConceptIndexes.get(sourcePageNumber) ?? new Map<number, number>();

    pageIndexes.set(chapterConceptIndex, pageIndexes.size);
    localConceptIndexes.set(sourcePageNumber, pageIndexes);
  });

  return {
    chapter,
    pages: pages.map(({ pageNumber }) => ({
      concepts: concepts
        .filter(({ sourcePageNumber }) => sourcePageNumber === pageNumber)
        .map(({ sourcePageNumber: _sourcePageNumber, ...concept }) => concept),
      exercises: exercises
        .filter(({ sourcePageNumber }) => sourcePageNumber === pageNumber)
        .map(({ sourcePageNumber: _sourcePageNumber, ...exercise }) => ({
          ...exercise,
          conceptIndex: exercise.conceptIndex === undefined
            ? undefined
            : localConceptIndexes.get(pageNumber)?.get(exercise.conceptIndex)
        })),
      pageNumber
    }))
  };
}

