// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const OPENROUTER_CONCURRENCY = 10;

export interface RequestGate {
  pause: (milliseconds: number) => void;
  run: <T>(request: () => Promise<T>) => Promise<T>;
}

export function createRequestGate (maxConcurrent: number): RequestGate {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error('OpenRouter concurrency must be a positive integer.');
  }

  let active = 0;
  let pauseUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    if (active >= maxConcurrent || !queue.length) {
      return;
    }

    const wait = pauseUntil - Date.now();

    if (wait > 0) {
      if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined;
          pump();
        }, wait);
      }

      return;
    }

    while (active < maxConcurrent && queue.length) {
      const start = queue.shift();

      if (!start) {
        break;
      }

      active++;
      start();
    }
  };

  return {
    pause: (milliseconds): void => {
      pauseUntil = Math.max(pauseUntil, Date.now() + Math.max(0, milliseconds));

      if (timer !== undefined) {
        clearTimeout(timer);
        timer = undefined;
      }

      pump();
    },
    run: <T,>(request: () => Promise<T>): Promise<T> => new Promise<T>((resolve, reject) => {
      queue.push(() => {
        Promise.resolve()
          .then(request)
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      });
      pump();
    })
  };
}

// One app-wide gate means separate screens and request types cannot each open
// their own independent pool and accidentally exceed the intended OpenRouter
// concurrency ceiling when they overlap.
export const openRouterRequestGate = createRequestGate(OPENROUTER_CONCURRENCY);
