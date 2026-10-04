// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookSubject } from '@slonigiraf/db';

import { normalizeLanguageCode } from './bookLanguage.js';


export function automaticBookSubjectForLanguage (language: unknown): BookSubject | undefined {
  const code = normalizeLanguageCode(language);

  return code && code !== 'en' ? 'na' : undefined;
}

export const BOOK_SUBJECT_OPTIONS: Array<{ text: string; value: BookSubject }> = [
  { text: 'en-math', value: 'en-math' },
  { text: 'en-ela', value: 'en-ela' },
  { text: 'en-science', value: 'en-science' },
  { text: 'na', value: 'na' }
];

function parseJsonResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}

export function normalizeBookSubject (value: unknown): BookSubject | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const normalized = value.trim().toLocaleLowerCase();

  if (normalized === 'en-math' || normalized === 'math' || normalized === 'mathematics') {
    return 'en-math';
  }

  if (normalized === 'en-ela' || normalized === 'ela' || normalized === 'english language arts' || normalized === 'language arts') {
    return 'en-ela';
  }

  if (normalized === 'en-science' || normalized === 'science') {
    return 'en-science';
  }

  if (normalized === 'na' || normalized === 'other' || normalized === 'n/a' || normalized === 'not applicable') {
    return 'na';
  }

  return undefined;
}

export function parseDetectedBookSubject (content: string): BookSubject {
  const parsed = parseJsonResponse(content);
  let value: unknown = parsed;

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;

    value = record.subject ?? record.bookSubject ?? record.category;
  }

  const subject = normalizeBookSubject(value);

  if (!subject) {
    throw new Error('OpenRouter returned an invalid book subject.');
  }

  return subject;
}

export function bookSubjectLabel (subject?: BookSubject): string {
  return normalizeBookSubject(subject) ?? 'Book subject not detected';
}
