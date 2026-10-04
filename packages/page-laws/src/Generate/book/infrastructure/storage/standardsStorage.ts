// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { canonicalStandardCode, STANDARD_FRAMEWORKS, type CurriculumStandard, type StoredBookStandards, type StoredChapterStandards } from '../../domain/standards/standards.js';

const storageKey = (bookId: number): string => `knowledge-upload-book-${bookId}-standards-v4`;

export function loadStoredBookStandards (bookId: number): StoredBookStandards {
  try {
    const raw = localStorage.getItem(storageKey(bookId));

    if (!raw) {
      return {};
    }

    const parsed = JSON.parse(raw) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }

    const result: StoredBookStandards = {};

    Object.entries(parsed as Record<string, unknown>).forEach(([chapterKey, value]) => {
      if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return;
      }

      const entry = value as Partial<StoredChapterStandards>;

      if (typeof entry.conceptFingerprint !== 'string' || !Array.isArray(entry.standards)) {
        return;
      }

      result[chapterKey] = {
        conceptFingerprint: entry.conceptFingerprint,
        standards: entry.standards.flatMap((standard) => {
          if (!standard || typeof standard !== 'object') {
            return [];
          }

          const candidate = standard as CurriculumStandard;

          if (!STANDARD_FRAMEWORKS.some(({ key }) => key === candidate.framework) || typeof candidate.code !== 'string') {
            return [];
          }

          const code = canonicalStandardCode(candidate.framework, candidate.code);
          const distance = typeof candidate.distance === 'number' && Number.isFinite(candidate.distance)
            ? candidate.distance
            : undefined;

          return code ? [{ code, ...(distance === undefined ? {} : { distance }), framework: candidate.framework }] : [];
        })
      };
    });

    return result;
  } catch {
    return {};
  }
}

export function storeBookStandards (bookId: number, standards: StoredBookStandards): void {
  try {
    localStorage.setItem(storageKey(bookId), JSON.stringify(standards));
  } catch {
    // Standards remain usable for the current session when browser storage is unavailable.
  }
}
