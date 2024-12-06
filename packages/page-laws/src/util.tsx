import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function randomIdHex (): string {
  return u8aToHex(randomAsU8a(32));
}