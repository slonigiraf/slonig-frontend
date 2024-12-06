import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function randomIdHex (): string {
  return u8aToHex(randomAsU8a(32));
}

export const PHRASE_WORD_COUNT = 9;

export function countWords(input: string) {
  if (input) {
    const kxMatches = input.match(/<kx>.*?<\/kx>/g) || [];
    const kxWordCount = kxMatches.length;
    const stringWithoutKx = input.replace(/<kx>.*?<\/kx>/g, '');
    const remainingWords = stringWithoutKx.trim().split(/\s+/).filter(Boolean);
    return kxWordCount + remainingWords.length;
  }
  return 0;
}