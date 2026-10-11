// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookProcessingStageKey } from './Book.js';

/** Durable checkpoints, not a claim that JavaScript survives a page reload. */
export interface BookProcessingRun {
  bookId: number;
  id: string;
  mode: 'single' | 'fastForward';
  status: 'queued' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
  stages: BookProcessingStageKey[];
  startStage: BookProcessingStageKey;
  currentStage?: BookProcessingStageKey;
  /** Confirmed success checkpoints. Never includes failed/bypassed stages. */
  completed: BookProcessingStageKey[];
  /** Unsuccessful attempts persisted by stable stage key, not cursor position. */
  failedStages?: Partial<Record<BookProcessingStageKey, string>>;
  /** Explicitly accepted failures to advance this run (not successes). */
  bypassedStages?: BookProcessingStageKey[];
  triggeredStage?: BookProcessingStageKey;
  startedStage: boolean;
  retryCounts: Partial<Record<BookProcessingStageKey, number>>;
  skipRefineChapters: boolean;
  models: { generation: string; embedding: string; standards: string };
  error?: string;
  updatedAt: number;
}
