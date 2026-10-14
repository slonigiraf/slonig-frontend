// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Import progress is based on bytes that have been verified AND processed,
 * followed by the three steps of committing the restored data.
 * Leave 100% for a successful commit; do not imply a partial restore is done.
 */
export type RestoreProgressStage = 'archive' | 'commit' | 'complete';

export function restorePercent(stage: RestoreProgressStage, completed = 0, total = 1): number {
  if (stage === 'complete') return 100;
  const start = stage === 'archive' ? 0 : 90;
  const span = stage === 'archive' ? 90 : 9;
  const fraction = total > 0 && Number.isFinite(completed) && Number.isFinite(total)
    ? Math.max(0, Math.min(1, completed / total))
    : 0;

  return Math.min(99, Math.floor(start + span * fraction));
}
