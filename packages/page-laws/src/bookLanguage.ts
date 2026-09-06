// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const LATIN_LANGUAGE_WORDS: Record<string, string[]> = {
  de: ['der', 'die', 'das', 'und', 'ist', 'mit', 'für', 'nicht', 'eine'],
  en: ['the', 'and', 'is', 'are', 'with', 'for', 'from', 'this', 'that'],
  es: ['el', 'la', 'los', 'las', 'y', 'de', 'que', 'con', 'para'],
  fr: ['le', 'la', 'les', 'et', 'de', 'des', 'avec', 'pour', 'une'],
  it: ['il', 'la', 'gli', 'le', 'e', 'di', 'con', 'per', 'una'],
  nl: ['de', 'het', 'een', 'en', 'van', 'met', 'voor', 'niet', 'dat'],
  pl: ['i', 'w', 'na', 'jest', 'nie', 'z', 'do', 'dla', 'oraz'],
  pt: ['o', 'a', 'os', 'as', 'e', 'de', 'com', 'para', 'uma'],
  tr: ['ve', 'bir', 'bu', 'ile', 'için', 'olan', 'olarak', 'değil', 'veya']
};

export function detectBookLanguage (pageTexts: string[]): string {
  const text = pageTexts.join('\n').normalize('NFC');

  const scripts: Array<[RegExp, string]> = [
    [/[぀-ヿ]/u, 'ja'],
    [/[가-힯]/u, 'ko'],
    [/[一-鿿]/u, 'zh'],
    [/[Ͱ-Ͽ]/u, 'el'],
    [/[֐-׿]/u, 'he'],
    [/[؀-ۿ]/u, 'ar'],
    [/[ऀ-ॿ]/u, 'hi'],
    [/[฀-๿]/u, 'th'],
    [/[Ⴀ-ჿ]/u, 'ka'],
    [/[԰-֏]/u, 'hy']
  ];
  const detectedScript = scripts.find(([pattern]) => pattern.test(text));

  if (detectedScript) {
    return detectedScript[1];
  }

  if (/[Ѐ-ӿ]/u.test(text)) {
    return /[іїєґ]/iu.test(text) ? 'uk' : 'ru';
  }

  if (/[ğışİ]/u.test(text)) {
    return 'tr';
  }

  const words = (text.toLocaleLowerCase().match(/\p{L}+/gu) ?? []) as string[];
  const scores = Object.entries(LATIN_LANGUAGE_WORDS).map(([language, markers]) => ({
    language,
    score: words.reduce((score, word) => score + (markers.includes(word) ? 1 : 0), 0)
  })).sort((a, b) => b.score - a.score);

  return scores[0]?.score ? scores[0].language : 'en';
}
