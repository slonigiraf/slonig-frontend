// Copyright 2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { db } from './db/index.js';

import { ABILITY_FIX_FIELDS, abilityFixHasChanges, abilityFixHasTextChanges, effectiveAbilityFixInstructions, addBookAbilityChangeLog, emptyAbilityFixInstructions, getBookAbilityChangeLog, getBookAbilityWorkQueue, getAbilities, removeBookAbilityWorkItem, relinkBookAbilityChangeLogRecord, replaceAbility, replaceAbilities, storeAbility, reviewBookAbilityChangeLogEntries, reviewBookAbilityChangeLogEntry, resetBookAbilityReviews, setBookAbilityReviewed, scheduleBookAbilityFix, toggleBookAbilitySplitWorkItem } from './index.js';

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
    assert.deepEqual((await getBookAbilityChangeLog(bookId)).map(({ recordId }) => recordId), ['new']);
    assert.equal((await getBookAbilityChangeLog(otherBook))[0].recordId, 'old');
    await relinkBookAbilityChangeLogRecord(bookId, 'new', 'new');
  });

  it('atomically replaces an AI-fixed Ability instead of appending a second DB record', async (): Promise<void> => {
    const bookId = Date.now() + 55000;
    const conceptId = bookId + 1;
    const moduleId = `book-${bookId}-concept-${conceptId}`;
    const ability = (first: string, second: string): string => JSON.stringify({
      t: 3, h: 'Addition', i: '', q: [{ h: first, a: '5', p: null, i: null }, { h: second, a: '9', p: null, i: null }]
    });
    const originalId = await storeAbility(moduleId, ability('2 + 3', '4 + 5'), 7);
    const initialLogId = await addBookAbilityChangeLog({ bookId, conceptId, recordId: originalId,
      title: 'Addition', source: 'ai', summary: 'First fix' });
    await scheduleBookAbilityFix(bookId, conceptId, originalId, emptyAbilityFixInstructions());

    const firstId = await replaceAbility(originalId, ability('6 + 7', '8 + 9'));
    assert.notEqual(firstId, originalId);
    assert.deepEqual((await getAbilities(moduleId)).map(({ id }) => id), [firstId]);
    assert.equal((await getAbilities(moduleId))[0].displayOrder, 7);
    assert.deepEqual(await getBookAbilityChangeLog(bookId), [], 'scheduling Fix again removes its unreviewed previous change');
    assert.equal((await getBookAbilityWorkQueue(bookId))[0].recordId, firstId);
    assert.equal(await db.bookAbilityChangeLog.get(initialLogId), undefined);

    const secondId = await replaceAbility(firstId, ability('10 + 11', '12 + 13'));
    assert.deepEqual((await getAbilities(moduleId)).map(({ id }) => id), [secondId],
      'repeating Fix with AI should keep only one version in IndexedDB');
    assert.equal((await getBookAbilityWorkQueue(bookId))[0].recordId, secondId);
    assert.deepEqual(await getBookAbilityChangeLog(bookId), []);

    await assert.rejects(replaceAbility(firstId, ability('100 + 1', '200 + 2')), /already been changed/);
    assert.deepEqual((await getAbilities(moduleId)).map(({ id }) => id), [secondId],
      'stale concurrent saves must not insert orphan Ability records');
  });

  it('enforces one Ability per Concept while preserving atomic regeneration and other modules', async (): Promise<void> => {
    const bookId = Date.now() + 65000;
    const moduleId = `book-${bookId}-concept-${bookId + 1}`;
    const otherModuleId = `book-${bookId}-concept-${bookId + 2}`;
    const originalContent = JSON.stringify({ t: 3, h: 'A', i: '', q: [{ h: '2 + 3', a: '5' }, { h: '4 + 5', a: '9' }] });
    const secondContent = JSON.stringify({ t: 3, h: 'B', i: '', q: [{ h: '2 × 3', a: '6' }, { h: '4 × 5', a: '20' }] });
    const replacementContent = JSON.stringify({ t: 3, h: 'A', i: '', q: [{ h: '6 + 7', a: '13' }, { h: '8 + 9', a: '17' }] });
    const foreignContent = JSON.stringify({ t: 3, h: 'C', i: '', q: [{ h: '10', a: '10' }, { h: '20', a: '20' }] });
    const oldId = await storeAbility(moduleId, originalContent);
    const foreignId = await storeAbility(otherModuleId, foreignContent);

    await assert.rejects(storeAbility(moduleId, secondContent), /Only one Ability/);
    assert.equal(await storeAbility(moduleId, originalContent), oldId, 'saving identical content is idempotent');
    await assert.rejects(storeAbility(otherModuleId, originalContent), /another Concept or module/);
    await assert.rejects(replaceAbilities(moduleId, [replacementContent, secondContent]), /Only one Ability/);
    await assert.rejects(replaceAbility(oldId, foreignContent), /another Concept/);
    assert.deepEqual((await getAbilities(moduleId)).map(({ id }) => id), [oldId], 'rejected writes leave existing data unchanged');
    assert.equal((await getAbilities(otherModuleId))[0].id, foreignId);

    const [newId] = await replaceAbilities(moduleId, [replacementContent]);
    assert.deepEqual((await getAbilities(moduleId)).map(({ id }) => id), [newId]);
    assert.equal((await getAbilities(otherModuleId))[0].id, foreignId);

    const editedId = await replaceAbility(newId, originalContent);
    assert.deepEqual((await getAbilities(moduleId)).map(({ id }) => id), [editedId]);
    // The restriction applies to Concept-backed Abilities, not generic modules.
    const genericModule = `skill-${bookId}`;
    await storeAbility(genericModule, secondContent);
    await storeAbility(genericModule, replacementContent);
    assert.equal((await getAbilities(genericModule)).length, 2);
  });

  it('persists review flags, resets a chapter range, and reopens changed Abilities', async (): Promise<void> => {
    const bookId = Date.now() + 260000;
    const first = `book-${bookId}-concept-100`;
    const second = `book-${bookId}-concept-101`;
    const content = (title: string): string => JSON.stringify({ t: 3, h: title, i: '', q: [{ h: 'Question', a: 'Answer', p: null, i: null }] });
    const firstId = await storeAbility(first, content('First'));
    const secondId = await storeAbility(second, content('Second'));
    await setBookAbilityReviewed(bookId, firstId, true);
    await setBookAbilityReviewed(bookId, secondId, true);
    assert.equal((await getAbilities(first))[0].reviewed, true);
    assert.equal((await getAbilities(second))[0].reviewed, true);
    await resetBookAbilityReviews(bookId, [secondId]);
    assert.equal((await getAbilities(first))[0].reviewed, true, 'earlier chapters stay reviewed');
    assert.equal((await getAbilities(second))[0].reviewed, false, 'selected and later chapters reopen');
    const replaced = await replaceAbility(firstId, content('First edited'));
    assert.equal((await getAbilities(first))[0].reviewed, false, 'edited content invalidates review');
    await setBookAbilityReviewed(bookId, replaced, true);
    await addBookAbilityChangeLog({ bookId, conceptId: 100, recordId: replaced, source: 'ai', title: 'First edited', summary: 'AI changed an image' });
    assert.equal((await getAbilities(first))[0].reviewed, false, 'AI-only image fixes invalidate review');
    assert.equal((await getBookAbilityChangeLog(bookId)).length, 1);
    await scheduleBookAbilityFix(bookId, 100, replaced, emptyAbilityFixInstructions());
    assert.deepEqual(await getBookAbilityChangeLog(bookId), [], 'another Fix removes superseded unreviewed change');
  });

  it('replaces the previous AI log when the same Concept Ability is regenerated', async (): Promise<void> => {
    const bookId = Date.now() + 19000;
    const conceptId = bookId + 100;
    const moduleId = `book-${bookId}-concept-${conceptId}`;
    const oldId = await storeAbility(moduleId, JSON.stringify({ t: 3, h: 'Addition', i: '', q: [{ h: '2 + 3', a: '5' }, { h: '4 + 5', a: '9' }] }));
    await addBookAbilityChangeLog({ bookId, conceptId, recordId: oldId, title: 'Addition', source: 'ai', summary: 'First fix' });
    const newId = await replaceAbility(oldId, JSON.stringify({ t: 3, h: 'Addition', i: '', q: [{ h: '6 + 7', a: '13' }, { h: '8 + 9', a: '17' }] }));
    // Simulate a historical edit whose old log was not relinked.
    await addBookAbilityChangeLog({ bookId, conceptId, recordId: newId, title: 'Addition', source: 'ai', summary: 'Second fix' });
    const entries = await getBookAbilityChangeLog(bookId);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].recordId, newId);
    assert.equal(entries[0].summary, 'Second fix');
  });

  it('resolves legacy Ability IDs without merging distinct Abilities under one Concept', async (): Promise<void> => {
    const bookId = Date.now() + 29000;
    const conceptId = bookId + 100;
    const moduleId = `book-${bookId}-concept-${conceptId}`;
    const currentId = await storeAbility(moduleId, JSON.stringify({ t: 3, h: 'Fractions', i: '', q: [{ h: '1/2 + 1/2', a: '1' }, { h: '1/4 + 1/4', a: '1/2' }] }));
    await db.bookAbilityChangeLog.add({ bookId, conceptId, recordId: 'stale-old-hash', title: 'Fractions', source: 'ai', summary: 'Old', updatedAt: 10 });
    await db.bookAbilityChangeLog.add({ bookId, conceptId, recordId: currentId, title: 'Fractions', source: 'ai', summary: 'New', updatedAt: 20 });
    assert.deepEqual((await getBookAbilityChangeLog(bookId)).map(({ recordId }) => recordId), [currentId, currentId]);

    // Imported legacy databases may already contain duplicates. Do not delete
    // them implicitly just to enforce the restriction on *new* writes.
    const legacyContent = JSON.stringify({ t: 3, h: 'Fractions 2', i: '', q: [{ h: '1/3 + 1/3', a: '2/3' }, { h: '1/5 + 1/5', a: '2/5' }] });
    const otherId = `legacy-second-${bookId}`;

    await db.abilities.put({ id: otherId, moduleId, content: legacyContent });
    assert.notEqual(currentId, otherId);
    assert.deepEqual((await getBookAbilityChangeLog(bookId)).map(({ recordId }) => recordId), [currentId, 'stale-old-hash']);
  });

  it('marks every logged Ability reviewed in one operation without affecting another book', async (): Promise<void> => {
    const bookId = Date.now() + 480000;
    const otherBookId = bookId + 1;
    const conceptA = bookId + 10;
    const conceptB = bookId + 11;
    const content = (title: string): string => JSON.stringify({ t: 3, h: title, i: '', q: [{ h: title, a: 'Answer', p: null, i: null }] });
    const firstId = await storeAbility(`book-${bookId}-concept-${conceptA}`, content('First'));
    const secondId = await storeAbility(`book-${bookId}-concept-${conceptB}`, content('Second'));
    const foreignId = await storeAbility(`book-${otherBookId}-concept-3`, content('Foreign'));
    const firstEntry = await addBookAbilityChangeLog({ bookId, conceptId: conceptA, recordId: firstId,
      source: 'ai', title: 'First', summary: 'AI fixed' });
    const secondEntry = await addBookAbilityChangeLog({ bookId, conceptId: conceptB, recordId: secondId,
      source: 'ai', title: 'Second', summary: 'AI split' });
    // Older logs can point to a retired content hash, still resolvable by Concept.
    const legacyEntry = await db.bookAbilityChangeLog.add({ bookId, conceptId: conceptA, recordId: 'old-ability-id',
      source: 'ai', title: 'First', summary: 'Previous AI fix', updatedAt: 1 });
    const foreignEntry = await addBookAbilityChangeLog({ bookId: otherBookId, conceptId: 3, recordId: foreignId,
      source: 'ai', title: 'Foreign', summary: 'AI fixed' });

    await reviewBookAbilityChangeLogEntries(bookId, [firstEntry, legacyEntry, secondEntry, secondEntry, foreignEntry]);
    assert.equal((await getAbilities(`book-${bookId}-concept-${conceptA}`))[0].reviewed, true);
    assert.equal((await getAbilities(`book-${bookId}-concept-${conceptB}`))[0].reviewed, true);
    assert.deepEqual(await getBookAbilityChangeLog(bookId), []);
    assert.equal(await db.bookAbilityChangeLog.where('bookId').equals(bookId).count(), 0);
    assert.equal((await getAbilities(`book-${otherBookId}-concept-3`))[0].reviewed, false);
    assert.equal((await getBookAbilityChangeLog(otherBookId)).length, 1);
    assert.notEqual(await db.bookAbilityChangeLog.get(foreignEntry), undefined);
    await reviewBookAbilityChangeLogEntries(bookId, []);
  });

  it('shows unreviewed AI fixes and AI splits, but excludes legacy manual edits', async (): Promise<void> => {
    const bookId = Date.now() + 9000;
    const aiId = await addBookAbilityChangeLog({ bookId, recordId: 'ability-a', source: 'ai', title: 'A', summary: 'Fixed image' });
    const userId = await addBookAbilityChangeLog({ bookId, recordId: 'ability-b', source: 'user', title: 'B', summary: 'Edited question' });
    const splitId = await addBookAbilityChangeLog({ bookId, recordId: 'ability-c', source: 'ai', title: 'C', summary: 'AI split Concept Algebra and generated this Ability' });
    assert.deepEqual(new Set((await getBookAbilityChangeLog(bookId)).map(({ recordId }) => recordId)), new Set(['ability-a', 'ability-c']));
    await reviewBookAbilityChangeLogEntry(bookId + 1, aiId);
    assert.equal((await getBookAbilityChangeLog(bookId)).length, 2);
    await reviewBookAbilityChangeLogEntry(bookId, aiId);
    assert.deepEqual((await getBookAbilityChangeLog(bookId)).map(({ recordId }) => recordId), ['ability-c']);
    await reviewBookAbilityChangeLogEntry(bookId, userId);
    assert.deepEqual((await getBookAbilityChangeLog(bookId)).map(({ recordId }) => recordId), ['ability-c']);
    await reviewBookAbilityChangeLogEntry(bookId, splitId);
    assert.deepEqual(await getBookAbilityChangeLog(bookId), []);
  });
});
