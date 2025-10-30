import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function randomIdHex(): string {
  return u8aToHex(randomAsU8a(32));
}

export function escapeSpecialBackslashesInObject(obj) {
  const fixed = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      // Double any single backslash followed by a letter (a–z or A–Z)
      fixed[key] = value.replaceAll('\b', '\\b').replaceAll('\f', '\\f').replaceAll('\n', '\\n').replaceAll('\r', '\\r').replaceAll('\t', '\\t').replaceAll('\v', '\\v');
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      // Recursively handle nested objects
      fixed[key] = escapeSpecialBackslashesInObject(value);
    } else {
      fixed[key] = value;
    }
  }

  return fixed;
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