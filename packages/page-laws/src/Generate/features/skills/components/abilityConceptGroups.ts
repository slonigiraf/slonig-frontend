// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Group displayed Ability records by their parent Concept. Exercises are only
 * used to resolve the relationship; they are not rendered as parent cards. */
export function groupAbilitiesByConcept<
  TConcept extends { id?: number },
  TExercise extends { conceptId?: number; id?: number },
  TAbility extends { moduleId: string }
> (concepts: TConcept[], exercises: TExercise[], abilities: TAbility[], exerciseModuleId: (id: number) => string): {
  groups: Array<{ abilities: TAbility[]; concept: TConcept }>;
  withoutConcept: TAbility[];
  unmatched: TAbility[];
} {
  const conceptIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));
  const moduleIdsByConcept = new Map<number, Set<string>>();
  const knownModules = new Set<string>();
  const withoutConceptModules = new Set<string>();

  for (const { conceptId, id } of exercises) {
    if (id === undefined) {
      continue;
    }

    const moduleId = exerciseModuleId(id);

    knownModules.add(moduleId);

    if (conceptId === undefined || !conceptIds.has(conceptId)) {
      withoutConceptModules.add(moduleId);
    } else {
      const ids = moduleIdsByConcept.get(conceptId) ?? new Set<string>();

      ids.add(moduleId);
      moduleIdsByConcept.set(conceptId, ids);
    }
  }

  return {
    groups: concepts.map((concept) => ({
      abilities: abilities.filter(({ moduleId }) => concept.id !== undefined && moduleIdsByConcept.get(concept.id)?.has(moduleId)),
      concept
    })),
    withoutConcept: abilities.filter(({ moduleId }) => withoutConceptModules.has(moduleId)),
    unmatched: abilities.filter(({ moduleId }) => !knownModules.has(moduleId))
  };
}

/** Resolve the original source Exercise for each generated Ability via its
 * persisted exercise module ID (not by display order or Concept). */
export function indexSourceExercisesByModuleId<TExercise extends { id?: number }> (
  exercises: TExercise[],
  exerciseModuleId: (id: number) => string
): Map<string, TExercise> {
  return new Map(exercises.flatMap((exercise) => exercise.id === undefined
    ? []
    : [[exerciseModuleId(exercise.id), exercise] as const]));
}
