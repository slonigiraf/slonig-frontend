import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function randomIdHex (): string {
  return u8aToHex(randomAsU8a(32));
}

export const PHRASE_WORD_COUNT = 7;
export function countWords(input: string) {
  if(input){
    const stringWithoutTags = input.replace(/<\/?kx>/g, '');
    const words = stringWithoutTags.trim().split(/\s+/).filter(Boolean);
    return words.length;
  }
  return 0;
}