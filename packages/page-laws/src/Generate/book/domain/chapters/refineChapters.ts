// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookProcessingStageKey, BookStageSpendKey, BookSubject } from '@slonigiraf/db';

import { formatChapterTitle } from './chapterTitles.js';

export const REFINE_CHAPTERS_STAGE: BookProcessingStageKey = 'refineChapters';
export const REFINE_CHAPTERS_SPEND_STAGE: BookStageSpendKey = 'refineChapters';
export const MIN_REFINED_CHAPTER_CONCEPTS = 8;
export const MAX_REFINED_CHAPTER_CONCEPTS = 12;
export const MAX_REFINED_CHAPTERS_PER_SOURCE = 3;

export interface RefinedChapterGroup {
  conceptIndexes: number[];
  title: string;
}

export interface RefinedChapterGroups {
  chapters: RefinedChapterGroup[];
}

export interface RefinedConceptPersistenceExpectation {
  chapterId: number;
  conceptId: number;
  displayOrder: number;
}

export function hasPersistedRefinedConceptMembership (
  expected: RefinedConceptPersistenceExpectation[],
  persisted: BookConcept[]
): boolean {
  const persistedById = new Map(persisted.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]));

  return expected.every(({ chapterId, conceptId, displayOrder }) => {
    const concept = persistedById.get(conceptId);

    return concept?.chapterId === chapterId && concept.displayOrder === displayOrder;
  });
}

export function isRefineChaptersComplete (book: Pick<Book, 'completedStages'>): boolean {
  return (book.completedStages as readonly string[] | undefined)?.includes('refineChapters') ?? false;
}

export function withRefineChaptersComplete (book: Book): Book {
  const completedStages = (book.completedStages ?? []).filter((stage) => String(stage) !== 'refineChapters');

  return { ...book, completedStages: [...completedStages, REFINE_CHAPTERS_STAGE] };
}

export function withRefineChaptersIncomplete (book: Book): Book {
  return {
    ...book,
    completedStages: (book.completedStages ?? []).filter((stage) => String(stage) !== 'refineChapters')
  };
}

export function sortConceptsByDisplayOrder (concepts: BookConcept[]): BookConcept[] {
  return concepts
    .map((concept, index) => ({ concept, index, order: Number.isFinite(concept.displayOrder) ? concept.displayOrder as number : index }))
    .sort((a, b) => a.order - b.order || a.index - b.index)
    .map(({ concept }) => concept);
}

export function conceptBelongsToChapter (
  concept: Pick<BookConcept, 'bookPage' | 'chapterId'>,
  chapter: { chapterId?: number; pageNumbers: number[] }
): boolean {
  if (concept.chapterId !== undefined && chapter.chapterId !== undefined) {
    return concept.chapterId === chapter.chapterId;
  }

  return chapter.pageNumbers.includes(concept.bookPage[1]);
}

export function conceptsForRefinementChapter (
  concepts: BookConcept[],
  sourceChapter: { chapterId?: number; pageNumbers: number[] }
): BookConcept[] {
  // Isolation is intentional: select one pre-refinement chapter first, then
  // order only concepts inside that chapter. Concepts from different source
  // chapters must never participate in the same ordering/clustering pass.
  return sortConceptsByDisplayOrder(concepts.filter((concept) => conceptBelongsToChapter(concept, sourceChapter)));
}

export function refineChapterPrompt (
  chapterTitle: string,
  concepts: Array<Pick<BookConcept, 'bookPage' | 'description' | 'title'>>,
  pageCount: number,
  bookSubject: BookSubject | undefined,
  bookLanguage: string | undefined,
  learnerAge: number | undefined
): string {
  return `Refine one already-sorted ORIGINAL learning chapter into one, two, or three thematic chapters without changing the concept order.

This request contains concepts from exactly one original chapter. Cluster ONLY these concepts. Never combine, compare, interleave, or reorder concepts with concepts from another chapter.

The learner is age ${Number.isSafeInteger(learnerAge) ? learnerAge : 'unknown'}. The book language is ${bookLanguage || 'unknown'} and the book topic/subject is ${bookSubject || 'unknown'}. Current chapter: ${chapterTitle || '(untitled)'}. It currently spans ${pageCount} source page${pageCount === 1 ? '' : 's'}.

The concepts below are ALREADY in their intended pedagogical/ZPD order. Your only job is to decide whether contiguous runs of that sequence form clearer chapter-sized themes.

Rules, in priority order:
1. NEVER reorder concepts. Every output chapter must contain a contiguous slice of the input sequence, and the output chapters must cover the sequence from first concept to last concept in exactly the same order.
2. Split only when the current chapter contains meaningfully distinct themes that become clearer as separate learning chapters. Do not create a weak or artificial thematic split merely to hit a target count.
3. When splitting is useful, aim for about ${MIN_REFINED_CHAPTER_CONCEPTS}-${MAX_REFINED_CHAPTER_CONCEPTS} concepts per output chapter. Among similarly coherent thematic boundaries, strongly prefer the grouping whose chapter sizes are as even as practical. Avoid results where one chapter is much smaller or larger than the others when a nearby natural boundary would make the sizes more similar.
4. Choose 2 or 3 output chapters according to the total concept count and available natural boundaries, favoring a chapter count that keeps most groups in the ${MIN_REFINED_CHAPTER_CONCEPTS}-${MAX_REFINED_CHAPTER_CONCEPTS} range. For example, 18 concepts should usually become two similarly sized chapters rather than one very small and one very large chapter; 24 concepts may become two chapters of about 12 or three chapters of about 8 depending on the stronger thematic boundaries.
5. Prefer a single unsplit chapter when there are too few concepts for useful clustering, when the material is one coherent theme, or when every possible split would create weak fragments.
6. Each output title must name the specific theme covered by its concepts. Follow the book language's native capitalization rules (for English use sentence case: "This is an example of a title"; preserve proper nouns and acronyms), keep titles concise and distinct, and NEVER start a chapter title with chapter numbers, Roman numerals, or a "Chapter 2" prefix.
7. Do not add, remove, merge, split, rename, or rewrite concepts themselves.
8. Because the application persists real chapters using source-page anchors, do not propose more output chapters than the available source pages. The maximum here is ${Math.max(1, Math.min(MAX_REFINED_CHAPTERS_PER_SOURCE, pageCount))}.

Existing sorted concepts (conceptIndex is zero-based; sourcePage is informational only and MUST NOT be used to reorder the sequence):
${JSON.stringify(concepts.map(({ bookPage, description, title }, conceptIndex) => ({ conceptIndex, sourcePage: bookPage[1] || null, title, description })))}

Return only valid JSON in this exact shape:
{"chapters":[{"title":"Theme A","conceptIndexes":[0,1,2]},{"title":"Theme B","conceptIndexes":[3,4,5]}]}

If no split is useful, return exactly one chapter containing every conceptIndex in the original order. Return {"chapters":[]} when there are no concepts.`;
}

