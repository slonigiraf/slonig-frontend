// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

const BOOK_PARSING_TABLES = new Set([
  'books',
  'bookPages',
  'bookChapters',
  'bookConcepts',
  'bookAbilitySplitQueues',
  'skills',
  'exerciseTemplates'
]);

const CACHE_TABLES = new Set([
  'cidCache',
  'aiTutorStudentMessages',
  'standardEmbeddings',
  'conceptEmbeddings',
  'mathpixPdfJobs',
  'tikzSvgCache',
  'bookProcessingRuns'
]);

/** Full archives include every application record; only temporary restore staging is excluded. */
export function shouldExportDatabaseRow(tableName: string): boolean {
  return tableName !== 'backupStaging';
}

/** Explicit retention policy: essential records, rebuildable source derivatives, and expendable caches. */
export type BackupPolicy = 'essential' | 'reconstructable' | 'cache';
export function backupPolicy(tableName: string): BackupPolicy {
  if (tableName === 'backupStaging' || CACHE_TABLES.has(tableName)) return 'cache';
  if (BOOK_PARSING_TABLES.has(tableName) || tableName === 'bookProcessingRuns') return 'reconstructable';
  return 'essential';
}
export function shouldIncludeBackupTable(tableName: string): boolean {
  return shouldExportDatabaseRow(tableName);
}
