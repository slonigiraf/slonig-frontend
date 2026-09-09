// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Maps items with bounded concurrency while preserving result order.
 *
 * If one worker fails, no new items are started. Already-running work is
 * allowed to settle before the original error is rethrown so callers never
 * continue while hidden background work is still mutating state.
 */
export async function mapConcurrent<T, R> (
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1) {
    throw new Error('Concurrency must be a positive integer.');
  }

  if (!items.length) {
    return [];
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let firstError: unknown;

  const worker = async (): Promise<void> => {
    while (firstError === undefined) {
      const index = nextIndex++;

      if (index >= items.length) {
        return;
      }

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        firstError ??= error;
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, () => worker()));

  if (firstError !== undefined) {
    throw firstError;
  }

  return results;
}
