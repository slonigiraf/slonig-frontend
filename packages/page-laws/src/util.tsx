import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function parseJson (input: string): any | null {
  try {
    const result = JSON.parse(input);
    return result;
  } catch (e) {
    console.error("Error parsing JSON: ", e.message);
    return null;
  }
}

export function randomIdHex (): string {
  return u8aToHex(randomAsU8a(32));
}

