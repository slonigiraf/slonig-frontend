// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import type { ChapterContent } from '../SkillsTypes.js';
import { queuedAbilityReviewSelection, queuedAbilityWorkLabel, queuedAbilityWorkRecord, queuedFixItemForAbility } from './queuedAbilityWorkLabel.js';

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

  it('resolves a queued job to the stored Ability', (): void => {
    const content = chapters as unknown as ChapterContent[];

    assert.equal(queuedAbilityWorkRecord(fix, content)?.id, 'ability-7');
    assert.equal(queuedAbilityWorkRecord(split, content)?.id, 'ability-7');
    assert.equal(queuedAbilityWorkRecord({ ...fix, recordId: 'old-id' }, content)?.id, 'ability-7');
    assert.equal(queuedAbilityWorkRecord({ ...fix, conceptId: 10 }, content), undefined);
    assert.equal(queuedAbilityWorkRecord(fix, [{ ...content[0], abilities: [
      ...content[0].abilities,
      { id: 'second-7', moduleId: 'book-2-concept-7', ability: null, content: '' }
    ] }])?.id, 'ability-7');
    assert.equal(queuedAbilityWorkRecord({ ...fix, recordId: 'old-id' }, [{ ...content[0], abilities: [
      ...content[0].abilities,
      { id: 'second-7', moduleId: 'book-2-concept-7', ability: null, content: '' }
    ] }]), undefined);
  });


  it('selects only scheduled Abilities, including both Fix and Split jobs, without duplicates', (): void => {
    const content = chapters as unknown as ChapterContent[];

    assert.deepEqual(queuedAbilityReviewSelection([fix, split, { ...fix, id: 'fix:other', conceptId: 8, recordId: 'ability-8' }], content), {
      ids: ['ability-7', 'ability-8'], missing: 0
    });
    assert.deepEqual(queuedAbilityReviewSelection([], content), { ids: [], missing: 0 });
  });

  it('resolves stale IDs only for unambiguous Concepts, never silently includes missing jobs', (): void => {
    const content = chapters as unknown as ChapterContent[];
    const withDuplicates = [{ ...content[0], abilities: [
      ...content[0].abilities,
      { id: 'second-7', moduleId: 'book-2-concept-7', ability: null, content: '' }
    ] }];

    assert.deepEqual(queuedAbilityReviewSelection([{ ...fix, recordId: 'old-id' }], content), {
      ids: ['ability-7'], missing: 0
    });
    assert.deepEqual(queuedAbilityReviewSelection([{ ...fix, recordId: 'old-id' }, { ...fix, id: 'fix:missing', conceptId: 99 }], withDuplicates), {
      ids: [], missing: 2
    });
    assert.deepEqual(queuedAbilityReviewSelection([fix, { ...fix, id: 'fix:missing', conceptId: 99 }], content), {
      ids: ['ability-7'], missing: 1
    });
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
