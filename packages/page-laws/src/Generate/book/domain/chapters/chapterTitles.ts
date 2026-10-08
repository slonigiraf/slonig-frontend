// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const preservedAcronyms = new Set(['AI', 'API', 'DNA', 'RNA', 'HTML', 'CSS', 'SQL', 'PDF', 'USA', 'UK', 'EU', 'ISO', 'STEM', 'MMD', 'WWW']);
const lowerCaseConnectors = new Set(['a', 'an', 'and', 'as', 'at', 'but', 'by', 'for', 'from', 'in', 'nor', 'of', 'on', 'or', 'per', 'the', 'to', 'via', 'vs', 'with', 'yet']);

/** Title case for learner-facing book and chapter headings (not concept/exercise names). */
export function formatBookTitle (value: string): string {
  const title = value.replace(/\s+/g, ' ').trim();
  const words = [...title.matchAll(/[\p{L}]+(?:[’'][\p{L}]+)*/gu)];
  const lastWordStart = words.at(-1)?.index;

  return title.replace(/[\p{L}]+(?:[’'][\p{L}]+)*/gu, (word, offset: number) => {
    const lower = word.toLocaleLowerCase();

    // Preserve acronyms and intentional internal capitalization (e.g. DNA, iPhone).
    if (preservedAcronyms.has(word) || /\p{Ll}\p{Lu}/u.test(word)) {
      return word;
    }

    if (offset !== words[0]?.index && offset !== lastWordStart && lowerCaseConnectors.has(lower)) {
      return lower;
    }

    return lower.charAt(0).toLocaleUpperCase() + lower.slice(1);
  });
}

/** Remove source-book chapter numbering before persisting or presenting its name. */
export function formatChapterTitle (value: string): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  const withoutNumber = trimmed
    .replace(/^(?:(?:chapter|chap\.?|section|unit|part|§)\s*)?\d+(?:\.\d+)*\s*(?:[.):\-–—]\s*|\s+)(?=\p{L})/iu, '')
    .replace(/^(?:(?:chapter|chap\.?|section|unit|part)\s*)?[IVXLCDM]+[.):\-–—]\s*(?=\p{L})/iu, '')
    .replace(/^(?:chapter|chap\.?|section|unit|part)\s+[IVXLCDM]+\s+(?=\p{L})/iu, '')
    .trim();

  const meaningfulTitle = /^(?:(?:chapter|chap\.?|section|unit|part|§)\s*)?(?:\d+(?:\.\d+)*|[IVXLCDM]+)[.):\-–—]?$/iu.test(withoutNumber) ? 'Untitled Chapter' : withoutNumber;

  return formatBookTitle(meaningfulTitle || 'Untitled Chapter');
}
