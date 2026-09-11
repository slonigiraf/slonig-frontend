// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';

import { exerciseAbilityModes, EXERCISE_SOLUTION_VISUAL_AUDIT_REQUEST_PROMPT, GENERATE_EXERCISES_RECOVERY_PROMPT, GENERATE_EXERCISES_REQUEST_PROMPT } from './constants.js';

export const MAX_EXERCISE_GENERATION_RETRIES = 3;

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

function generatedExercisesResult (content: string, concepts: LocatedProcessingConcept[], bookExerciseCount = 0): { exercises: LocatedProcessingExercise[]; overlappingBookExerciseIndexes: number[] } {
  const parsedObject = parseJsonObject(content);
  const values = parsedObject.exercises;
  const overlappingValues = parsedObject.overlappingBookExerciseIndexes;

  if (bookExerciseCount > 0 && !Array.isArray(overlappingValues)) {
    throw new Error('AI omitted the required book-exercise overlap review.');
  }

  if (!Array.isArray(values)) {
    return { exercises: [], overlappingBookExerciseIndexes: [] };
  }

  const validExercises = values.flatMap((value): LocatedProcessingExercise[] => {
    const item = value as Partial<ProcessingExercise> & { conceptIndex?: unknown };
    const conceptIndex = Number(item.conceptIndex);

    return Number.isInteger(conceptIndex) && conceptIndex >= 0 && conceptIndex < concepts.length && typeof item.title === 'string' && item.title.trim() && typeof item.description === 'string' && item.description.trim() && typeof item.solution === 'string' && item.solution.trim() && typeof item.abilityMode === 'string' && exerciseAbilityModes.includes(item.abilityMode as typeof exerciseAbilityModes[number])
      ? [{ abilityMode: item.abilityMode, conceptIndex, description: item.description.trim(), imageDescription: typeof item.imageDescription === 'string' ? item.imageDescription.trim() : '', solution: item.solution.trim(), solutionImageDescription: typeof item.solutionImageDescription === 'string' ? item.solutionImageDescription.trim() : '', source: 'generated', sourcePageNumber: concepts[conceptIndex].sourcePageNumber, title: item.title.trim() }]
      : [];
  });
  const exercisesByConcept = new Map<number, LocatedProcessingExercise>();

  validExercises.forEach((exercise) => {
    const conceptIndex = exercise.conceptIndex as number;
    const existing = exercisesByConcept.get(conceptIndex);

    if (!existing || (existing.abilityMode !== 'transformation' && exercise.abilityMode === 'transformation')) {
      exercisesByConcept.set(conceptIndex, exercise);
    }
  });

  const overlappingBookExerciseIndexes = Array.isArray(overlappingValues)
    ? Array.from(new Set(overlappingValues
      .map((value) => Number(value))
      .filter((index) => Number.isInteger(index) && index >= 0 && index < bookExerciseCount)))
    : [];

  return {
    exercises: Array.from(exercisesByConcept.entries()).sort(([a], [b]) => a - b).map(([, exercise]) => exercise),
    overlappingBookExerciseIndexes
  };
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

export async function processExtractedChapterContent (extracted: ExtractedChapterContent, runAi: BookProcessingAi, bookDetectedLanguage = 'English'): Promise<ProcessedChapterContent> {
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
  const bookExercises: LocatedProcessingExercise[] = pages.flatMap(({ exercises, pageNumber }) =>
    exercises.map((exercise) => ({ ...exercise, source: 'book' as const, sourcePageNumber: pageNumber }))
  );
  const generationInput = {
    bookExercises: bookExercises.map(({ sourcePageNumber: _sourcePageNumber, ...exercise }, bookExerciseIndex) => ({ ...exercise, bookExerciseIndex })),
    concepts: concepts.map(({ sourcePageNumber: _sourcePageNumber, ...concept }, conceptIndex) => ({ ...concept, conceptIndex }))
  };
  const initialGeneration = concepts.length
    ? generatedExercisesResult(await runAi(GENERATE_EXERCISES_REQUEST_PROMPT(bookDetectedLanguage, generationInput)), concepts, bookExercises.length)
    : { exercises: [], overlappingBookExerciseIndexes: [] };
  let generatedExercises = initialGeneration.exercises;
  const overlappingBookExerciseIndexes = new Set(initialGeneration.overlappingBookExerciseIndexes);

  for (let retry = 0; retry < MAX_EXERCISE_GENERATION_RETRIES; retry++) {
    const coveredConcepts = new Set(generatedExercises.flatMap(({ conceptIndex }) => conceptIndex === undefined ? [] : [conceptIndex]));
    const missingConcepts = concepts.flatMap(({ sourcePageNumber: _sourcePageNumber, ...concept }, conceptIndex) => coveredConcepts.has(conceptIndex) ? [] : [{ ...concept, conceptIndex }]);

    if (!missingConcepts.length) {
      break;
    }

    const recovered = generatedExercisesResult(await runAi(GENERATE_EXERCISES_RECOVERY_PROMPT(bookDetectedLanguage, { concepts: missingConcepts }, retry + 1, MAX_EXERCISE_GENERATION_RETRIES)), concepts).exercises;

    const generatedByConcept = new Map(generatedExercises.flatMap((exercise) => exercise.conceptIndex === undefined ? [] : [[exercise.conceptIndex, exercise] as const]));

    recovered.forEach((exercise) => {
      if (exercise.conceptIndex !== undefined && !generatedByConcept.has(exercise.conceptIndex)) {
        generatedByConcept.set(exercise.conceptIndex, exercise);
      }
    });
    generatedExercises = Array.from(generatedByConcept.entries()).sort(([a], [b]) => a - b).map(([, exercise]) => exercise);
  }

  let exercises: LocatedProcessingExercise[] = [
    ...bookExercises.filter((_exercise, bookExerciseIndex) => !overlappingBookExerciseIndexes.has(bookExerciseIndex)),
    ...generatedExercises
  ];

  

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

