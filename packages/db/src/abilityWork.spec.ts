// Copyright 2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { ABILITY_FIX_FIELDS, abilityFixHasChanges, abilityFixHasTextChanges, effectiveAbilityFixInstructions, addBookAbilityChangeLog, emptyAbilityFixInstructions, getBookAbilityChangeLog, getBookAbilityWorkQueue, removeBookAbilityWorkItem, relinkBookAbilityChangeLogRecord, reviewBookAbilityChangeLogEntry, scheduleBookAbilityFix, toggleBookAbilitySplitWorkItem } from './index.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('Persistent Ability work and change history', (): void => {
  it('distinguishes image-only repairs from Ability regeneration', (): void => {
    const instructions = emptyAbilityFixInstructions();
    assert.equal(ABILITY_FIX_FIELDS.length, 9);
    instructions.exercise1QuestionImage = 'Labels overlap';
    instructions.exercise2AnswerImage = 'Wrong scale';
    assert.equal(abilityFixHasTextChanges(instructions), false);
    instructions.exercise2Question = 'Ask for three values';
    assert.equal(abilityFixHasTextChanges(instructions), true);
  });

  it('prioritizes a whole-Ability correction over every detailed note', (): void => {
    const instructions = emptyAbilityFixInstructions();
    instructions.exercise1QuestionImage = 'Old image note';
    instructions.title = 'Old title note';
    instructions.overall = '  Make the exercises appropriate for younger learners  ';
    const effective = effectiveAbilityFixInstructions(instructions);
    assert.equal(effective.overall, 'Make the exercises appropriate for younger learners');
    assert.equal(effective.title, '');
    assert.equal(effective.exercise1QuestionImage, '');
    assert.equal(abilityFixHasChanges(instructions), true);
    assert.equal(abilityFixHasTextChanges(effective), true);
    assert.equal(abilityFixHasChanges({ ...emptyAbilityFixInstructions(), overall: '  ' }), false);
    assert.deepEqual(effectiveAbilityFixInstructions({ ...instructions, overall: '' }).exercise1QuestionImage, 'Old image note');
  });

  it('stores split and fix jobs together, isolates books, and keeps failures queued', async (): Promise<void> => {
    const first = Date.now() + 5000;
    const second = first + 1;
    const instructions = emptyAbilityFixInstructions();
    instructions.exercise1QuestionImage = 'Dots need alignment';
    await toggleBookAbilitySplitWorkItem(first, 31);
    await scheduleBookAbilityFix(first, 32, 'ability-32', instructions);
    await scheduleBookAbilityFix(second, 33, 'ability-33', instructions);
    let items = await getBookAbilityWorkQueue(first);
    assert.deepEqual(items.map(({ id }) => id), ['split:31', 'fix:ability-32']);
    assert.equal(items[1].instructions?.regenerateExercises, true, 'an image error with no written text should also regenerate the exercises');
    assert.deepEqual((await getBookAbilityWorkQueue(second)).map(({ id }) => id), ['fix:ability-33']);
    instructions.exercise1QuestionImage = 'Repair the coordinate labels';
    items = await scheduleBookAbilityFix(first, 32, 'ability-32', instructions);
    assert.equal(items.length, 2);
    assert.equal(items[1].instructions?.exercise1QuestionImage, 'Repair the coordinate labels');
    instructions.overall = 'Correct the entire Ability';
    items = await scheduleBookAbilityFix(first, 32, 'ability-32', instructions);
    assert.equal(items[1].instructions?.overall, 'Correct the entire Ability');
    assert.equal(items[1].instructions?.exercise1QuestionImage, '', 'global feedback wins when scheduling');
    await removeBookAbilityWorkItem(first, 'split:31');
    assert.deepEqual((await getBookAbilityWorkQueue(first)).map(({ id }) => id), ['fix:ability-32']);
    await removeBookAbilityWorkItem(first, 'fix:ability-32');
    await removeBookAbilityWorkItem(second, 'fix:ability-33');
  });

  it('relinks previous log entries when an edited Ability gets a new content-based ID', async (): Promise<void> => {
    const bookId = Date.now() + 15000;
    const otherBook = bookId + 1;
    await addBookAbilityChangeLog({ bookId, recordId: 'old', source: 'ai', title: 'Ability', summary: 'Fixed image' });
    await addBookAbilityChangeLog({ bookId, recordId: 'old', source: 'user', title: 'Ability', summary: 'Changed answer' });
    await addBookAbilityChangeLog({ bookId: otherBook, recordId: 'old', source: 'ai', title: 'Different book', summary: 'Fixed' });
    await relinkBookAbilityChangeLogRecord(bookId, 'old', 'new');
    assert.deepEqual((await getBookAbilityChangeLog(bookId)).map(({ recordId }) => recordId), ['new', 'new']);
    assert.equal((await getBookAbilityChangeLog(otherBook))[0].recordId, 'old');
    await relinkBookAbilityChangeLogRecord(bookId, 'new', 'new');
  });

  it('keeps unreviewed AI and user edits until each is marked reviewed', async (): Promise<void> => {
    const bookId = Date.now() + 9000;
    const aiId = await addBookAbilityChangeLog({ bookId, recordId: 'ability-a', source: 'ai', title: 'A', summary: 'Fixed image' });
    const userId = await addBookAbilityChangeLog({ bookId, recordId: 'ability-b', source: 'user', title: 'B', summary: 'Edited question' });
    assert.equal((await getBookAbilityChangeLog(bookId)).length, 2);
    await reviewBookAbilityChangeLogEntry(bookId + 1, aiId);
    assert.equal((await getBookAbilityChangeLog(bookId)).length, 2);
    await reviewBookAbilityChangeLogEntry(bookId, aiId);
    assert.deepEqual((await getBookAbilityChangeLog(bookId)).map(({ source }) => source), ['user']);
    await reviewBookAbilityChangeLogEntry(bookId, userId);
    assert.deepEqual(await getBookAbilityChangeLog(bookId), []);
  });
});
