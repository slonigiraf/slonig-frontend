// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookStageSpendKey } from '@slonigiraf/db';

export const BOOK_EXTERNAL_CALL_PROVIDERS = ['pdfv3', 'mmd', 'openrouter'] as const;

export type BookExternalCallProvider = typeof BOOK_EXTERNAL_CALL_PROVIDERS[number];
export type BookStageExternalCallCounts = Partial<Record<BookExternalCallProvider, number>>;
export type BookExternalCalls = Partial<Record<BookStageSpendKey, BookStageExternalCallCounts>>;

const STORAGE_PREFIX = 'knowledge-upload-book-external-calls-v1:';
const memoryCalls = new Map<number, BookExternalCalls>();

function storageKey (bookId: number): string {
  return `${STORAGE_PREFIX}${bookId}`;
}

function validCounts (value: unknown): BookStageExternalCallCounts {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const source = value as Record<string, unknown>;
  const result: BookStageExternalCallCounts = {};

  BOOK_EXTERNAL_CALL_PROVIDERS.forEach((provider) => {
    const stored = source[provider];

    if (typeof stored === 'number' && Number.isSafeInteger(stored) && stored >= 0) {
      result[provider] = stored;
    }
  });

  return result;
}

function validCalls (value: unknown): BookExternalCalls {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([stage, counts]) => [stage, validCounts(counts)])
  ) as BookExternalCalls;
}

export function loadBookExternalCalls (bookId: number): BookExternalCalls {
  try {
    const stored = localStorage.getItem(storageKey(bookId));

    if (stored) {
      const parsed = validCalls(JSON.parse(stored));

      memoryCalls.set(bookId, parsed);
      return { ...parsed };
    }
  } catch {
    // Keep the in-memory fallback usable when localStorage is unavailable.
  }

  return { ...(memoryCalls.get(bookId) ?? {}) };
}

function storeBookExternalCalls (bookId: number, calls: BookExternalCalls): void {
  const normalized = validCalls(calls);

  memoryCalls.set(bookId, normalized);

  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(normalized));
  } catch {
    // In-memory state still supports statistics while browser storage is unavailable.
  }
}

export function addBookExternalCall (bookId: number, stage: BookStageSpendKey, provider: BookExternalCallProvider): BookExternalCalls {
  const calls = loadBookExternalCalls(bookId);
  const stageCounts = calls[stage] ?? {};
  const updated = {
    ...calls,
    [stage]: {
      ...stageCounts,
      [provider]: (stageCounts[provider] ?? 0) + 1
    }
  };

  storeBookExternalCalls(bookId, updated);

  return updated;
}

export function clearBookExternalCalls (bookId: number): void {
  memoryCalls.delete(bookId);

  try {
    localStorage.removeItem(storageKey(bookId));
  } catch {
    // Ignore storage restrictions.
  }
}

export function bookExternalCallTotal (counts: BookStageExternalCallCounts | undefined): number {
  return BOOK_EXTERNAL_CALL_PROVIDERS.reduce((total, provider) => total + (counts?.[provider] ?? 0), 0);
}

export function sumBookExternalCalls (calls: BookExternalCalls, stages: BookStageSpendKey[]): BookStageExternalCallCounts {
  return stages.reduce<BookStageExternalCallCounts>((totals, stage) => {
    const counts = calls[stage];

    BOOK_EXTERNAL_CALL_PROVIDERS.forEach((provider) => {
      totals[provider] = (totals[provider] ?? 0) + (counts?.[provider] ?? 0);
    });

    return totals;
  }, {});
}
