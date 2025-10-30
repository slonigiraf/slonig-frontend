import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function randomIdHex(): string {
  return u8aToHex(randomAsU8a(32));
}

export function escapeSpecialBackslashesInObject<T>(obj: T): T {
  if (obj === null || typeof obj !== 'object') return obj;

  const escapeString = (str: string) =>
    str
      .replaceAll('\b', '\\b')
      .replaceAll('\f', '\\f')
      .replaceAll('\n', '\\n')
      .replaceAll('\r', '\\r')
      .replaceAll('\t', '\\t')
      .replaceAll('\v', '\\v');

  if (Array.isArray(obj)) {
    return obj.map((item) => escapeSpecialBackslashesInObject(item)) as T;
  }

  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      typeof value === 'string'
        ? escapeString(value)
        : escapeSpecialBackslashesInObject(value),
    ])
  ) as T;
}

function fixInvalidJSONBackslashes(jsonString: string): string {
  // This regex finds text inside double quotes, excluding the quotes themselves
  return jsonString.replace(
    /"((?:\\.|[^"\\])*)"/g,
    (match, inner) => {
      // Replace any single backslash that is not already escaped (i.e., not \\)
      const fixedInner = inner.replace(/(?<!\\)\\(?![\\/"bfnrtu])/g, '\\\\');
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