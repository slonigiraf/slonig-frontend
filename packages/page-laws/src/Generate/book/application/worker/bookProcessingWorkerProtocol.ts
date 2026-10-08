// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookProcessingStageKey, BookProcessingWorkerOptions } from '@slonigiraf/db';
import type { TikzPreRenderResult } from '../../../../Edit/TikzDisplay.js';


export const FIX_CONCEPTS_STATUS_ARTIFACT = 'fixConceptsChapterStatuses:v1';
export const STANDARDS_ARTIFACT = 'standards:v4';

export type { BookProcessingWorkerOptions } from '@slonigiraf/db';

export interface BookProcessingWorkerCommand {
  bookId: number;
  stage: BookProcessingStageKey;
  workerId: string;
  options: BookProcessingWorkerOptions;
  /** Optional ordered pipeline. When present, the worker advances stages itself. */
  stages?: BookProcessingStageKey[];
  /** Index to resume from when recreating a durable pipeline worker. */
  startStageIndex?: number;
}

export interface BookProcessingWorkerDoneMessage {
  type: 'done';
  workerId: string;
}

export interface BookProcessingWorkerRenderTikzRequest {
  type: 'renderTikz';
  requestId: string;
  value: string;
  workerId: string;
}

export interface BookProcessingWorkerRenderTikzResult {
  type: 'renderTikzResult';
  requestId: string;
  result?: TikzPreRenderResult;
  error?: string;
}

export interface BookProcessingWorkerServices {
  renderTikz: (value: string) => Promise<TikzPreRenderResult>;
}

export type BookProcessingWorkerMessage = BookProcessingWorkerDoneMessage | BookProcessingWorkerRenderTikzRequest | { type: 'heartbeat'; workerId: string };
export type BookProcessingWorkerIncomingMessage = BookProcessingWorkerCommand | BookProcessingWorkerRenderTikzResult;

export const BOOK_PROCESSING_STAGE_LABELS: Record<BookProcessingStageKey, string> = {
  recognize: 'Recognizing pages',
  language: 'Detecting book language',
  subject: 'Detecting book subject',
  age: 'Detecting learner age',
  chapters: 'Identifying chapters',
  concepts: 'Extracting concepts by chapter',
  fixConcepts: 'Finding missing chapter concepts',
  embeddings: 'Calculating concept Embeddings',
  deduplicateConcepts: 'Finding duplicate concepts',
  sortConcepts: 'Sorting concepts by ZPD',
  refineChapters: 'Clustering concepts into thematic chapters',
  exercises: 'Generating exercises',
  fixExercises: 'Fixing Exercise errors',
  abilities: 'Generating Abilities',
  fixAbilities: 'Fixing Ability errors',
  images: 'Generating Ability images',
  fixImages: 'Reviewing and fixing Ability images',
  standards: 'Matching standards to chapter concepts',
  fixStandards: 'Fixing standards assignments'
};
