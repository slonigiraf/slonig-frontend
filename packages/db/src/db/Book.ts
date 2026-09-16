// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

export type BookStageSpendKey = 'recognize' | 'language' | 'subject' | 'chapters' | 'concepts' | 'exercises' | 'splitExercises' | 'fixExercises' | 'abilities' | 'fixAbilities' | 'images' | 'fixImages' | 'standards' | 'fixStandards';

export type BookStageSpend = Partial<Record<BookStageSpendKey, number>>;

export type BookSubject = 'en-math' | 'en-ela' | 'en-science' | 'na';

export interface Book {
  id: number;
  chapterOrder?: number[];
  courseOrder?: string[];
  excludedCourseChapterIds?: number[];
  language?: string;
  subject?: BookSubject;
  knowledgeId?: string;
  publishingLocationId?: string;
  processingStage?: number;
  stageSpend?: BookStageSpend;
  contentHash: string;
  name: string;
  opfsName: string;
  size: number;
  created: number;
}
