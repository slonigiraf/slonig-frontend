// Copyright 2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { createBook, createBookConcept, deleteBook, putBookChapter, putBookPage, replaceAbilities, wouldResetBookGeneratedData } from './index.js';
import { db } from './db/index.js';
import type { Image } from './db/Image.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('Book processing data-loss acknowledgement', (): void => {
  it('checks persisted data even when the processing stage has no success checkpoint', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `stage-warning-${Date.now()}`, created: Date.now(), name: 'Partial output', opfsName: 'partial.pdf', size: 1 });

    try {
      assert.equal(await wouldResetBookGeneratedData(bookId, 'abilities'), false);
      const chapterId = await putBookChapter({ bookId, title: 'First chapter' });
      await putBookPage({ bookId, chapter: 'First chapter', chapterId, pageNumber: 1, conceptsProcessed: true });
      const concept = await createBookConcept({ bookPage: [bookId, 1], chapterId, description: '', title: 'Concept' });

      assert.equal(await wouldResetBookGeneratedData(bookId, 'chapters'), true);
      assert.equal(await wouldResetBookGeneratedData(bookId, 'concepts'), true);
      assert.equal(await wouldResetBookGeneratedData(bookId, 'abilities'), false);
      assert.equal(await wouldResetBookGeneratedData(bookId, 'concepts', { onlyMissing: true }), false,
        'missing-only concept processing preserves existing concepts when no downstream data exists');

      const moduleId = `book-${bookId}-concept-${concept.id}`;
      await replaceAbilities(moduleId, [JSON.stringify({ h: 'Concept', t: 3, q: [{ h: 'First?', a: '1', p: null, i: null }] })]);

      assert.equal(await wouldResetBookGeneratedData(bookId, 'abilities'), true);
      assert.equal(await wouldResetBookGeneratedData(bookId, 'abilities', { onlyMissing: true }), false,
        'missing-only Ability generation does not delete the existing Ability');
      assert.equal(await wouldResetBookGeneratedData(bookId, 'fixConcepts', { onlyMissing: true }), true,
        'approved concept changes may invalidate existing dependent Abilities');
    } finally {
      await deleteBook(bookId);
    }
  });

  it('requires acknowledgement for overwriting generated images, not ungenerated prompts', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `image-warning-${Date.now()}`, created: Date.now(), name: 'Image output', opfsName: 'images.pdf', size: 1 });

    try {
      const chapterId = await putBookChapter({ bookId, title: 'First chapter' });
      const concept = await createBookConcept({ bookPage: [bookId, 0], chapterId, title: 'Concept', description: '' });
      const imageId = await db.images.add({ type: 'prompt', data: null, prompt: 'Draw a triangle', valid: undefined } as Image);
      await replaceAbilities(`book-${bookId}-concept-${concept.id}`, [JSON.stringify({ h: 'Concept', t: 3, q: [{ h: 'Draw it', a: 'A triangle', p: imageId, i: null }] })]);

      assert.equal(await wouldResetBookGeneratedData(bookId, 'images'), false);
      await db.images.update(imageId, { type: 'tikz', data: '\\begin{tikzpicture}\\end{tikzpicture}' });
      assert.equal(await wouldResetBookGeneratedData(bookId, 'images'), true);
      assert.equal(await wouldResetBookGeneratedData(bookId, 'images', { onlyMissing: true }), false);
      assert.equal(await wouldResetBookGeneratedData(bookId, 'fixImages'), false);
      await db.images.update(imageId, { visualQaStatus: 'passed' });
      assert.equal(await wouldResetBookGeneratedData(bookId, 'fixImages'), false,
        'QA-only review is harmless when no generated answer depends on the question');
    } finally {
      await deleteBook(bookId);
    }
  });
});
