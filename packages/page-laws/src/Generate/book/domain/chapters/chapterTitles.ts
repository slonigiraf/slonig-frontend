// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { formatSentenceCaseTitle } from '../naming/sentenceCase.js';

/** Course names follow the orthography of the book language, rather than English title case. */
export function formatBookTitle (value: string, language = 'en'): string {
  return formatSentenceCaseTitle(value, language);
}

/** Remove source-book chapter numbering before persisting or presenting its name. */
export function formatChapterTitle (value: string, language = 'en'): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  const withoutNumber = trimmed
    .replace(/^(?:(?:chapter|chap\.?|section|unit|part|§)\s*)?\d+(?:\.\d+)*\s*(?:[.):\-–—]\s*|\s+)(?=\p{L})/iu, '')
    .replace(/^(?:(?:chapter|chap\.?|section|unit|part)\s*)?[IVXLCDM]+[.):\-–—]\s*(?=\p{L})/iu, '')
    .replace(/^(?:chapter|chap\.?|section|unit|part)\s+[IVXLCDM]+\s+(?=\p{L})/iu, '')
    .trim();
  const meaningfulTitle = /^(?:(?:chapter|chap\.?|section|unit|part|§)\s*)?(?:\d+(?:\.\d+)*|[IVXLCDM]+)[.):\-–—]?$/iu.test(withoutNumber) ? 'Untitled chapter' : withoutNumber;

  return formatBookTitle(meaningfulTitle || 'Untitled chapter', language);
}
