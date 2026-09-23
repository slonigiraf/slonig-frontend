// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * A persisted `valid:false` belongs to the exact Image.data value that was
 * compiled. Any data change, including whitespace-only edits, makes the source
 * eligible for a fresh compile because the caller clears `valid` on writes.
 */
export function shouldSkipStoredTikzCompile (storedData: unknown, valid: unknown, value: string): boolean {
  return valid === false && storedData === value;
}


/**
 * Returns the validity write for a render result, or undefined when the result
 * must not update the row. `valid:false` is sticky for the exact stored source:
 * once a source times out/fails, a later success from an already-running render
 * cannot resurrect it. Changing Image.data makes old render callbacks stale.
 */
export function nextStoredTikzValidity (storedData: unknown, valid: unknown, renderedValue: string, hasError: boolean): boolean | undefined {
  if (storedData !== renderedValue || valid === false) {
    return undefined;
  }

  const next = !hasError;

  return valid === next ? undefined : next;
}
