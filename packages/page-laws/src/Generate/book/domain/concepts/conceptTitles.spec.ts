// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GeneratedAbility } from '../../../../abilities/abilities.js';
import { abilityWithDirectConceptTitle } from './conceptTitles.js';

describe('direct Concept title inheritance', (): void => {
  const concepts = new Map([[3, { title: 'DNA & RNA: TP53', description: 'Compare their roles.' }]]);
  const ability = { h: 'Invented Ability title', i: '', t: 3, q: [
    { h: 'Question A', a: 'Answer A', i: '', p: '' },
    { h: 'Question B', a: 'Answer B', i: '', p: '' }
  ] } as GeneratedAbility;

  it('uses the exact linked Concept title without modifying Ability questions', (): void => {
    const corrected = abilityWithDirectConceptTitle(ability, 'book-1-concept-3', concepts);

    assert.equal(corrected.h, 'DNA & RNA: TP53');
    assert.deepEqual(corrected.q, ability.q);
  });

  it('does not rewrite Abilities without a linked Concept', (): void => {
    assert.equal(abilityWithDirectConceptTitle(ability, 'book-1-exercise-3', concepts).h, ability.h);
    assert.equal(abilityWithDirectConceptTitle(ability, 'book-1-concept-99', concepts).h, ability.h);
  });
});
