// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { assignBookConceptsToChapters, createBook, createBookConcept, deleteAbilities, deleteBook, deleteBookConcept, getAbilities, getBookConceptsForBookPage, getExercisesForBookPage, putBookChapter, putBookPage, reorderBookConcepts, replaceAbilities, replaceExercisesForBookPage, updateAbilityDisplayOrder, updateExerciseDisplayOrder } from './index.js';
import { db } from './db/index.js';

const ability = (title: string): string => JSON.stringify({ h: title, i: '', q: [{ a: 'ok', h: 'Question', i: null, p: null }], t: 3 });
const moduleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

describe('ZPD learning display order', (): void => {
  it('propagates BookConcept order to Exercises and then Abilities', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `learning-order-${Date.now()}`, created: Date.now(), name: 'Order test', opfsName: 'order.pdf', size: 1 });
    const abilityModules: string[] = [];

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });

      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });

      const first = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 0, title: 'First' });
      const second = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 1, title: 'Second' });
      const storedExercises = await replaceExercisesForBookPage([bookId, 1], [
        { conceptId: first.id, description: '', solution: '', source: 'generated', title: 'First A' },
        { conceptId: second.id, description: '', solution: '', source: 'generated', title: 'Second' },
        { conceptId: first.id, description: '', solution: '', source: 'generated', title: 'First B' }
      ]);
      const [firstA, firstB, secondExercise] = [storedExercises[0], storedExercises[2], storedExercises[1]];

      assert.deepEqual((await getExercisesForBookPage([bookId, 1])).map(({ title, displayOrder }) => [title, displayOrder]), [
        ['First A', 0],
        ['First B', 1],
        ['Second', 2]
      ]);

      for (const exercise of [firstA, firstB, secondExercise]) {
        assert.notEqual(exercise.id, undefined);
        abilityModules.push(moduleId(bookId, exercise.id as number));
      }

      await replaceAbilities(moduleId(bookId, firstA.id as number), [ability('First A.1'), ability('First A.2')]);
      await replaceAbilities(moduleId(bookId, firstB.id as number), [ability('First B')]);
      await replaceAbilities(moduleId(bookId, secondExercise.id as number), [ability('Second')]);

      assert.deepEqual((await getAbilities(moduleId(bookId, secondExercise.id as number))).map(({ displayOrder }) => displayOrder), [3]);

      await reorderBookConcepts([second.id as number, first.id as number]);

      assert.deepEqual((await getExercisesForBookPage([bookId, 1])).map(({ title, displayOrder }) => [title, displayOrder]), [
        ['Second', 0],
        ['First A', 1],
        ['First B', 2]
      ]);
      assert.deepEqual((await getAbilities(moduleId(bookId, secondExercise.id as number))).map(({ displayOrder }) => displayOrder), [0]);
      assert.deepEqual((await getAbilities(moduleId(bookId, firstA.id as number))).map(({ displayOrder }) => displayOrder), [1, 2]);
      assert.deepEqual((await getAbilities(moduleId(bookId, firstB.id as number))).map(({ displayOrder }) => displayOrder), [3]);
    } finally {
      await Promise.all(abilityModules.map((id) => deleteAbilities(id)));
      await deleteBook(bookId);
    }
  });

  it('back-propagates Ability order through Exercise to BookConcept', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `ability-back-order-${Date.now()}`, created: Date.now(), name: 'Ability back order test', opfsName: 'ability-back-order.pdf', size: 1 });
    const abilityModules: string[] = [];

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });

      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });

      const first = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 0, title: 'First' });
      const second = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 1, title: 'Second' });
      const storedExercises = await replaceExercisesForBookPage([bookId, 1], [
        { conceptId: first.id, description: '', solution: '', source: 'generated', title: 'First A' },
        { conceptId: first.id, description: '', solution: '', source: 'generated', title: 'First B' },
        { conceptId: second.id, description: '', solution: '', source: 'generated', title: 'Second' }
      ]);
      const [firstA, firstB, secondExercise] = storedExercises;

      for (const exercise of storedExercises) {
        assert.notEqual(exercise.id, undefined);
        abilityModules.push(moduleId(bookId, exercise.id as number));
      }

      await replaceAbilities(moduleId(bookId, firstA.id as number), [ability('First A.1'), ability('First A.2')]);
      await replaceAbilities(moduleId(bookId, firstB.id as number), [ability('First B')]);
      const [secondAbilityId] = await replaceAbilities(moduleId(bookId, secondExercise.id as number), [ability('Second')]);

      assert.equal((await getAbilities(moduleId(bookId, secondExercise.id as number)))[0]?.displayOrder, 3);

      await updateAbilityDisplayOrder(secondAbilityId, 0);

      assert.deepEqual((await getBookConceptsForBookPage(bookId, 1))
        .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER))
        .map(({ title, displayOrder }) => [title, displayOrder]), [
        ['Second', 0],
        ['First', 1]
      ]);
      assert.deepEqual((await getExercisesForBookPage([bookId, 1])).map(({ title, displayOrder }) => [title, displayOrder]), [
        ['Second', 0],
        ['First A', 1],
        ['First B', 2]
      ]);
      assert.equal((await getAbilities(moduleId(bookId, secondExercise.id as number)))[0]?.displayOrder, 0);
      assert.deepEqual((await getAbilities(moduleId(bookId, firstA.id as number))).map(({ displayOrder }) => displayOrder), [1, 2]);
      assert.deepEqual((await getAbilities(moduleId(bookId, firstB.id as number))).map(({ displayOrder }) => displayOrder), [3]);
    } finally {
      await Promise.all(abilityModules.map((id) => deleteAbilities(id)));
      await deleteBook(bookId);
    }
  });

  it('back-propagates Exercise order to BookConcept and then Abilities', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `exercise-back-order-${Date.now()}`, created: Date.now(), name: 'Exercise back order test', opfsName: 'exercise-back-order.pdf', size: 1 });
    const abilityModules: string[] = [];

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });

      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });

      const first = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 0, title: 'First' });
      const second = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 1, title: 'Second' });
      const storedExercises = await replaceExercisesForBookPage([bookId, 1], [
        { conceptId: first.id, description: '', solution: '', source: 'generated', title: 'First' },
        { conceptId: second.id, description: '', solution: '', source: 'generated', title: 'Second A' },
        { conceptId: second.id, description: '', solution: '', source: 'generated', title: 'Second B' }
      ]);
      const [firstExercise, secondA, secondB] = storedExercises;

      for (const exercise of storedExercises) {
        assert.notEqual(exercise.id, undefined);
        const id = moduleId(bookId, exercise.id as number);

        abilityModules.push(id);
        await replaceAbilities(id, [ability(exercise.title)]);
      }

      await updateExerciseDisplayOrder(secondB.id as number, 0);

      assert.deepEqual((await getBookConceptsForBookPage(bookId, 1))
        .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER))
        .map(({ title, displayOrder }) => [title, displayOrder]), [
        ['Second', 0],
        ['First', 1]
      ]);
      assert.deepEqual((await getExercisesForBookPage([bookId, 1])).map(({ title, displayOrder }) => [title, displayOrder]), [
        ['Second B', 0],
        ['Second A', 1],
        ['First', 2]
      ]);
      assert.equal((await getAbilities(moduleId(bookId, secondB.id as number)))[0]?.displayOrder, 0);
      assert.equal((await getAbilities(moduleId(bookId, secondA.id as number)))[0]?.displayOrder, 1);
      assert.equal((await getAbilities(moduleId(bookId, firstExercise.id as number)))[0]?.displayOrder, 2);
    } finally {
      await Promise.all(abilityModules.map((id) => deleteAbilities(id)));
      await deleteBook(bookId);
    }
  });

  it('reconciles a concept reorder with rows replaced by Fix Concepts', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `concept-reorder-after-fix-${Date.now()}`, created: Date.now(), name: 'Concept reorder after fix', opfsName: 'concept-reorder-after-fix.pdf', size: 1 });

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });

      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });

      const first = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 0, title: 'First' });
      const removed = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 1, title: 'Removed by Fix Concepts' });
      const third = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 2, title: 'Third' });

      await deleteBookConcept(removed.id as number);
      const replacement = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', title: 'Added by Fix Concepts' });

      // Simulate a UI snapshot that contains both the newly added row and an id
      // that Fix Concepts deleted before the reorder reached IndexedDB.
      await reorderBookConcepts([
        third.id as number,
        replacement.id as number,
        removed.id as number,
        first.id as number
      ]);

      assert.deepEqual((await getBookConceptsForBookPage(bookId, 1))
        .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER))
        .map(({ title, displayOrder }) => [title, displayOrder]), [
        ['Third', 0],
        ['Added by Fix Concepts', 1],
        ['First', 2]
      ]);
    } finally {
      await deleteBook(bookId);
    }
  });

  it('reconciles Fix Concepts reorder when existing page concepts have no chapterId', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `legacy-concept-reorder-after-fix-${Date.now()}`, created: Date.now(), name: 'Legacy concept reorder after fix', opfsName: 'legacy-concept-reorder-after-fix.pdf', size: 1 });

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });

      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });

      // Simulate rows from an older/imported DB: page membership is correct, but
      // BookConcept.chapterId has not been denormalized onto the concepts yet.
      const first = await createBookConcept({ bookPage: [bookId, 1], description: '', displayOrder: 0, title: 'First' });
      const removed = await createBookConcept({ bookPage: [bookId, 1], description: '', displayOrder: 1, title: 'Removed by Fix Concepts' });
      const third = await createBookConcept({ bookPage: [bookId, 1], description: '', displayOrder: 2, title: 'Third' });

      await Promise.all([first.id, removed.id, third.id].flatMap((id) => id === undefined ? [] : [db.bookConcepts.update(id, { chapterId: undefined })]));
      await deleteBookConcept(removed.id as number);
      const replacement = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', title: 'Added by Fix Concepts' });

      await reorderBookConcepts([
        third.id as number,
        replacement.id as number,
        removed.id as number,
        first.id as number
      ], chapterId);

      const stored = (await getBookConceptsForBookPage(bookId, 1))
        .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER));

      assert.deepEqual(stored.map(({ title, displayOrder }) => [title, displayOrder]), [
        ['Third', 0],
        ['Added by Fix Concepts', 1],
        ['First', 2]
      ]);
      assert.deepEqual(stored.map(({ chapterId: storedChapterId }) => storedChapterId), [chapterId, chapterId, chapterId]);
    } finally {
      await deleteBook(bookId);
    }
  });

  it('reconciles a reorder snapshot after Fix Concepts replaced every concept id', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `all-stale-concept-reorder-${Date.now()}`, created: Date.now(), name: 'All stale concept reorder', opfsName: 'all-stale-concept-reorder.pdf', size: 1 });

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });

      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });

      const oldFirst = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 0, title: 'Old first' });
      const oldSecond = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 1, title: 'Old second' });

      await deleteBookConcept(oldFirst.id as number);
      await deleteBookConcept(oldSecond.id as number);
      await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 0, title: 'New first' });
      await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', displayOrder: 1, title: 'New second' });

      // The rendered snapshot can contain only ids that Fix Concepts has just
      // removed. Explicit chapter scope must make this recoverable, not fatal.
      await reorderBookConcepts([oldSecond.id as number, oldFirst.id as number], chapterId);

      assert.deepEqual((await getBookConceptsForBookPage(bookId, 1))
        .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER))
        .map(({ title, displayOrder }) => [title, displayOrder]), [
        ['New first', 0],
        ['New second', 1]
      ]);
    } finally {
      await deleteBook(bookId);
    }
  });

  it('infers chapter membership from BookPage for stale legacy concept reorder', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `legacy-page-scope-reorder-${Date.now()}`, created: Date.now(), name: 'Legacy page scope reorder', opfsName: 'legacy-page-scope-reorder.pdf', size: 1 });

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });

      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });

      const first = await createBookConcept({ bookPage: [bookId, 1], description: '', displayOrder: 0, title: 'First' });
      const removed = await createBookConcept({ bookPage: [bookId, 1], description: '', displayOrder: 1, title: 'Removed' });
      const third = await createBookConcept({ bookPage: [bookId, 1], description: '', displayOrder: 2, title: 'Third' });

      await Promise.all([first.id, removed.id, third.id].flatMap((id) => id === undefined ? [] : [db.bookConcepts.update(id, { chapterId: undefined })]));
      await deleteBookConcept(removed.id as number);

      // No explicit chapter argument here: surviving page-bound rows must still
      // provide enough scope to reconcile the stale deleted id.
      await reorderBookConcepts([third.id as number, removed.id as number, first.id as number]);

      assert.deepEqual((await getBookConceptsForBookPage(bookId, 1))
        .sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER))
        .map(({ title, displayOrder, chapterId: storedChapterId }) => [title, displayOrder, storedChapterId]), [
        ['Third', 0, chapterId],
        ['First', 1, chapterId]
      ]);
    } finally {
      await deleteBook(bookId);
    }
  });

  it('keeps explicit thematic Concept membership authoritative over its source page chapter', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `thematic-concept-membership-${Date.now()}`, created: Date.now(), name: 'Thematic membership', opfsName: 'thematic-membership.pdf', size: 1 });

    try {
      const sourceChapterId = await putBookChapter({ bookId, title: 'Source chapter' });
      const thematicChapterId = await putBookChapter({ bookId, title: 'Thematic chapter' });

      await putBookPage({ bookId, chapter: 'Source chapter', chapterId: sourceChapterId, conceptsProcessed: true, pageNumber: 1 });
      await putBookPage({ bookId, chapter: 'Thematic chapter', chapterId: thematicChapterId, conceptsProcessed: true, pageNumber: 2 });

      const sourceConcept = await createBookConcept({ bookPage: [bookId, 1], chapterId: sourceChapterId, description: '', displayOrder: 0, title: 'Source' });
      const movedConcept = await createBookConcept({ bookPage: [bookId, 1], chapterId: sourceChapterId, description: '', displayOrder: 1, title: 'Moved' });

      await assignBookConceptsToChapters([
        { chapterId: sourceChapterId, displayOrder: 0, id: sourceConcept.id as number },
        { chapterId: thematicChapterId, displayOrder: 0, id: movedConcept.id as number }
      ]);

      const stored = await getBookConceptsForBookPage(bookId, 1);
      const storedSource = stored.find(({ id }) => id === sourceConcept.id);
      const storedMoved = stored.find(({ id }) => id === movedConcept.id);

      assert.equal(storedSource?.chapterId, sourceChapterId);
      assert.equal(storedMoved?.chapterId, thematicChapterId);
      assert.deepEqual(storedMoved?.bookPage, [bookId, 1]);

      // Reordering either chapter must use explicit Concept membership, not the
      // moved Concept's source page assignment.
      await reorderBookConcepts([sourceConcept.id as number], sourceChapterId);
      await reorderBookConcepts([movedConcept.id as number], thematicChapterId);

      assert.equal((await getBookConceptsForBookPage(bookId, 1)).find(({ id }) => id === movedConcept.id)?.chapterId, thematicChapterId);

      const explicitlyCreated = await createBookConcept({ bookPage: [bookId, 1], chapterId: thematicChapterId, description: '', displayOrder: 1, title: 'Explicit target' });

      assert.equal(explicitlyCreated.chapterId, thematicChapterId);
      assert.deepEqual(explicitlyCreated.bookPage, [bookId, 1]);
    } finally {
      await deleteBook(bookId);
    }
  });

});
