// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { groupAbilitiesByConcept } from './abilityConceptGroups.js';

const conceptModuleId = (id: number): string => `book-2-concept-${id}`;

describe('Ability cards grouped directly under Concepts', (): void => {
  it('groups Concept-linked Abilities in Concept order', (): void => {
    const result = groupAbilitiesByConcept(
      [{ id: 10, title: 'First concept' }, { id: 20, title: 'Second concept' }],
      [{ id: 'second', moduleId: conceptModuleId(20) }, { id: 'first', moduleId: conceptModuleId(10) }],
      conceptModuleId
    );

    assert.deepEqual(result.groups.map(({ abilities }) => abilities.map(({ id }) => id)), [['first'], ['second']]);
    assert.deepEqual(result.unmatched, []);
  });

  it('keeps Concepts with missing Abilities and flags unlinked records', (): void => {
    const result = groupAbilitiesByConcept(
      [{ id: 10 }, { id: 20 }],
      [{ moduleId: conceptModuleId(20) }, { moduleId: 'book-2-concept-999' }, { moduleId: 'unknown' }],
      conceptModuleId
    );

    assert.deepEqual(result.groups.map(({ abilities }) => abilities.map(({ moduleId }) => moduleId)), [[], [conceptModuleId(20)]]);
    assert.deepEqual(result.unmatched.map(({ moduleId }) => moduleId), ['book-2-concept-999', 'unknown']);
  });
});
