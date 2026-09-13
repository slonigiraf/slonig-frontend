// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';

import { exerciseAbilityModes } from './constants.js';

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

export interface ExerciseSplitResult {
  exercises: Exercise[];
  reason: string;
  split: boolean;
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

  const imageDescription = typeof value.imageDescription === 'string' ? value.imageDescription.trim() : original.imageDescription?.trim() ?? '';
  const solutionImageDescription = typeof value.solutionImageDescription === 'string' ? value.solutionImageDescription.trim() : original.solutionImageDescription?.trim() ?? '';
  const { imageDescription: _imageDescription, solutionImageDescription: _solutionImageDescription, ...originalWithoutVisualDescriptions } = original;

  return {
    ...originalWithoutVisualDescriptions,
    abilityMode: value.abilityMode as typeof exerciseAbilityModes[number],
    description: value.description.trim(),
    ...(imageDescription ? { imageDescription } : {}),
    solution: value.solution.trim(),
    ...(solutionImageDescription ? { solutionImageDescription } : {}),
    title: value.title.trim()
  };
}

function exerciseSignature (exercise: Exercise): string {
  return JSON.stringify({
    abilityMode: exercise.abilityMode ?? '',
    description: exercise.description.trim(),
    imageDescription: exercise.imageDescription?.trim() ?? '',
    solution: (exercise.solution ?? '').trim(),
    solutionImageDescription: exercise.solutionImageDescription?.trim() ?? '',
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


export function parseExerciseSplitResult (content: string, original: Exercise, allowedConceptIds: number[]): ExerciseSplitResult {
  const parsed = parseResponse(content);

  if (!isRecord(parsed) || typeof parsed.split !== 'boolean' || !isNonEmptyString(parsed.reason) || !Array.isArray(parsed.exercises)) {
    throw new Error('OpenRouter returned invalid Exercise split data.');
  }

  if (!parsed.split) {
    if (parsed.exercises.length) {
      throw new Error('An atomic Exercise split result must not include replacement Exercises.');
    }

    return { exercises: [], reason: parsed.reason.trim(), split: false };
  }

  if (parsed.exercises.length < 2) {
    throw new Error('A split Exercise must produce at least two replacement Exercises.');
  }

  const allowed = new Set(allowedConceptIds);
  const exercises = parsed.exercises.map((value: unknown): Exercise => {
    if (
      !isRecord(value) ||
      !isNonEmptyString(value.title) ||
      !isNonEmptyString(value.description) ||
      !isNonEmptyString(value.solution) ||
      typeof value.abilityMode !== 'string' ||
      !exerciseAbilityModes.includes(value.abilityMode as typeof exerciseAbilityModes[number]) ||
      typeof value.imageDescription !== 'string' ||
      typeof value.solutionImageDescription !== 'string' ||
      !('conceptId' in value) ||
      !(value.conceptId === null || (typeof value.conceptId === 'number' && Number.isSafeInteger(value.conceptId)))
    ) {
      throw new Error('Every split Exercise must include complete editable Exercise fields and a valid conceptId.');
    }

    const requestedConceptId = typeof value.conceptId === 'number' ? value.conceptId : original.conceptId;

    if (requestedConceptId !== undefined && requestedConceptId !== original.conceptId && !allowed.has(requestedConceptId)) {
      throw new Error('A split Exercise referenced a conceptId outside the supplied chapter.');
    }

    const { id: _id, imageDescription: _oldImageDescription, solutionImageDescription: _oldSolutionImageDescription, ...originalWithoutIdAndVisuals } = original;
    const imageDescription = value.imageDescription.trim();
    const solutionImageDescription = value.solutionImageDescription.trim();

    return {
      ...originalWithoutIdAndVisuals,
      abilityMode: value.abilityMode as typeof exerciseAbilityModes[number],
      conceptId: requestedConceptId,
      description: value.description.trim(),
      ...(imageDescription ? { imageDescription } : {}),
      solution: value.solution.trim(),
      ...(solutionImageDescription ? { solutionImageDescription } : {}),
      title: value.title.trim()
    } as Exercise;
  });

  const signatures = exercises.map(exerciseSignature);

  if (new Set(signatures).size !== signatures.length) {
    throw new Error('A split Exercise result contains duplicate replacement Exercises.');
  }

  return { exercises, reason: parsed.reason.trim(), split: true };
}
