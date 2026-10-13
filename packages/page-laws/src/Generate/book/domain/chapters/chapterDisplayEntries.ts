// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookChapter, BookPage } from '@slonigiraf/db';

import { conceptChaptersFromPages, type ConceptChapterNavigationItem } from '../concepts/conceptRecognition.js';

/** A page-assigned chapter can outlive its bookChapters row. Keep it visible
 * without creating a different chapter id or invalidating stored Standards. */
export interface ChapterDisplayEntry {
  chapter: BookChapter;
  identity: ConceptChapterNavigationItem;
  persisted: boolean;
}

export function chapterDisplayEntries (bookId: number, storedChapters: BookChapter[], pages: BookPage[]): ChapterDisplayEntry[] {
  const assigned = conceptChaptersFromPages(pages);

  if (!assigned.length) {
    return storedChapters.map((chapter) => ({
      chapter,
      identity: { chapterId: chapter.id, pageNumbers: [], title: chapter.title },
      persisted: true
    }));
  }

  const byId = new Map(storedChapters.flatMap((chapter) => chapter.id === undefined ? [] : [[chapter.id, chapter] as const]));
  const byTitle = new Map<string, BookChapter[]>();

  storedChapters.forEach((chapter) => {
    const title = chapter.title.trim();

    byTitle.set(title, [...(byTitle.get(title) ?? []), chapter]);
  });

  return assigned.map((identity) => {
    const titleMatches = byTitle.get(identity.title.trim()) ?? [];
    // A title-only fallback is safe only for a unique matching chapter. An
    // explicit but missing id must NOT silently bind to another chapter.
    const persistedChapter = identity.chapterId === undefined
      ? (titleMatches.length === 1 ? titleMatches[0] : undefined)
      : byId.get(identity.chapterId);

    return {
      chapter: persistedChapter ?? { bookId, source: 'legacy', title: identity.title },
      identity,
      persisted: Boolean(persistedChapter)
    };
  });
}
