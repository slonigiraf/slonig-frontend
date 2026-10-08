// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const acronyms = new Set(['AI', 'API', 'DNA', 'RNA', 'HTML', 'CSS', 'SQL', 'PDF', 'USA', 'UK', 'EU', 'ISO', 'STEM', 'URL', 'HTTP', 'USB', 'GPS', 'ATP']);
const properWords = new Set(['English', 'French', 'German', 'Spanish', 'Italian', 'Latin', 'Greek', 'Arabic', 'Chinese', 'Japanese', 'Europe', 'Asia', 'Africa', 'America', 'Newton', 'Einstein', 'Euclid', 'Pythagoras', 'Shakespeare']);

/** Normalize names returned by AI to sentence case, without touching math markup or identifiers. */
export function formatSentenceCaseTitle (value: string): string {
  const title = value.replace(/\s+/g, ' ').trim();
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

    const lowercase = word.toLocaleLowerCase();

    return isFirst ? lowercase.charAt(0).toLocaleUpperCase() + lowercase.slice(1) : lowercase;
  });
}
