// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Exercise } from '@slonigiraf/db';

import { abilityRepairInput, exerciseRepairInput, type StoredAbility } from './abilityProcessing.js';

describe('Ability repair source evidence', (): void => {
  it('always includes both source Exercise and source Concept without needing an embedding alert', (): void => {
    const record: StoredAbility = { ability: null, content: '{}', id: 'ability-1', moduleId: 'book-1-exercise-7' };
    const sourceExercise = { conceptId: 3, description: 'Convert kilometers to meters.', id: 7, title: 'Convert lengths', solution: 'Multiply by 1000.' } as Exercise;
    const sourceConcept = { description: 'One kilometer contains 1000 meters.', title: 'Kilometers in meters' };
    const input = abilityRepairInput('en', [record], 'Measurements', 11, undefined,
      new Map([[record.moduleId, sourceExercise]]), new Map([[3, sourceConcept]])) as { abilities: Array<{ sourceConcept?: typeof sourceConcept; sourceExercise?: unknown }> };

    assert.deepEqual(input.abilities[0].sourceConcept, sourceConcept);
    assert.ok(input.abilities[0].sourceExercise);
  });
  it('includes the source Concept in Fix exercises input', (): void => {
    const exercise = { conceptId: 3, description: 'Convert distance.', id: 7, title: 'Old title', solution: 'Multiply.' } as Exercise;
    const concept = { title: 'Distance conversion', description: 'Convert km to m.' };
    const input = exerciseRepairInput('en', [exercise], 'Measurements', 11, new Map([[3, concept]])) as { exercises: Array<{ sourceConcept: typeof concept }> };

    assert.deepEqual(input.exercises[0].sourceConcept, concept);
  });
});
