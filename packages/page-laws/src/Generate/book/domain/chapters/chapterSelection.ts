// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface SharedChapterSelection {
  chapterId?: number | undefined;
  index: number;
  title?: string | undefined;
}

interface ChapterLike {
  id?: number;
  title: string;
}

function normalizeTitle (title?: string): string {
  return title?.trim() ?? '';
}

export function resolveSharedChapterIndex (selection: SharedChapterSelection, chapters: ChapterLike[]): number {
  if (!chapters.length) {
    return 0;
  }

  if (selection.chapterId !== undefined) {
    const idIndex = chapters.findIndex(({ id }) => id === selection.chapterId);

    if (idIndex >= 0) {
      return idIndex;
    }
  }

  const title = normalizeTitle(selection.title);

  if (title) {
    const titleIndex = chapters.findIndex((chapter) => normalizeTitle(chapter.title) === title);

    if (titleIndex >= 0) {
      return titleIndex;
    }
  }

  return Math.max(0, Math.min(selection.index, chapters.length - 1));
}
