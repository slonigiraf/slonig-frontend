// Copyright 2021-2026 @polkadot/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

const BOOK_PARSING_TABLES = new Set([
  'books',
  'bookPages',
  'bookChapters',
  'bookConcepts',
  'exercises',
  'skills',
  'exerciseTemplates'
]);

const CACHE_TABLES = new Set([
  'cidCache',
  'aiTutorStudentMessages',
  'standardEmbeddings',
  'conceptEmbeddings',
  'mathpixPdfJobs',
  'tikzSvgCache'
]);

export function shouldExportDatabaseRow (tableName: string, value?: unknown, includeEverything = false): boolean {
  if (includeEverything) {
    return true;
  }

  const moduleId = tableName === 'abilities' && value && typeof value === 'object'
    ? (value as { moduleId?: unknown }).moduleId
    : undefined;
  const isBookParsingAbility = typeof moduleId === 'string' && /^book-\d+-(?:exercise|concept)-\d+$/.test(moduleId);

  return !CACHE_TABLES.has(tableName) && !BOOK_PARSING_TABLES.has(tableName) && !isBookParsingAbility;
}
