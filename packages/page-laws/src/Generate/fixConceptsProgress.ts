// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ConceptChapterNavigationItem } from './conceptRecognition.js';

export type FixConceptsChapterStatus = 'failed' | 'fixed';
export type FixConceptsChapterStatuses = Record<string, FixConceptsChapterStatus>;

const STORAGE_PREFIX = 'knowledge-fix-concepts-progress:';
const memoryStatuses = new Map<number, FixConceptsChapterStatuses>();

export function fixConceptsChapterKey ({ chapterId, pageNumbers, title }: ConceptChapterNavigationItem): string {
  return `${chapterId ?? 'chapter'}:${title.trim()}:${pageNumbers.join(',')}`;
}

function storageKey (bookId: number): string {
  return `${STORAGE_PREFIX}${bookId}`;
}

function validStatuses (value: unknown): FixConceptsChapterStatuses {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value as Record<string, unknown>)
    .filter((entry): entry is [string, FixConceptsChapterStatus] => entry[1] === 'fixed' || entry[1] === 'failed'));
}

export function loadFixConceptsChapterStatuses (bookId: number): FixConceptsChapterStatuses {
  try {
    const stored = localStorage.getItem(storageKey(bookId));

    if (stored) {
      const parsed = validStatuses(JSON.parse(stored));

      memoryStatuses.set(bookId, parsed);
      return { ...parsed };
    }
  } catch {
    // Keep the in-memory fallback usable when localStorage is unavailable.
  }

  return { ...(memoryStatuses.get(bookId) ?? {}) };
}

export function storeFixConceptsChapterStatuses (bookId: number, statuses: FixConceptsChapterStatuses): void {
  const normalized = validStatuses(statuses);

  memoryStatuses.set(bookId, normalized);

  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(normalized));
  } catch {
    // In-memory state still supports retrying within the current app session.
  }
}

export function clearFixConceptsChapterStatuses (bookId: number): FixConceptsChapterStatuses {
  const cleared: FixConceptsChapterStatuses = {};

  memoryStatuses.set(bookId, cleared);

  try {
    localStorage.removeItem(storageKey(bookId));
  } catch {
    // Ignore storage restrictions.
  }

  return cleared;
}

export function setFixConceptsChapterStatus (bookId: number, chapter: ConceptChapterNavigationItem, status: FixConceptsChapterStatus): FixConceptsChapterStatuses {
  const statuses = loadFixConceptsChapterStatuses(bookId);

  statuses[fixConceptsChapterKey(chapter)] = status;
  storeFixConceptsChapterStatuses(bookId, statuses);

  return statuses;
}

export function failedFixConceptChapterKeys (bookId: number, chapters: ConceptChapterNavigationItem[]): Set<string> {
  const statuses = loadFixConceptsChapterStatuses(bookId);

  return new Set(chapters
    .map(fixConceptsChapterKey)
    .filter((key) => statuses[key] === 'failed'));
}
