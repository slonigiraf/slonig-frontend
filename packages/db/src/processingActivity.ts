// Copyright 2021-2026 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** In-memory activity from both manual stages and Fast Forward. A backup
 * overlay must never interrupt an active Book job. Symbols allow separate
 * mounted processing adapters to report activity without overwriting one
 * another; Fast Forward uses one stable key for each Book. */
const activeSources = new Set<string | symbol>();
const listeners = new Set<() => void>();

export function getIsBookProcessingActive (): boolean {
  return activeSources.size > 0;
}

export function subscribeBookProcessingActivity (listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function setBookProcessingActivity (source: string | symbol, active: boolean): void {
  const wasActive = activeSources.size > 0;
  if (active) activeSources.add(source);
  else activeSources.delete(source);
  if (wasActive !== (activeSources.size > 0)) listeners.forEach((listener) => listener());
}
