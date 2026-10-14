// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Name both native saves and browser downloads using the account and local backup start time. */
export function backupFilename(accountName?: string, startedAt: Date = new Date()): string {
  // Keep Unicode letters, but replace runs of whitespace with a single
  // underscore to make filenames portable and easy to handle in shells.
  // Strip surrounding whitespace before substitution so no underscores are
  // introduced around the account name.
  const proposed = (accountName ?? '').normalize('NFC')
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[<>:"/\\|?*\u0000-\u001f\u007f]/g, '_');
  let safe = Array.from(proposed).slice(0, 120).join('').replace(/[. ]+$/g, '');
  if (!safe || safe === '.' || safe === '..') safe = 'backup';
  // Windows also forbids device names, even when an extension is present.
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\..*)?$/i.test(safe)) safe = `_${safe}`;
  // Use the user's local clock, not UTC, so the name reflects when they
  // initiated the backup. Capture startedAt once, before any async save work.
  const pad2 = (value: number): string => String(value).padStart(2, '0');
  const timestamp = `${startedAt.getFullYear()}${pad2(startedAt.getMonth() + 1)}${pad2(startedAt.getDate())}_${pad2(startedAt.getHours())}_${pad2(startedAt.getMinutes())}`;
  return `${safe}_${timestamp}.slonig`;
}
