// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const acronyms = new Set(['AI', 'API', 'DNA', 'RNA', 'HTML', 'CSS', 'SQL', 'PDF', 'USA', 'UK', 'EU', 'ISO', 'STEM', 'URL', 'HTTP', 'USB', 'GPS', 'ATP', 'NASA', 'NATO', 'UN', 'UNESCO', 'WHO', 'US']);
const properWords = new Set(['English', 'French', 'German', 'Spanish', 'Italian', 'Latin', 'Greek', 'Arabic', 'Chinese', 'Japanese', 'Europe', 'Asia', 'Africa', 'America', 'Newton', 'Einstein', 'Euclid', 'Pythagoras', 'Shakespeare']);

/** Normalize English headings without touching mathematical markup or identifiers.
 * Other languages keep their native capitalization as supplied by the language-aware model.
 */
export function formatSentenceCaseTitle (value: string, language = 'en'): string {
  const title = value.replace(/\s+/g, ' ').trim();

  if (language.toLowerCase().split(/[-_]/)[0] !== 'en') {
    return title;
  }
  let firstWord = true;

  return title.replace(/<kx>[\s\S]*?<\/kx>|[\p{L}][\p{L}\p{N}’'-]*/giu, (word) => {
    if (/^<kx>/i.test(word)) {
      return word;
    }

    const isFirst = firstWord;

    firstWord = false;
    if (acronyms.has(word) || properWords.has(word) || /\p{Ll}\p{Lu}/u.test(word) || /\p{L}\d|\d\p{L}/u.test(word)) {
      return word;
    }

    const lowercase = word.toLocaleLowerCase('en');

    return isFirst ? lowercase.charAt(0).toLocaleUpperCase('en') + lowercase.slice(1) : lowercase;
  });
}
