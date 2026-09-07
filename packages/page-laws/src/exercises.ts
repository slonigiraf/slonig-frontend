// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';

import { exerciseAbilityModes } from './bookProcessing.js';

export interface ExerciseRepairReview {
  errors: string[];
  exercise?: Exercise;
  hasErrors: boolean;
  index: number;
}

export interface ExerciseDuplicatePair {
  deletedExerciseId: number;
  keptExerciseId: number;
}

export interface ExerciseRepairResult {
  duplicatePairs: ExerciseDuplicatePair[];
  reviews: ExerciseRepairReview[];
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString (value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function parseResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

function parseCorrectedExercise (value: unknown, original: Exercise): Exercise {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.title) ||
    !isNonEmptyString(value.description) ||
    !isNonEmptyString(value.solution) ||
    typeof value.abilityMode !== 'string' ||
    !exerciseAbilityModes.includes(value.abilityMode as typeof exerciseAbilityModes[number])
  ) {
    throw new Error('Every corrected Exercise must include a title, complete task, valid abilityMode, and complete solution.');
  }

  return {
    ...original,
    abilityMode: value.abilityMode as typeof exerciseAbilityModes[number],
    description: value.description.trim(),
    solution: value.solution.trim(),
    title: value.title.trim()
  };
}

function exerciseSignature (exercise: Exercise): string {
  return JSON.stringify({
    abilityMode: exercise.abilityMode ?? '',
    description: exercise.description.trim(),
    solution: (exercise.solution ?? '').trim(),
    title: exercise.title.trim()
  });
}

export function parseExerciseRepairResult (content: string, originals: Exercise[], originalIds: number[]): ExerciseRepairResult {
  if (originalIds.length !== originals.length || new Set(originalIds).size !== originalIds.length) {
    throw new Error('Exercise repair input IDs do not match the supplied Exercises.');
  }

  const parsed = parseResponse(content);

  if (!isRecord(parsed) || !Array.isArray(parsed.reviews) || !Array.isArray(parsed.duplicatePairs)) {
    throw new Error('OpenRouter returned invalid Exercise repair data.');
  }

  const allowedIds = new Set(originalIds);
  const indexesById = new Map(originalIds.map((id, index) => [id, index] as const));
  const duplicatePairs: ExerciseDuplicatePair[] = [];
  const deletedDuplicateIds = new Set<number>();
  const keptDuplicateIds = new Set<number>();

  parsed.duplicatePairs.forEach((value: unknown): void => {
    if (
      !isRecord(value) ||
      typeof value.keptExerciseId !== 'number' ||
      !Number.isSafeInteger(value.keptExerciseId) ||
      typeof value.deletedExerciseId !== 'number' ||
      !Number.isSafeInteger(value.deletedExerciseId) ||
      value.keptExerciseId === value.deletedExerciseId ||
      !allowedIds.has(value.keptExerciseId) ||
      !allowedIds.has(value.deletedExerciseId) ||
      deletedDuplicateIds.has(value.deletedExerciseId)
    ) {
      throw new Error('OpenRouter returned an invalid duplicate Exercise pair.');
    }

    const keptIndex = indexesById.get(value.keptExerciseId);
    const deletedIndex = indexesById.get(value.deletedExerciseId);

    if (keptIndex === undefined || deletedIndex === undefined || keptIndex >= deletedIndex) {
      throw new Error('OpenRouter must keep the earliest supplied duplicate Exercise.');
    }

    keptDuplicateIds.add(value.keptExerciseId);
    deletedDuplicateIds.add(value.deletedExerciseId);
    duplicatePairs.push({ deletedExerciseId: value.deletedExerciseId, keptExerciseId: value.keptExerciseId });
  });

  if (Array.from(keptDuplicateIds).some((id) => deletedDuplicateIds.has(id))) {
    throw new Error('OpenRouter returned contradictory duplicate Exercise pairs.');
  }

  const used = new Set<number>();
  const reviews: ExerciseRepairReview[] = [];

  parsed.reviews.forEach((value: unknown): void => {
    // Ignore extra reviews outside the supplied chapter rather than allowing
    // an out-of-range model response to affect another Exercise.
    if (
      isRecord(value) &&
      typeof value.index === 'number' &&
      Number.isSafeInteger(value.index) &&
      (value.index < 0 || value.index >= originals.length)
    ) {
      return;
    }

    if (
      !isRecord(value) ||
      typeof value.index !== 'number' ||
      !Number.isSafeInteger(value.index) ||
      used.has(value.index) ||
      typeof value.hasErrors !== 'boolean' ||
      !Array.isArray(value.errors) ||
      !value.errors.every((error: unknown) => isNonEmptyString(error))
    ) {
      throw new Error('OpenRouter returned an invalid or duplicate Exercise review.');
    }

    const index = value.index;
    const original = originals[index];
    const errors = value.errors.map((error) => String(error).trim());

    used.add(index);

    if (!value.hasErrors) {
      if (errors.length) {
        throw new Error('OpenRouter returned contradictory Exercise review details.');
      }

      reviews.push({ errors: [], hasErrors: false, index });

      return;
    }

    if (!errors.length) {
      throw new Error('Every erroneous Exercise review must identify at least one error.');
    }

    const exercise = parseCorrectedExercise(value.exercise, original);

    if (exerciseSignature(exercise) === exerciseSignature(original)) {
      throw new Error('OpenRouter identified an Exercise error but did not change the Exercise.');
    }

    reviews.push({ errors, exercise, hasErrors: true, index });
  });

  return { duplicatePairs, reviews: reviews.sort((a, b) => a.index - b.index) };
}
