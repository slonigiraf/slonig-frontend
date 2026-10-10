// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Exercise } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../../abilities/abilities.js';
import { abilityWithConceptTitle, abilityWithDirectConceptTitle, exerciseWithConceptTitle } from './conceptTitles.js';

describe('Concept title inheritance', (): void => {
  const concepts = new Map([[3, { title: 'DNA & RNA: TP53', description: 'Compare their roles.' }]]);
  const source = { conceptId: 3, title: 'Invented Exercise title', description: 'Describe the role.', solution: 'One role.' } as Exercise;
  const ability = { h: 'Invented Ability title', i: '', t: 3, q: [
    { h: 'Question A', a: 'Answer A', i: '', p: '' },
    { h: 'Question B', a: 'Answer B', i: '', p: '' }
  ] } as GeneratedAbility;

  it('uses the exact linked Concept title for Exercises', (): void => {
    assert.equal(exerciseWithConceptTitle(source, concepts).title, 'DNA & RNA: TP53');
  });

  it('uses the exact linked Concept title for Abilities without modifying questions', (): void => {
    const corrected = abilityWithConceptTitle(ability, source, concepts);

    assert.equal(corrected.h, 'DNA & RNA: TP53');
    assert.deepEqual(corrected.q, ability.q);
  });

  it('copies a direct source Concept title without any Exercise', (): void => {
    const corrected = abilityWithDirectConceptTitle(ability, 'book-1-concept-3', concepts);

    assert.equal(corrected.h, 'DNA & RNA: TP53');
    assert.deepEqual(corrected.q, ability.q);
    assert.equal(abilityWithDirectConceptTitle(ability, 'book-1-exercise-3', concepts).h, ability.h);
  });

  it('leaves unlinked legacy records unchanged', (): void => {
    assert.equal(exerciseWithConceptTitle({ ...source, conceptId: undefined }, concepts).title, source.title);
    assert.equal(abilityWithConceptTitle(ability, { ...source, conceptId: undefined }, concepts).h, ability.h);
  });
});
