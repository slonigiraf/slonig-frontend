// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { ChapterContent } from '../SkillsTypes.js';
import { queuedAbilityWorkLabel, queuedFixItemForAbility } from './queuedAbilityWorkLabel.js';

const chapters = [{
  chapter: { id: 1, title: 'Algebra' },
  concepts: [{ id: 7, title: 'Equations' }, { id: 8, title: 'Graphs' }],
  abilities: [
    { id: 'ability-7', moduleId: 'book-2-concept-7', ability: { h: 'Solve equations' } },
    { id: 'ability-8', moduleId: 'book-2-concept-8', ability: null }
  ],
  skills: []
}];

const fix = { id: 'fix:ability-7', kind: 'fix' as const, conceptId: 7, recordId: 'ability-7' };
const split = { id: 'split:7', kind: 'split' as const, conceptId: 7 };

describe('scheduled Ability action presentation', (): void => {
  it('shows the Ability name and its Concept for either action', (): void => {
    assert.deepEqual(queuedAbilityWorkLabel(fix, chapters as unknown as ChapterContent[]), { title: 'Solve equations', concept: 'Equations' });
    assert.deepEqual(queuedAbilityWorkLabel(split, chapters as unknown as ChapterContent[]), { title: 'Solve equations', concept: 'Equations' });
  });

  it('falls back to Concept names for invalid, missing, or stale Abilities', (): void => {
    assert.deepEqual(queuedAbilityWorkLabel({ ...fix, conceptId: 8 }, chapters as unknown as ChapterContent[]), { title: 'Graphs', concept: 'Graphs' });
    assert.deepEqual(queuedAbilityWorkLabel({ ...fix, conceptId: 10 }, chapters as unknown as ChapterContent[]), { title: 'Concept 10', concept: 'Concept 10' });
    assert.deepEqual(queuedAbilityWorkLabel({ ...fix, recordId: 'old-id' }, chapters as unknown as ChapterContent[]), { title: 'Solve equations', concept: 'Equations' });
  });

  it('matches the exact fix action, or a unique Concept fix after a record ID changed', (): void => {
    const record = { id: 'ability-7', moduleId: 'book-2-concept-7' };
    assert.equal(queuedFixItemForAbility(record, [fix, split], 2)?.id, fix.id);
    assert.equal(queuedFixItemForAbility({ ...record, id: 'new-id' }, [fix, split], 1)?.id, fix.id);
    assert.equal(queuedFixItemForAbility({ ...record, id: 'new-id' }, [fix, split], 2), undefined);
    assert.equal(queuedFixItemForAbility({ ...record, id: 'new-id' }, [fix, { ...fix, id: 'fix:other', recordId: 'other' }], 1), undefined);
    assert.equal(queuedFixItemForAbility({ ...record, id: 'new-id', moduleId: 'invalid' }, [fix], 1), undefined);
  });
});
