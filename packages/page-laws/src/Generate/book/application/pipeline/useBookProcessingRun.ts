// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useSyncExternalStore } from 'react';

import { bookProcessingManager } from './bookProcessingManager.js';

/** useSyncExternalStore requires snapshots to retain identity between updates. */
export function useBookProcessingRun (bookId?: number) {
  const subscribe = useCallback((notify: () => void) => bookId === undefined
    ? () => undefined
    : bookProcessingManager.subscribe(bookId, notify), [bookId]);
  const getSnapshot = useCallback(() => bookId === undefined
    ? undefined
    : bookProcessingManager.getSnapshot(bookId), [bookId]);

  return useSyncExternalStore(subscribe, getSnapshot, () => undefined);
}
