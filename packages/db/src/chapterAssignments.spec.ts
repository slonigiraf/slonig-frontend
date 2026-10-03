// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { createBook, deleteBook, getBookChapters, getBookPages, putBookPage, replaceBookChapterAssignments } from './index.js';

describe('book chapter assignments', (): void => {
  it('excludes front matter before the first detected chapter instead of creating a chapter for it', async (): Promise<void> => {
    const bookId = await createBook({ contentHash: `chapter-assignments-${Date.now()}`, created: Date.now(), name: 'Chapter assignment test', opfsName: 'chapter-assignment.pdf', size: 1 });

    try {
      for (let pageNumber = 1; pageNumber <= 4; pageNumber++) {
        await putBookPage({ bookId, chapter: '', pageNumber });
      }

      await replaceBookChapterAssignments(bookId, [{ confidence: 0.95, startPage: 3, title: 'Chapter One' }]);

      const pages = await getBookPages(bookId);
      const chapters = await getBookChapters(bookId);

      assert.equal(chapters.length, 1);
      assert.equal(chapters[0].title, 'Chapter One');
      assert.deepEqual(pages.map(({ chapter, chapterId, excludedFromAnalysis, pageNumber }) => ({ chapter, chapterId, excludedFromAnalysis: Boolean(excludedFromAnalysis), pageNumber })), [
        { chapter: '', chapterId: undefined, excludedFromAnalysis: true, pageNumber: 1 },
        { chapter: '', chapterId: undefined, excludedFromAnalysis: true, pageNumber: 2 },
        { chapter: 'Chapter One', chapterId: chapters[0].id, excludedFromAnalysis: false, pageNumber: 3 },
        { chapter: 'Chapter One', chapterId: chapters[0].id, excludedFromAnalysis: false, pageNumber: 4 }
      ]);
    } finally {
      await deleteBook(bookId);
    }
  });
});
