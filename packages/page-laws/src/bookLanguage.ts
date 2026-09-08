// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const LANGUAGE_NAMES: Record<string, string> = {
  ar: 'Arabic',
  bg: 'Bulgarian',
  ca: 'Catalan',
  cs: 'Czech',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  es: 'Spanish',
  et: 'Estonian',
  fa: 'Persian',
  fi: 'Finnish',
  fr: 'French',
  he: 'Hebrew',
  hi: 'Hindi',
  hr: 'Croatian',
  hu: 'Hungarian',
  hy: 'Armenian',
  id: 'Indonesian',
  it: 'Italian',
  ja: 'Japanese',
  ka: 'Georgian',
  ko: 'Korean',
  lt: 'Lithuanian',
  lv: 'Latvian',
  mk: 'Macedonian',
  ms: 'Malay',
  nl: 'Dutch',
  no: 'Norwegian',
  pl: 'Polish',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sk: 'Slovak',
  sl: 'Slovenian',
  sr: 'Serbian',
  sv: 'Swedish',
  th: 'Thai',
  tr: 'Turkish',
  uk: 'Ukrainian',
  vi: 'Vietnamese',
  zh: 'Chinese'
};

function parseJsonResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return json;
  }
}

function normalizeLanguageCode (value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const code = value.trim().toLocaleLowerCase().replace('_', '-').split('-')[0];

  return /^[a-z]{2}$/.test(code) ? code : undefined;
}

export function getMiddleBookPageNumbers (totalPages: number): number[] {
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    return [];
  }

  const count = Math.min(3, totalPages);
  const start = Math.floor((totalPages - count) / 2) + 1;

  return Array.from({ length: count }, (_, index) => start + index);
}

export function bookLanguageDetectionPrompt (pageTexts: Array<{ pageNumber: number; text: string }>): string {
  return `Identify the primary natural language of this book using only the supplied Mathpix MMD text from its middle pages. Ignore formulas, code, proper names, citations, isolated foreign phrases, and bilingual glossary fragments when deciding the main prose language. If the pages contain multiple languages, choose the language used for the majority of explanatory or instructional prose.

Return only valid JSON in this exact shape using a lowercase ISO 639-1 two-letter code:
{"language":"en"}

Middle-page MMD text:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
}

export function parseDetectedBookLanguage (content: string): string {
  const parsed = parseJsonResponse(content);
  let value: unknown = parsed;

  if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
    const record = parsed as Record<string, unknown>;

    value = record.language ?? record.languageCode ?? record.code;
  }

  const code = normalizeLanguageCode(value);

  if (!code) {
    throw new Error('OpenRouter returned an invalid book language.');
  }

  return code;
}

export function bookLanguageLabel (language?: string): string {
  if (!language) {
    return 'Book language not detected';
  }

  const code = normalizeLanguageCode(language);

  return code ? LANGUAGE_NAMES[code] ?? code.toLocaleUpperCase() : language;
}
