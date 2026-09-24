// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const DEFAULT_HARDWARE_CONCURRENCY = 4;

/**
 * Run two TikZ renders per logical CPU reported by the browser.
 *
 * Browsers may intentionally report an approximate hardwareConcurrency; that
 * value is still the best local signal available for sizing the worker pool.
 */
export function getTikzRenderConcurrency (hardwareConcurrency?: number): number {
  const reported = hardwareConcurrency ?? (typeof navigator === 'undefined' ? undefined : navigator.hardwareConcurrency);
  const cores = typeof reported === 'number' && Number.isFinite(reported) && reported > 0
    ? Math.max(1, Math.floor(reported))
    : DEFAULT_HARDWARE_CONCURRENCY;

  return cores * 2;
}
