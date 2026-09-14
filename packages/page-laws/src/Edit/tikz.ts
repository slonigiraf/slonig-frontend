// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Lightweight TikZ detection kept separate from the renderer chunk. */
export function isTikzCode (value: string): boolean {
  const trimmed = value.trim();

  return /\\begin\s*\{tikzpicture\}/.test(trimmed) && /\\end\s*\{tikzpicture\}/.test(trimmed);
}
