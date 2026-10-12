// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groupAbilityChanges } from './abilityChangeLogGroups.js';

describe('Ability change log grouping', (): void => {
  it('groups AI fixes and AI splits, excluding legacy manual edits', (): void => {
    const groups = groupAbilityChanges([
      { id: 1, bookId: 1, conceptId: 10, recordId: 'a', title: 'A', summary: 'Fixed image', source: 'ai', updatedAt: 1 },
      { id: 2, bookId: 1, conceptId: 10, recordId: 'a', title: 'A', summary: 'Edited question', source: 'user', updatedAt: 2 },
      { id: 3, bookId: 1, conceptId: 10, recordId: 'b', title: 'B', summary: 'Edited answer', source: 'user', updatedAt: 3 },
      { id: 4, bookId: 1, conceptId: 11, recordId: 'c', title: 'C', summary: 'AI split Concept Foo and generated this Ability', source: 'ai', updatedAt: 4 },
      { id: 5, bookId: 1, conceptId: 12, recordId: 'd', title: 'D', summary: 'AI corrected Ability content', source: 'ai', updatedAt: 5 }
    ]);
    assert.equal(groups.length, 3);
    assert.equal(groups[0].latest.recordId, 'd');
    assert.equal(groups[1].latest.recordId, 'c');
    assert.deepEqual(groups[1].entryIds, [4]);
    assert.equal(groups[2].latest.recordId, 'a');
    assert.deepEqual(groups[2].entryIds, [1]);
  });

  it('shows only the latest AI fix after stored IDs have been reconciled', (): void => {
    const groups = groupAbilityChanges([
      { id: 12, bookId: 1, conceptId: 33, recordId: 'new-content-hash', title: 'Addition', source: 'ai', summary: 'First AI fix', updatedAt: 100 },
      { id: 13, bookId: 1, conceptId: 33, recordId: 'new-content-hash', title: 'Addition', source: 'ai', summary: 'Second AI fix', updatedAt: 200 },
      { id: 14, bookId: 1, conceptId: 34, recordId: 'another-ability', title: 'Subtraction', source: 'ai', summary: 'AI fix', updatedAt: 150 }
    ]);

    assert.equal(groups.length, 2);
    assert.equal(groups[0].latest.recordId, 'new-content-hash');
    assert.equal(groups[0].latest.summary, 'Second AI fix');
    assert.deepEqual(groups[0].entryIds, [13, 12], 'reviewing the latest also clears old duplicates');
    assert.equal(groups[1].latest.recordId, 'another-ability');
  });

  it('keeps separate Abilities of the same Concept distinct', (): void => {
    const groups = groupAbilityChanges([
      { id: 20, bookId: 1, conceptId: 33, recordId: 'ability-one', title: 'One', source: 'ai', summary: 'First', updatedAt: 10 },
      { id: 21, bookId: 1, conceptId: 33, recordId: 'ability-two', title: 'Two', source: 'ai', summary: 'Second', updatedAt: 20 }
    ]);

    assert.equal(groups.length, 2);
  });

  it('returns no Abilities for an empty log', (): void => {
    assert.deepEqual(groupAbilityChanges([]), []);
  });
});
