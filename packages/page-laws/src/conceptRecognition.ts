// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface GeneratedChapterConcept {
  description: string;
  pageNumber: number;
  title: string;
}

export interface GeneratedChapterConcepts {
  concepts: GeneratedChapterConcept[];
}

export interface ChapterPageIdentity {
  chapter: string;
  excludedFromAnalysis?: boolean;
  chapterId?: number;
  pageNumber: number;
}

export interface ConceptChapterNavigationItem {
  chapterId?: number;
  pageNumbers: number[];
  title: string;
}

function normalizeConceptTitle (title: string): string {
  return title.toLocaleLowerCase().replace(/\s+/g, ' ').trim();
}

export function parseGeneratedChapterConcepts (content: string, allowedPageNumbers: Set<number>): GeneratedChapterConcepts {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed: Partial<GeneratedChapterConcepts>;

  try {
    parsed = JSON.parse(json) as Partial<GeneratedChapterConcepts>;
  } catch {
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as Partial<GeneratedChapterConcepts>;
  }

  if (!Array.isArray(parsed.concepts) || parsed.concepts.some(({ description, pageNumber, title }) => typeof title !== 'string' || typeof description !== 'string' || !Number.isSafeInteger(pageNumber) || !allowedPageNumbers.has(pageNumber))) {
    throw new Error('OpenRouter returned invalid chapter concept data.');
  }

  const seenTitles = new Set<string>();
  const concepts = parsed.concepts
    .map(({ description, pageNumber, title }) => ({ description: description.trim(), pageNumber, title: title.trim() }))
    .filter(({ title }) => title)
    .sort((a, b) => a.pageNumber - b.pageNumber)
    .filter(({ title }) => {
      const key = normalizeConceptTitle(title);

      if (!key || seenTitles.has(key)) {
        return false;
      }

      seenTitles.add(key);

      return true;
    });

  return { concepts };
}

export function conceptChaptersFromPages (bookPages: ChapterPageIdentity[]): ConceptChapterNavigationItem[] {
  const grouped = new Map<string, ConceptChapterNavigationItem>();
  const titleToChapterId = new Map<string, number>();

  bookPages.filter(({ excludedFromAnalysis }) => !excludedFromAnalysis).forEach(({ chapter, chapterId }) => {
    const title = chapter.trim();

    if (chapterId !== undefined && title) {
      titleToChapterId.set(title, chapterId);
    }
  });

  [...bookPages].filter(({ excludedFromAnalysis }) => !excludedFromAnalysis).sort((a, b) => a.pageNumber - b.pageNumber).forEach(({ chapter, chapterId, pageNumber }) => {
    const title = chapter.trim();
    const resolvedChapterId = chapterId ?? titleToChapterId.get(title);

    if (resolvedChapterId === undefined && !title) {
      return;
    }

    const key = resolvedChapterId === undefined ? `title:${title}` : `id:${resolvedChapterId}`;
    const current = grouped.get(key);

    if (current) {
      current.pageNumbers.push(pageNumber);
      if (!current.title && title) {
        current.title = title;
      }
    } else {
      grouped.set(key, { chapterId: resolvedChapterId, pageNumbers: [pageNumber], title });
    }
  });

  return Array.from(grouped.values());
}
