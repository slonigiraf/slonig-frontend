// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface ChapterItems<T> {
  chapterTitle: string;
  items: T[];
}

export interface ChapterBatch<T> extends ChapterItems<T> {}

/**
 * Split work into size-limited batches without ever mixing items from different chapters.
 * Empty chapters are ignored and chapter/item ordering is preserved.
 */
export function batchItemsByChapter<T> (chapters: Array<ChapterItems<T>>, batchSize: number): Array<ChapterBatch<T>> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1) {
    throw new Error('Chapter batch size must be a positive integer.');
  }

  return chapters.flatMap(({ chapterTitle, items }) => {
    const batches: Array<ChapterBatch<T>> = [];

    for (let start = 0; start < items.length; start += batchSize) {
      batches.push({ chapterTitle, items: items.slice(start, start + batchSize) });
    }

    return batches;
  });
}