export function parseRefinedChapterGroups (content: string, conceptCount: number, pageCount = Number.MAX_SAFE_INTEGER, language = 'en'): RefinedChapterGroups {
  if (!Number.isSafeInteger(conceptCount) || conceptCount < 0 || !Number.isSafeInteger(pageCount) || pageCount < 0) {
    throw new Error('Invalid chapter size for Refine Chapters.');
  }

  const json = content.replace(/^```json\s*|\s*```$/gi, '').trim();
  let parsed: Partial<RefinedChapterGroups>;

  try {
    parsed = JSON.parse(json) as Partial<RefinedChapterGroups>;
  } catch {
    throw new Error('OpenRouter returned invalid Refine Chapters data.');
  }

  if (!Array.isArray(parsed.chapters)) {
    throw new Error('OpenRouter returned invalid Refine Chapters data.');
  }

  if (conceptCount === 0) {
    if (parsed.chapters.length !== 0) {
      throw new Error('OpenRouter returned invalid Refine Chapters data.');
    }

    return { chapters: [] };
  }

  const maxChapterCount = Math.max(1, Math.min(MAX_REFINED_CHAPTERS_PER_SOURCE, pageCount || 1));

  if (!parsed.chapters.length || parsed.chapters.length > maxChapterCount) {
    throw new Error('OpenRouter returned invalid Refine Chapters data.');
  }

  const chapters = parsed.chapters.map((candidate): RefinedChapterGroup => {
    const chapter = candidate as Partial<RefinedChapterGroup>;
    const title = typeof chapter.title === 'string' ? chapter.title.trim() : '';

    if (!title || !Array.isArray(chapter.conceptIndexes) || !chapter.conceptIndexes.length) {
      throw new Error('OpenRouter returned invalid Refine Chapters data.');
    }

    if (chapter.conceptIndexes.some((value) => typeof value !== 'number' || !Number.isSafeInteger(value))) {
      throw new Error('OpenRouter returned invalid Refine Chapters data.');
    }

    return { conceptIndexes: chapter.conceptIndexes, title: formatChapterTitle(title, language) };
  });
  const flattened = chapters.flatMap(({ conceptIndexes }) => conceptIndexes);
  const expected = Array.from({ length: conceptCount }, (_, index) => index);

  if (flattened.length !== conceptCount || flattened.some((value, index) => value !== expected[index])) {
    throw new Error('OpenRouter returned invalid Refine Chapters data.');
  }

  return { chapters };
}

export function refinedChapterSplitPages (pageNumbers: number[], groupSizes: number[]): number[] | undefined {
  if (groupSizes.length <= 1) {
    return [];
  }

  const pages = [...pageNumbers].sort((a, b) => a - b);
  const totalConcepts = groupSizes.reduce((sum, size) => sum + size, 0);

  if (pages.length < groupSizes.length || totalConcepts <= 0 || groupSizes.some((size) => !Number.isSafeInteger(size) || size <= 0)) {
    return undefined;
  }

  const splitPages: number[] = [];
  let conceptsBeforeBoundary = 0;
  let minimumPageIndex = 1;

  for (let groupIndex = 0; groupIndex < groupSizes.length - 1; groupIndex++) {
    conceptsBeforeBoundary += groupSizes[groupIndex];
    const remainingGroups = groupSizes.length - groupIndex - 1;
    const idealPageIndex = Math.round((conceptsBeforeBoundary / totalConcepts) * pages.length);
    const maximumPageIndex = pages.length - remainingGroups;
    const pageIndex = Math.max(minimumPageIndex, Math.min(idealPageIndex, maximumPageIndex));

    splitPages.push(pages[pageIndex]);
    minimumPageIndex = pageIndex + 1;
  }

  return splitPages;
}
