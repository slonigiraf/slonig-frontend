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
  'exercises',
  'fixExercises',
  'abilities',
  'fixAbilities',
  'images',
  'fixImages',
  'standards',
  'fixStandards'
] as const;

export type BookProcessingStageKey = typeof BOOK_PROCESSING_STAGES[number];

export type BookStageSpendKey = BookProcessingStageKey | 'splitExercises';

export type BookStageSpend = Partial<Record<BookStageSpendKey, number>>;

export type BookSubject = 'en-math' | 'en-ela' | 'en-science' | 'na';

export interface Book {
  id: number;
  chapterOrder?: number[];
  courseOrder?: string[];
  excludedCourseChapterIds?: number[];
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
  /** @deprecated Legacy ordinal checkpoint. Read only for pre-v87 books. */
  processingStage?: number;
  stageSpend?: BookStageSpend;
  contentHash: string;
  name: string;
  opfsName: string;
  size: number;
  created: number;
}

const LEGACY_STAGE_MINIMUM: Partial<Record<BookProcessingStageKey, number>> = {
  recognize: 1,
  chapters: 2,
  concepts: 3,
  exercises: 4,
  fixExercises: 6,
  abilities: 8,
  fixAbilities: 9,
  images: 10,
  fixImages: 11,
  standards: 12,
  fixStandards: 13
};

/**
 * Returns stage completion in canonical pipeline order. Explicit completedStages
 * are authoritative. The legacy ordinal/metadata fallback exists only so old
 * book rows remain usable until the v87 migration has written named stages.
 */
export function getBookCompletedStages (book: Pick<Book, 'age' | 'completedStages' | 'language' | 'processingStage' | 'subject'>): BookProcessingStageKey[] {
  if (book.completedStages) {
    const completed = new Set(book.completedStages);

    return BOOK_PROCESSING_STAGES.filter((stage) => completed.has(stage));
  }

  const legacyStage = book.processingStage ?? 0;
  const completed = new Set<BookProcessingStageKey>();

  BOOK_PROCESSING_STAGES.forEach((stage) => {
    const minimum = LEGACY_STAGE_MINIMUM[stage];

    if (minimum !== undefined && legacyStage >= minimum) {
      completed.add(stage);
    }
  });

  if (book.language) {
    completed.add('language');
  }

  if (book.subject) {
    completed.add('subject');
  }

  if (book.age !== undefined) {
    completed.add('age');
  }

  return BOOK_PROCESSING_STAGES.filter((stage) => completed.has(stage));
}

export function isBookProcessingStageComplete (book: Pick<Book, 'age' | 'completedStages' | 'language' | 'processingStage' | 'subject'>, stage: BookProcessingStageKey): boolean {
  return getBookCompletedStages(book).includes(stage);
}

export function withCompletedBookProcessingStage (book: Book, stage: BookProcessingStageKey): Book {
  const completed = new Set(getBookCompletedStages(book));

  completed.add(stage);

  return {
    ...book,
    completedStages: BOOK_PROCESSING_STAGES.filter((candidate) => completed.has(candidate))
  };
}

export function withBookProcessingStagesResetFrom (book: Book, stage: BookProcessingStageKey): Book {
  const stageIndex = BOOK_PROCESSING_STAGES.indexOf(stage);

  if (stageIndex < 0) {
    return { ...book, completedStages: getBookCompletedStages(book) };
  }

  const completed = new Set(getBookCompletedStages(book));

  BOOK_PROCESSING_STAGES.slice(stageIndex).forEach((candidate) => completed.delete(candidate));

  return {
    ...book,
    completedStages: BOOK_PROCESSING_STAGES.filter((candidate) => completed.has(candidate))
  };
}
