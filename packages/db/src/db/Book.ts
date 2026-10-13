// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const BOOK_PROCESSING_STAGES = [
  'recognize',
  'language',
  'subject',
  'age',
  'chapters',
  'concepts',
  'fixConcepts',
  'embeddings',
  'deduplicateConcepts',
  'sortConcepts',
  'refineChapters',
  'abilities',
  'fixAbilities',
  'images',
  'fixImages',
  'answerImages',
  'fixAnswerImages',
  'standards'
] as const;

export type BookProcessingStageKey = typeof BOOK_PROCESSING_STAGES[number];

export type BookStageSpendKey = BookProcessingStageKey;

export type BookStageSpend = Partial<Record<BookStageSpendKey, number>>;

export type BookSubject = 'en-math' | 'en-ela' | 'en-science' | 'na';

export interface Book {
  id: number;
  chapterOrder?: number[];
  courseOrder?: string[];
  excludedCourseChapterIds?: number[];
  /** Number of Fix Concepts runs started for this book. */
  fixConceptsAttempts?: number;
  language?: string;
  subject?: BookSubject;
  age?: number;
  knowledgeId?: string;
  publishingLocationId?: string;
  /**
   * Stable stage ids that have completed successfully. Pipeline ordering is
   * defined separately by BOOK_PROCESSING_STAGES, so inserting a new stage does
   * not renumber or reinterpret existing completion data.
   */
  completedStages?: BookProcessingStageKey[];
  /** Explicitly acknowledged unsuccessful stages. A bypass is NOT a success. */
  bypassedStages?: BookProcessingStageKey[];
  stageSpend?: BookStageSpend;
  contentHash: string;
  name: string;
  opfsName: string;
  size: number;
  created: number;
}

/** Return only canonical, explicitly completed stages in pipeline order. */
export function getBookCompletedStages (book: Pick<Book, 'completedStages'>): BookProcessingStageKey[] {
  const completed = new Set(book.completedStages ?? []);

  return BOOK_PROCESSING_STAGES.filter((stage) => completed.has(stage));
}

export function isBookProcessingStageComplete (book: Pick<Book, 'completedStages'>, stage: BookProcessingStageKey): boolean {
  return getBookCompletedStages(book).includes(stage);
}

/** A failed stage may be bypassed explicitly to use any partial outputs downstream. */
export function isBookProcessingStageSatisfied (book: Pick<Book, 'completedStages' | 'bypassedStages'>, stage: BookProcessingStageKey): boolean {
  return isBookProcessingStageComplete(book, stage) || (book.bypassedStages ?? []).includes(stage);
}

export function withBypassedBookProcessingStage (book: Book, stage: BookProcessingStageKey): Book {
  if (isBookProcessingStageComplete(book, stage)) return book;
  const bypassed = new Set(book.bypassedStages ?? []);

  bypassed.add(stage);

  return { ...book, bypassedStages: BOOK_PROCESSING_STAGES.filter((candidate) => bypassed.has(candidate)) };
}

export function withCompletedBookProcessingStage (book: Book, stage: BookProcessingStageKey): Book {
  const completed = new Set(getBookCompletedStages(book));

  completed.add(stage);

  return {
    ...book,
    completedStages: BOOK_PROCESSING_STAGES.filter((candidate) => completed.has(candidate)),
    bypassedStages: (book.bypassedStages ?? []).filter((candidate) => candidate !== stage)
  };
}

export function withBookProcessingStagesResetFrom (book: Book, stage: BookProcessingStageKey): Book {
  const stageIndex = (BOOK_PROCESSING_STAGES as readonly BookProcessingStageKey[]).indexOf(stage);

  if (stageIndex < 0) {
    return { ...book, completedStages: getBookCompletedStages(book) };
  }

  const invalidated = new Set(bookStagesInvalidatedByRerun(stage));
  const completed = new Set(getBookCompletedStages(book));

  invalidated.forEach((candidate) => completed.delete(candidate));

  return {
    ...book,
    completedStages: BOOK_PROCESSING_STAGES.filter((candidate) => completed.has(candidate)),
    bypassedStages: (book.bypassedStages ?? []).filter((candidate) => !invalidated.has(candidate))
  };
}

/** Stage-specific invalidation, NOT a blanket suffix reset. A change to an
 * individual Concept or Image is handled by its own persistence operation.
 * In particular, image/Ability work must never uncomplete Standards. */
export function bookStagesInvalidatedByRerun(stage: BookProcessingStageKey): BookProcessingStageKey[] {
  const index = BOOK_PROCESSING_STAGES.indexOf(stage);

  if (index < 0) return [];
  if (index <= BOOK_PROCESSING_STAGES.indexOf('concepts')) return BOOK_PROCESSING_STAGES.slice(index);

  const dependent: Partial<Record<BookProcessingStageKey, readonly BookProcessingStageKey[]>> = {
    refineChapters: ['standards'],
    abilities: ['fixAbilities', 'images', 'fixImages', 'answerImages', 'fixAnswerImages'],
    images: ['fixImages', 'answerImages', 'fixAnswerImages'],
    answerImages: ['fixAnswerImages']
  };

  return [stage, ...(dependent[stage] ?? [])];
}

/** Explicitly invalidate affected stages after a *real* content change.
 * This is separate from restarting an AI review without applying changes. */
export function withInvalidatedBookProcessingStages(book: Book, stages: readonly BookProcessingStageKey[]): Book {
  const invalidated = new Set(stages);

  return {
    ...book,
    completedStages: getBookCompletedStages(book).filter((stage) => !invalidated.has(stage)),
    bypassedStages: (book.bypassedStages ?? []).filter((stage) => !invalidated.has(stage))
  };
}
