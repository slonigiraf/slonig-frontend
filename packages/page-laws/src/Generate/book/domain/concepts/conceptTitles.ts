// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../../abilities/abilities.js';

export type ConceptTitlesById = ReadonlyMap<number, Pick<BookConcept, 'title' | 'description'>>;

// A linked Concept's title is relationship data: never rewrite or translate it.
export function abilityWithDirectConceptTitle (ability: GeneratedAbility, moduleId: string, conceptsById: ConceptTitlesById): GeneratedAbility {
  const conceptLink = /-concept-(\d+)$/.exec(moduleId);
  const title = conceptLink ? conceptsById.get(Number(conceptLink[1]))?.title : undefined;

  return title !== undefined && ability.h !== title ? { ...ability, h: title } : ability;
}
