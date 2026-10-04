// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface NameSuggestions {
  bookName: string;
  chapters: Array<{ id: number; title: string }>;
}

export function parseNameSuggestions (content: string, chapterIds: number[]): NameSuggestions {
  const parsed: unknown = JSON.parse(content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, ''));

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('OpenRouter returned invalid names.');
  }

  const result = parsed as Partial<NameSuggestions>;

  if (typeof result.bookName !== 'string' || !result.bookName.trim() || !Array.isArray(result.chapters)) {
    throw new Error('OpenRouter returned invalid names.');
  }

  const chapters = result.chapters.filter((chapter): chapter is { id: number; title: string } =>
    !!chapter && Number.isSafeInteger(chapter.id) && typeof chapter.title === 'string' && !!chapter.title.trim()
  );

  if (chapters.length !== chapterIds.length || new Set(chapters.map(({ id }) => id)).size !== chapterIds.length || chapterIds.some((id) => !chapters.some((chapter) => chapter.id === id))) {
    throw new Error('OpenRouter did not return one name for every editable chapter.');
  }

  return {
    bookName: result.bookName.trim(),
    chapters: chapters.map(({ id, title }) => ({ id, title: title.trim() }))
  };
}
