import { u8aToHex } from '@polkadot/util';
import { randomAsU8a } from '@polkadot/util-crypto';

export function randomIdHex(): string {
  return u8aToHex(randomAsU8a(32));
}

// --- Helpers defined outside the function for efficiency ---

/**
 * A map of special characters to their escaped string representations.
 */
const escapeChars: { [key: string]: string } = {
  '\b': '\\b', // Backspace
  '\f': '\\f', // Form feed
  '\n': '\\n', // Newline
  '\r': '\\r', // Carriage return
  '\t': '\\t', // Tab
  '\v': '\\v', // Vertical tab
};

/**
 * A regular expression that matches any of the special characters.
 * Note: Inside a character class `[]`, \b correctly matches a backspace
 * character (and not a word boundary).
 */
const escapeRegex = /[\b\f\n\r\t\v]/g;

// --- Rewritten Function ---

export function escapeSpecialBackslashesInObject<T>(obj: T): T {
  // Base case: non-objects or null are returned as is.
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }

  /**
   * Replaces special characters with their escaped versions using the regex.
   */
  const escapeString = (str: string) =>
    str.replace(escapeRegex, (match) => escapeChars[match]);

  // Handle Arrays: recursively map over items.
  if (Array.isArray(obj)) {
    return obj.map((item) => escapeSpecialBackslashesInObject(item)) as T;
  }

  // Handle Objects: recursively map over values.
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [
      key,
      // Only escape strings; recurse for nested objects/arrays.
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