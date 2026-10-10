// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { groupAbilitiesByConcept } from './abilityConceptGroups.js';

describe('Ability cards grouped under Concepts', (): void => {
  it('groups several exercises into the same Concept, preserving Ability order', (): void => {
    const result = groupAbilitiesByConcept(
      [{ id: 10, title: 'First concept' }, { id: 20, title: 'Second concept' }],
      [{ id: 100, conceptId: 10 }, { id: 200, conceptId: 10 }, { id: 300, conceptId: 20 }],
      [{ id: 'b', moduleId: 'exercise:200' }, { id: 'c', moduleId: 'exercise:300' }, { id: 'a', moduleId: 'exercise:100' }],
      (id) => `exercise:${id}`
    );

    assert.deepEqual(result.groups.map(({ abilities }) => abilities.map(({ id }) => id)), [['b', 'a'], ['c']]);
    assert.deepEqual(result.withoutConcept, []);
    assert.deepEqual(result.unmatched, []);
  });

  it('groups directly generated Concept Abilities without source Exercises', (): void => {
    const result = groupAbilitiesByConcept(
      [{ id: 7, title: 'Core concept' }],
      [],
      [{ moduleId: 'book-2-concept-7' }],
      (id) => `book-2-exercise-${id}`,
      (id) => `book-2-concept-${id}`
    );

    assert.deepEqual(result.groups[0].abilities.map(({ moduleId }) => moduleId), ['book-2-concept-7']);
    assert.deepEqual(result.unmatched, []);
  });

  it('keeps abilities for orphan exercises and unmatched records visible', (): void => {
    const result = groupAbilitiesByConcept(
      [{ id: 10 }],
      [{ id: 100, conceptId: 10 }, { id: 200, conceptId: 99 }, { id: 300 }],
      [{ moduleId: 'exercise:200' }, { moduleId: 'exercise:300' }, { moduleId: 'unknown' }],
      (id) => `exercise:${id}`
    );

    assert.deepEqual(result.groups[0].abilities, []);
    assert.deepEqual(result.withoutConcept.map(({ moduleId }) => moduleId), ['exercise:200', 'exercise:300']);
    assert.deepEqual(result.unmatched.map(({ moduleId }) => moduleId), ['unknown']);
  });
});
