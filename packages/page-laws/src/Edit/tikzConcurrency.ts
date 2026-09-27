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

export interface TikzRenderQueue {
  acquire: () => Promise<() => void>;
}

/**
 * Create a small FIFO semaphore for work that ultimately consumes a TikZJax
 * worker. A caller owns a slot from acquire() until it invokes the returned
 * release function. release() is intentionally idempotent so React cleanup and
 * renderer completion can safely race without corrupting the queue.
 */
export function createTikzRenderQueue (maxConcurrent: number): TikzRenderQueue {
  const concurrency = Number.isFinite(maxConcurrent) && maxConcurrent > 0
    ? Math.max(1, Math.floor(maxConcurrent))
    : 1;
  const waiters: Array<(release: () => void) => void> = [];
  let active = 0;

  const makeRelease = (): (() => void) => {
    let released = false;

    return (): void => {
      if (released) {
        return;
      }

      released = true;
      active -= 1;

      const next = waiters.shift();

      if (next) {
        active += 1;
        next(makeRelease());
      }
    };
  };

  return {
    acquire: (): Promise<() => void> => {
      if (active < concurrency) {
        active += 1;

        return Promise.resolve(makeRelease());
      }

      return new Promise<() => void>((resolve) => {
        waiters.push(resolve);
      });
    }
  };
}

const sharedTikzRenderQueue = createTikzRenderQueue(getTikzRenderConcurrency());

/**
 * Acquire one application-level TikZ render slot. This queue mirrors the
 * TikZJax worker-pool size, so a render's compile timeout starts only after it
 * can actually be submitted to a worker instead of while it waits behind other
 * Ability visuals.
 */
export function acquireTikzRenderSlot (): Promise<() => void> {
  return sharedTikzRenderQueue.acquire();
}
