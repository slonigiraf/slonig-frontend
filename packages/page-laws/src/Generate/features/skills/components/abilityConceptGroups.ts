// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Group Abilities directly by their source Concept, retaining unmatched records. */
export function groupAbilitiesByConcept<
  TConcept extends { id?: number },
  TAbility extends { moduleId: string }
> (concepts: TConcept[], abilities: TAbility[], conceptModuleId: (id: number) => string): {
  groups: Array<{ abilities: TAbility[]; concept: TConcept }>;
  unmatched: TAbility[];
} {
  const knownModules = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [conceptModuleId(id)]));

  return {
    groups: concepts.map((concept) => ({
      abilities: abilities.filter(({ moduleId }) => concept.id !== undefined && moduleId === conceptModuleId(concept.id)),
      concept
    })),
    unmatched: abilities.filter(({ moduleId }) => !knownModules.has(moduleId))
  };
}
