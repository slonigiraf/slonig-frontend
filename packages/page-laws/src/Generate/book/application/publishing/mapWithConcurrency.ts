// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Map items with a fixed upper bound on active tasks, preserving input order.
 * After a failure, stop scheduling new items and wait for running tasks to
 * finish before rejecting. This prevents background IPFS uploads from leaking
 * into the next publishing attempt.
 */
export async function mapWithConcurrency<T, R> (
  items: readonly T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  if (!Number.isInteger(concurrency) || concurrency < 1) {
    throw new RangeError('Publishing concurrency must be a positive integer.');
  }

  const results = new Array<R>(items.length);
  let nextIndex = 0;
  let failed = false;
  let firstError: unknown;

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (!failed && nextIndex < items.length) {
      const index = nextIndex++;

      try {
        results[index] = await mapper(items[index], index);
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
  }));

  if (failed) {
    throw firstError;
  }

  return results;
}
