// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookProcessingStageKey } from './Book.js';

export const BOOK_PROCESSING_WORKER_STATES = ['queued', 'running', 'completed', 'failed', 'aborted'] as const;

export type BookProcessingWorkerState = typeof BOOK_PROCESSING_WORKER_STATES[number];

export interface BookProcessingWorkerOptions {
  embeddingModel?: string;
  model?: string;
  onlyFailedConcepts?: boolean;
  onlyMissingAbilities?: boolean;
  onlyMissingConcepts?: boolean;
  onlyMissingExercises?: boolean;
  onlyMissingImages?: boolean;
  standardsModel?: string;
  force?: boolean;
}

/**
 * Durable cross-window status for one background book-processing worker.
 *
 * The book-processing service worker is the only writer while a job is active.
 * React pages and the global worker dock consume this row from IndexedDB, so
 * route changes and minimized UI do not own the processing lifecycle.
 */
export interface BookProcessingWorker {
  workerId: string;
  bookId: number;
  bookName: string;
  stage: BookProcessingStageKey;
  stageLabel: string;
  /** Serializable command options so a pipeline can be resumed from IndexedDB. */
  options?: BookProcessingWorkerOptions;
  /** True when one worker owns a sequence of processing stages. */
  isPipeline?: boolean;
  /** Ordered stages owned by this worker. */
  stageSequence?: BookProcessingStageKey[];
  /** Zero-based index of the stage currently being executed. */
  stageIndex?: number;
  state: BookProcessingWorkerState;
  progressValue: number;
  progressTotal: number;
  spent: number;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  abortRequested?: boolean;
  error?: string;
}
