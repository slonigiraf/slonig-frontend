// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Stages always execute in pipeline order and only for the selected Concept. */
export const CONCEPT_REDO_STAGES = [
  { key: 'exercises', label: 'Create Exercise' },
  { key: 'fixExercises', label: 'Fix Exercise' },
  { key: 'abilities', label: 'Create Ability' },
  { key: 'fixAbilities', label: 'Fix Ability' },
  { key: 'images', label: 'Generate Images' },
  { key: 'fixImages', label: 'Fix Images' }
] as const;

export type ConceptRedoStage = typeof CONCEPT_REDO_STAGES[number]['key'];

export function conceptRedoStagesFrom (start: ConceptRedoStage): ConceptRedoStage[] {
  const index = CONCEPT_REDO_STAGES.findIndex(({ key }) => key === start);

  if (index < 0) throw new Error('Unknown Concept regeneration stage.');

  return CONCEPT_REDO_STAGES.slice(index).map(({ key }) => key);
}
