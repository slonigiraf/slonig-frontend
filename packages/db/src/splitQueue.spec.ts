// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { createBook, createBookConcept, deleteBook, getAbilities, getBookAbilitySplitQueue, getBookConceptsForBookPage, putBookChapter, putBookPage, removeBookAbilitySplitQueueItem, replaceBookConceptWithChildren, replaceAbilities, toggleBookAbilitySplitQueueItem } from './index.js';
import { db } from './db/index.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('Ability split queue in IndexedDB', (): void => {
  it('persists book-specific IDs and toggles a queued Ability off', async (): Promise<void> => {
    const firstBook = Date.now();
    const secondBook = firstBook + 1;

    assert.deepEqual(await getBookAbilitySplitQueue(firstBook), []);
    assert.deepEqual(await getBookAbilitySplitQueue(secondBook), []);
    assert.deepEqual(await toggleBookAbilitySplitQueueItem(firstBook, 11), { conceptIds: [11], queued: true });
    assert.deepEqual(await toggleBookAbilitySplitQueueItem(firstBook, 12), { conceptIds: [11, 12], queued: true });
    assert.deepEqual(await toggleBookAbilitySplitQueueItem(secondBook, 13), { conceptIds: [13], queued: true });
    assert.deepEqual(await getBookAbilitySplitQueue(firstBook), [11, 12]);
    assert.deepEqual(await getBookAbilitySplitQueue(secondBook), [13]);

    assert.deepEqual(await toggleBookAbilitySplitQueueItem(firstBook, 11), { conceptIds: [12], queued: false });
    assert.deepEqual(await getBookAbilitySplitQueue(firstBook), [12]);
    assert.deepEqual(await getBookAbilitySplitQueue(secondBook), [13]);
    assert.deepEqual(await removeBookAbilitySplitQueueItem(firstBook, 12), []);
    assert.deepEqual(await getBookAbilitySplitQueue(firstBook), []);
    assert.deepEqual(await getBookAbilitySplitQueue(secondBook), [13]);
    await removeBookAbilitySplitQueueItem(secondBook, 13);
  });

  it('serializes rapid queue additions and leaves other items after completion', async (): Promise<void> => {
    const bookId = Date.now() + 100;

    await Promise.all([21, 22, 23].map((id) => toggleBookAbilitySplitQueueItem(bookId, id)));
    assert.deepEqual(await getBookAbilitySplitQueue(bookId), [21, 22, 23]);
    assert.deepEqual(await removeBookAbilitySplitQueueItem(bookId, 22), [21, 23]);
    assert.deepEqual(await getBookAbilitySplitQueue(bookId), [21, 23]);
    await removeBookAbilitySplitQueueItem(bookId, 21);
    await removeBookAbilitySplitQueueItem(bookId, 23);
    assert.deepEqual(await getBookAbilitySplitQueue(bookId), []);
  });

  it('rejects malformed Concept IDs rather than persisting invalid entries', async (): Promise<void> => {
    const bookId = Date.now() + 200;

    await assert.rejects(toggleBookAbilitySplitQueueItem(bookId, Number.NaN));
    await assert.rejects(toggleBookAbilitySplitQueueItem(bookId, -1));
    assert.deepEqual(await getBookAbilitySplitQueue(bookId), []);
  });
});

describe('Parallel Ability split commits', (): void => {
  it('replaces multiple parents atomically without disturbing chapter order', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `parallel-split-${Date.now()}`, created: Date.now(), name: 'Parallel split', opfsName: 'parallel.pdf', size: 1 });

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });
      await putBookPage({ bookId, chapter: 'Chapter', chapterId, conceptsProcessed: true, pageNumber: 1 });
      const add = async (title: string) => createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', title });
      const first = await add('First');
      const second = await add('Second');
      const third = await add('Third');
      const firstA = await add('First A');
      const firstB = await add('First B');
      const secondA = await add('Second A');
      const secondB = await add('Second B');
      const ability = (title: string) => JSON.stringify({ h: title, i: '', q: [{ a: 'ok', h: 'Question', i: null, p: null }], t: 3 });
      const moduleId = (id: number) => `book-${bookId}-concept-${id}`;
      await replaceAbilities(moduleId(first.id as number), [ability('First')]);
      await replaceAbilities(moduleId(second.id as number), [ability('Second')]);
      await replaceAbilities(moduleId(firstA.id as number), [ability('First A')]);
      await replaceAbilities(moduleId(firstB.id as number), [ability('First B')]);

      // Commit in parallel; Dexie serializes the short read/write transactions
      // while both AI workers may have generated their children concurrently.
      await Promise.all([
        replaceBookConceptWithChildren(first.id as number, [firstA.id as number, firstB.id as number]),
        replaceBookConceptWithChildren(second.id as number, [secondA.id as number, secondB.id as number])
      ]);
      assert.deepEqual((await getBookConceptsForBookPage(bookId, 1))
        .sort((a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0))
        .map(({ title, displayOrder }) => [title, displayOrder]), [
        ['First A', 0], ['First B', 1], ['Second A', 2], ['Second B', 3], ['Third', 4]
      ]);
      assert.equal((await db.bookConcepts.get(first.id as number)), undefined);
      assert.equal((await db.bookConcepts.get(second.id as number)), undefined);
      assert.ok(await db.bookConcepts.get(third.id as number));
      assert.deepEqual(await getAbilities(moduleId(first.id as number)), []);
      assert.deepEqual(await getAbilities(moduleId(second.id as number)), []);
      assert.deepEqual((await getAbilities(moduleId(firstA.id as number))).map(({ displayOrder }) => displayOrder), [0]);
      assert.deepEqual((await getAbilities(moduleId(firstB.id as number))).map(({ displayOrder }) => displayOrder), [1]);
    } finally {
      await deleteBook(bookId);
    }
  });

  it('rejects an invalid split commit without removing its parent', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `failed-split-${Date.now()}`, created: Date.now(), name: 'Failed split', opfsName: 'failed.pdf', size: 1 });

    try {
      const chapterId = await putBookChapter({ bookId, title: 'Chapter' });
      const parent = await createBookConcept({ bookPage: [bookId, 0], chapterId, description: '', title: 'Parent' });
      await assert.rejects(replaceBookConceptWithChildren(parent.id as number, [Number.MAX_SAFE_INTEGER]));
      assert.ok(await db.bookConcepts.get(parent.id as number));
    } finally {
      await deleteBook(bookId);
    }
  });
});
