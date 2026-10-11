// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookProcessingStageKey } from '@slonigiraf/db';
import { bypassBookProcessingStage } from '@slonigiraf/db';

import { bookProcessingManager } from './bookProcessingManager.js';

/** Skip from the stage's price confirmation. Never write a success checkpoint.
 * If this is the stage at which Fast Forward stopped, continue that same run
 * after acknowledging the failure; otherwise just record a manual bypass.
 */
export async function skipBookStage (bookId: number, stage: BookProcessingStageKey): Promise<Book> {
  const run = bookProcessingManager.getSnapshot(bookId);

  if (run?.status === 'running') {
    throw new Error('Cannot skip a stage while Fast Forward is running.');
  }

  const failedStage = run?.currentStage ?? run?.triggeredStage;
  const updated = run?.mode === 'fastForward' && run.status === 'failed' && failedStage === stage
    ? await bookProcessingManager.continueAfterFailure(bookId)
    : await bypassBookProcessingStage(bookId, stage);

  if (!updated) throw new Error('Book no longer exists.');

  return updated;
}
