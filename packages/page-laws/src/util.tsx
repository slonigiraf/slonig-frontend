import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function randomIdHex(): string {
  return u8aToHex(randomAsU8a(32));
}

function fixInvalidJSONBackslashes(jsonString: string): string {
  // This regex finds text inside double quotes, excluding the quotes themselves
  return jsonString.replace(
    /"((?:\\.|[^"\\])*)"/g,
    (match, inner) => {
      // Replace every single backslash with double backslashes
      const fixedInner = inner.replace(/\\/g, '\\\\');
      return `"${fixedInner}"`;
    }
  );
}


/**
 * Safely parses JSON with LaTeX-like backslashes.
 */
export function safeJSONParse<T = any>(input: string): T {
  const fixed = fixInvalidJSONBackslashes(input);
  return JSON.parse(fixed);
}