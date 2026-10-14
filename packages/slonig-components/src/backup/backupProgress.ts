// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * One monotone phase-weighted progress percentage for archive creation.
 * Percentages reflect recorded database rows and actual PDF bytes. The
 * progress indicator finishes at 100% after the native save succeeds
 * or the fallback browser download is launched. The archive is not reread.
 */
export type BackupProgressPhase = 'preparing' | 'database' | 'pdf' | 'finalizing' | 'complete';

const ranges: Record<Exclude<BackupProgressPhase, 'complete'>, readonly [number, number]> = {
  preparing: [0, 5],
  database: [5, 60],
  pdf: [60, 95],
  finalizing: [95, 99]
};

export function backupPercent(phase: BackupProgressPhase, completed = 0, total = 1): number {
  if (phase === 'complete') return 100;
  const [start, end] = ranges[phase];
  const fraction = total > 0 && Number.isFinite(completed) && Number.isFinite(total)
    ? Math.max(0, Math.min(1, completed / total))
    : 0;
  return Math.min(99, Math.floor(start + (end - start) * fraction));
}
