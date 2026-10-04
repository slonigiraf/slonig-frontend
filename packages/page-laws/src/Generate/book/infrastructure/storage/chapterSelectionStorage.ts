// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SharedChapterSelection } from '../../domain/chapters/chapterSelection.js';

interface ChapterSelectionEventDetail {
  bookId: number;
  selection: SharedChapterSelection;
}

const CHAPTER_SELECTION_EVENT = 'knowledge-upload-chapter-selection';
const chapterSelectionStorageKey = (bookId: number): string => `knowledge-upload-book-${bookId}-selected-chapter`;

function normalizeTitle (title?: string): string {
  return title?.trim() ?? '';
}

function parseChapterSelection (value: string | null): SharedChapterSelection | undefined {
  if (!value) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(value) as Partial<SharedChapterSelection>;
    const index = Number(parsed.index);
    const chapterId = Number(parsed.chapterId);
    const title = typeof parsed.title === 'string' ? normalizeTitle(parsed.title) : '';

    if (!Number.isSafeInteger(index) || index < 0) {
      return undefined;
    }

    return {
      ...(Number.isSafeInteger(chapterId) && chapterId > 0 ? { chapterId } : {}),
      index,
      ...(title ? { title } : {})
    };
  } catch {
    return undefined;
  }
}

export function getSharedChapterSelection (bookId: number): SharedChapterSelection | undefined {
  try {
    return parseChapterSelection(localStorage.getItem(chapterSelectionStorageKey(bookId)));
  } catch {
    return undefined;
  }
}

export function storeSharedChapterSelection (bookId: number, selection: SharedChapterSelection): void {
  const normalized: SharedChapterSelection = {
    ...(selection.chapterId !== undefined ? { chapterId: selection.chapterId } : {}),
    index: Math.max(0, selection.index),
    ...(normalizeTitle(selection.title) ? { title: normalizeTitle(selection.title) } : {})
  };

  try {
    localStorage.setItem(chapterSelectionStorageKey(bookId), JSON.stringify(normalized));
  } catch {
    // Keep in-document synchronization working when persistent storage is unavailable.
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent<ChapterSelectionEventDetail>(CHAPTER_SELECTION_EVENT, {
      detail: { bookId, selection: normalized }
    }));
  }
}

export function subscribeSharedChapterSelection (bookId: number, onChange: (selection: SharedChapterSelection) => void): () => void {
  if (typeof window === 'undefined') {
    return () => undefined;
  }

  const onSelection = (event: Event): void => {
    const detail = (event as CustomEvent<ChapterSelectionEventDetail>).detail;

    if (detail?.bookId === bookId) {
      onChange(detail.selection);
    }
  };
  const onStorage = (event: StorageEvent): void => {
    if (event.key !== chapterSelectionStorageKey(bookId)) {
      return;
    }

    const selection = parseChapterSelection(event.newValue);

    if (selection) {
      onChange(selection);
    }
  };

  window.addEventListener(CHAPTER_SELECTION_EVENT, onSelection);
  window.addEventListener('storage', onStorage);

  return () => {
    window.removeEventListener(CHAPTER_SELECTION_EVENT, onSelection);
    window.removeEventListener('storage', onStorage);
  };
}
