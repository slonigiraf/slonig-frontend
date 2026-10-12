// Copyright 2026 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createBook, createBookConcept, deleteBook, putBookPage } from '@slonigiraf/db';
import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { getBookConceptInventory } from './bookReaderWorkspace.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('Book Concept inventory', (): void => {
  it('counts both PDF page Concepts and unassigned page-0 Concepts exactly once', async (): Promise<void> => {
    const bookId = await createBook({
      contentHash: `inventory-${Date.now()}-${Math.random()}`,
      created: Date.now(),
      name: 'Concept inventory',
      opfsName: 'inventory.pdf',
      size: 1
    });

    try {
      await putBookPage({ bookId, chapter: '', conceptsProcessed: true, pageNumber: 1 });
      const pageConcept = await createBookConcept({ bookPage: [bookId, 1], description: 'On page 1', title: 'Page Concept' });
      const manualConcept = await createBookConcept({ bookPage: [bookId, 0], description: 'No page assigned', title: 'Manual Concept' });

      const normalInventory = await getBookConceptInventory(bookId, [1]);
      const inventoryWithZero = await getBookConceptInventory(bookId, [0, 1, 1]);

      assert.deepEqual(new Set(normalInventory.map(({ id }) => id)), new Set([pageConcept.id, manualConcept.id]));
      assert.equal(normalInventory.length, 2);
      assert.equal(inventoryWithZero.length, 2, 'page 0 must not be counted twice');
    } finally {
      await deleteBook(bookId);
    }
  });
});
