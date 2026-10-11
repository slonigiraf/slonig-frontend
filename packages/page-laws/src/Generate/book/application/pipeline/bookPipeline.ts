// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { BOOK_PROCESSING_STAGES, type BookProcessingStageKey } from '@slonigiraf/db';

export interface BookPipelineStageDefinition {
  key: BookProcessingStageKey;
  label: string;
}

const BOOK_PIPELINE_STAGE_LABELS: Record<BookProcessingStageKey, string> = {
  recognize: 'Recognize',
  language: 'Language',
  subject: 'Subject',
  age: 'Age',
  chapters: 'Chapters',
  concepts: 'Concepts',
  fixConcepts: 'Fix concepts',
  embeddings: 'Embedings',
  deduplicateConcepts: 'Deduplicate concepts',
  sortConcepts: 'Sort concepts',
  refineChapters: 'Refine chapters',
  abilities: 'Abilities',
  fixAbilities: 'Fix abilities',
  images: 'Question Images',
  fixImages: 'Fix question images',
  answerImages: 'Answer images',
  fixAnswerImages: 'Fix answer images',
  standards: 'Standards'
};

/** UI metadata for the canonical database-owned processing pipeline. */
export const BOOK_PIPELINE_STAGES: readonly BookPipelineStageDefinition[] = BOOK_PROCESSING_STAGES.map((key) => ({
  key,
  label: BOOK_PIPELINE_STAGE_LABELS[key]
}));

export function bookPipelineStageLabel (key: BookProcessingStageKey): string {
  return BOOK_PIPELINE_STAGE_LABELS[key];
}

export const BOOK_PRICE_STAGES = BOOK_PIPELINE_STAGES;

export const BOOK_READER_COMMAND_ACTIONS = [
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
  'standards'
] as const satisfies readonly BookProcessingStageKey[];

export type BookReaderCommandAction = typeof BOOK_READER_COMMAND_ACTIONS[number];
export type PendingBookProcessingAction = Exclude<BookReaderCommandAction, 'age' | 'language' | 'subject'>;

export interface BookProcessingCommand {
  action: BookReaderCommandAction;
  id: number;
}

export function nextBookProcessingCommand (previous: BookProcessingCommand | undefined, action: BookReaderCommandAction): BookProcessingCommand {
  return {
    action,
    id: (previous?.id ?? 0) + 1
  };
}
