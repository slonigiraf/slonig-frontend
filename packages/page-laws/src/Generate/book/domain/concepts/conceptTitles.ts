// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept, Exercise } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../../abilities/abilities.js';

export type ConceptTitlesById = ReadonlyMap<number, Pick<BookConcept, 'title' | 'description'>>;

export function sourceConceptForExercise (exercise: Exercise | undefined, conceptsById: ConceptTitlesById): Pick<BookConcept, 'title' | 'description'> | undefined {
  return exercise?.conceptId === undefined ? undefined : conceptsById.get(exercise.conceptId);
}

// These titles are relationship data, not AI-generated text. Never normalize,
// translate, or rewrite a title copied from its linked Concept.
export function exerciseWithConceptTitle (exercise: Exercise, conceptsById: ConceptTitlesById): Exercise {
  const title = sourceConceptForExercise(exercise, conceptsById)?.title;

  return title !== undefined && exercise.title !== title ? { ...exercise, title } : exercise;
}

export function abilityWithConceptTitle (ability: GeneratedAbility, exercise: Exercise | undefined, conceptsById: ConceptTitlesById): GeneratedAbility {
  const title = sourceConceptForExercise(exercise, conceptsById)?.title;

  return title !== undefined && ability.h !== title ? { ...ability, h: title } : ability;
}

// Newly generated Abilities link directly to a Concept (not an Exercise).
export function abilityWithDirectConceptTitle (ability: GeneratedAbility, moduleId: string, conceptsById: ConceptTitlesById): GeneratedAbility {
  const conceptLink = /-concept-(\d+)$/.exec(moduleId);
  const title = conceptLink ? conceptsById.get(Number(conceptLink[1]))?.title : undefined;

  return title !== undefined && ability.h !== title ? { ...ability, h: title } : ability;
}
