// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/** Keep author/model capitalization intact; the AI prompt determines casing. */
export function formatBookTitle (value: string, _language = 'en'): string {
  return value.replace(/\s+/g, ' ').trim();
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
