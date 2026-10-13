// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chapterDisplayEntries } from './chapterDisplayEntries.js';

describe('chapter display entries', (): void => {
  const page = (pageNumber: number, title: string, chapterId?: number, excludedFromAnalysis = false) => ({
    bookId: 3,
    chapter: title,
    chapterId,
    conceptsProcessed: true,
    excludedFromAnalysis,
    pageNumber
  });

  it('surfaces page-assigned chapters when saved chapter records are missing without changing their identifiers', (): void => {
    const pages = Array.from({ length: 34 }, (_, index) => page(index + 1, `Chapter ${index + 1}`, index + 101));
    const entries = chapterDisplayEntries(3, [], pages);

    assert.equal(entries.length, 34);
    assert.equal(entries.filter(({ persisted }) => !persisted).length, 34);
    assert.deepEqual(entries[0], {
      chapter: { bookId: 3, source: 'legacy', title: 'Chapter 1' },
      identity: { chapterId: 101, pageNumbers: [1], title: 'Chapter 1' },
      persisted: false
    });
  });

  it('uses the persisted chapter when the page assignment has the same id', (): void => {
    const entry = chapterDisplayEntries(3, [{ bookId: 3, id: 11, title: 'Fractions' }], [page(1, 'Fractions', 11)])[0];

    assert.equal(entry.persisted, true);
    assert.equal(entry.chapter.id, 11);
  });

  it('does not attach stale chapter ids to a different stored chapter with the same title', (): void => {
    const entry = chapterDisplayEntries(3, [{ bookId: 3, id: 20, title: 'Fractions' }], [page(1, 'Fractions', 99)])[0];

    assert.equal(entry.persisted, false);
    assert.equal(entry.chapter.id, undefined);
    assert.equal(entry.identity.chapterId, 99);
  });

  it('keeps separate chapters with repeated names and ignores excluded pages', (): void => {
    const entries = chapterDisplayEntries(3, [], [page(1, 'Practice', 2), page(2, 'Practice', 3), page(3, 'Index', undefined, true)]);

    assert.equal(entries.length, 2);
    assert.deepEqual(entries.map(({ identity }) => identity.chapterId), [2, 3]);
  });

  it('preserves manual chapters when no pages have chapter assignments', (): void => {
    const stored = [{ bookId: 3, id: 10, title: 'Manual chapter' }];
    const entries = chapterDisplayEntries(3, stored, [page(1, '')]);

    assert.equal(entries.length, 1);
    assert.equal(entries[0].persisted, true);
    assert.equal(entries[0].chapter.id, 10);
  });
});
