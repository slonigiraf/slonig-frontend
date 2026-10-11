// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { PipelineAction } from '../../../shared/types/processing.js';

/** A failed/bypassed stage is not complete, but it must not trap navigation.
 * Keep explicit manual selection; only choose automatically on first load or
 * after the currently selected stage becomes successful. */
export function nextUnresolvedStage (
  actions: readonly PipelineAction[],
  bypassedStages: readonly string[] = [],
  afterKey?: string
): PipelineAction | undefined {
  const afterIndex = afterKey ? actions.findIndex(({ key }) => key === afterKey) : -1;
  const bypassed = new Set(bypassedStages);

  return actions.slice(afterIndex + 1).find(({ isDone, key }) => !isDone && !bypassed.has(key));
}
