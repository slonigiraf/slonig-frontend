// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/**
 * Models sometimes return JSON containing raw LaTeX commands inside <kx>.
 * JSON.parse silently treats e.g. \times, \frac, \begin, \neq and \right as
 * valid JSON control-character escapes (\t, \f, \b, \n and \r), destroying
 * the command before any parsing fallback or markup validation can run.
 *
 * Protect math in the RAW JSON, before JSON.parse, while leaving already
 * escaped backslashes, escaped JSON quotes and Unicode escapes intact.
 */
function protectMathBackslashes (json: string): string {
  return json.replace(/<kx>[\s\S]*?<\/kx>/g, (math) => math.replace(/\\+/g, (slashes: string, offset: number, source: string) => {
    if (slashes.length % 2 === 0) {
      return slashes;
    }

    const next = source[offset + slashes.length];

    // These are JSON quoting/encoding rather than LaTeX commands. For
    // example, \" inside <kx> must not become an unescaped JSON quote.
    if (next === '"' || next === '/' || (next === 'u' && /^[0-9a-fA-F]{4}/.test(source.slice(offset + slashes.length + 1)))) {
      return slashes;
    }

    return `${slashes}\\`;
  }));
}

/** Parse an AI response, tolerating code fences and unescaped LaTeX. */
export function parseModelJson (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
  const mathSafeJson = protectMathBackslashes(json);

  try {
    return JSON.parse(mathSafeJson) as unknown;
  } catch {
    // Keep the legacy fallback for unescaped backslashes outside <kx>.
    return JSON.parse(mathSafeJson.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}
