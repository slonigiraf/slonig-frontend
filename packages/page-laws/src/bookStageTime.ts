// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookStageSpendKey } from '@slonigiraf/db';

import { useEffect, useRef } from 'react';

export type BookStageTimes = Partial<Record<BookStageSpendKey, number>>;

const STORAGE_PREFIX = 'knowledge-upload-book-stage-time-v1:';
const memoryTimes = new Map<number, BookStageTimes>();

interface ActiveStageTimer {
  bookId: number;
  stage: BookStageSpendKey;
  startedAt: number;
}

function storageKey (bookId: number): string {
  return `${STORAGE_PREFIX}${bookId}`;
}

function validTimes (value: unknown): BookStageTimes {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const result: Record<string, number> = {};

  Object.entries(value as Record<string, unknown>).forEach(([key, stored]) => {
    if (typeof stored === 'number' && Number.isFinite(stored) && stored >= 0) {
      result[key] = stored;
    }
  });

  return result as BookStageTimes;
}

export function loadBookStageTimes (bookId: number): BookStageTimes {
  try {
    const stored = localStorage.getItem(storageKey(bookId));

    if (stored) {
      const parsed = validTimes(JSON.parse(stored));

      memoryTimes.set(bookId, parsed);
      return { ...parsed };
    }
  } catch {
    // Keep the in-memory fallback usable when localStorage is unavailable.
  }

  return { ...(memoryTimes.get(bookId) ?? {}) };
}

function storeBookStageTimes (bookId: number, times: BookStageTimes): void {
  const normalized = validTimes(times);

  memoryTimes.set(bookId, normalized);

  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(normalized));
  } catch {
    // In-memory state still supports timing while browser storage is unavailable.
  }
}

export function addBookStageTime (bookId: number, stage: BookStageSpendKey, elapsedMs: number): BookStageTimes {
  const elapsed = Number.isFinite(elapsedMs) ? Math.max(0, elapsedMs) : 0;
  const times = loadBookStageTimes(bookId);
  const updated = {
    ...times,
    [stage]: (times[stage] ?? 0) + elapsed
  };

  storeBookStageTimes(bookId, updated);

  return updated;
}

export function clearBookStageTimes (bookId: number): void {
  memoryTimes.delete(bookId);

  try {
    localStorage.removeItem(storageKey(bookId));
  } catch {
    // Ignore storage restrictions.
  }
}

function finishTimer (timer: ActiveStageTimer): void {
  addBookStageTime(timer.bookId, timer.stage, Date.now() - timer.startedAt);
}

/**
 * Accumulates wall-clock time whenever a processing stage is active. A stage
 * change closes the previous interval and starts the next one, which also makes
 * Fast Forward timing naturally split across its sequential stages.
 */
export function useBookStageTimer (bookId: number, stage?: BookStageSpendKey): void {
  const activeRef = useRef<ActiveStageTimer | undefined>(undefined);

  useEffect((): void => {
    const active = activeRef.current;

    if (active && (active.bookId !== bookId || active.stage !== stage)) {
      finishTimer(active);
      activeRef.current = undefined;
    }

    if (!activeRef.current && stage) {
      activeRef.current = { bookId, stage, startedAt: Date.now() };
    }
  }, [bookId, stage]);

  useEffect(() => (): void => {
    if (activeRef.current) {
      finishTimer(activeRef.current);
      activeRef.current = undefined;
    }
  }, []);
}

export function formatBookStageTime (elapsedMs: number): string {
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0) {
    return '0s';
  }

  if (elapsedMs < 1_000) {
    return '<1s';
  }

  const totalSeconds = Math.round(elapsedMs / 1_000);
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  if (hours) {
    return `${hours}h ${minutes}m ${seconds}s`;
  }

  if (minutes) {
    return `${minutes}m ${seconds}s`;
  }

  return `${seconds}s`;
}
