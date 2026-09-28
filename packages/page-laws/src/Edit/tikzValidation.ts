// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * A persisted `valid:false` belongs to the exact Image.data value that was
 * rendered. Any data change, including whitespace-only edits, makes the source
 * eligible for a fresh render because the caller clears `valid` on writes.
 */
export function shouldSkipStoredTikzCompile (storedData: unknown, valid: unknown, value: string): boolean {
  return valid === false && storedData === value;
}


/**
 * Returns the validity write for a render result, or undefined when the result
 * must not update the row. Results only apply to the exact stored source. A later
 * explicit retry of the same source is allowed to clear `valid:false` after a
 * successful render; cancelled/stale UI renders do not report their result.
 */
export function nextStoredTikzValidity (storedData: unknown, valid: unknown, renderedValue: string, hasError: boolean): boolean | undefined {
  if (storedData !== renderedValue) {
    return undefined;
  }

  const next = !hasError;

  return valid === next ? undefined : next;
}
