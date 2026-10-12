// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { groupAbilityChanges } from './abilityChangeLogGroups.js';

describe('Ability change log grouping', (): void => {
  it('counts distinct Abilities, not change events, and retains AI highlighting', (): void => {
    const groups = groupAbilityChanges([
      { id: 1, bookId: 1, conceptId: 10, recordId: 'a', title: 'A', summary: 'Fixed image', source: 'ai', updatedAt: 1 },
      { id: 2, bookId: 1, conceptId: 10, recordId: 'a', title: 'A', summary: 'Edited question', source: 'user', updatedAt: 2 },
      { id: 3, bookId: 1, conceptId: 10, recordId: 'b', title: 'B', summary: 'Edited answer', source: 'user', updatedAt: 3 }
    ]);
    assert.equal(groups.length, 2);
    assert.equal(groups[0].latest.recordId, 'b');
    assert.equal(groups[0].hasAiChanges, false);
    assert.deepEqual(groups[1].entryIds, [2, 1]);
    assert.equal(groups[1].hasAiChanges, true);
  });

  it('returns no Abilities for an empty log', (): void => {
    assert.deepEqual(groupAbilityChanges([]), []);
  });
});
