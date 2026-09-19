// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

const TIKZ_METADATA_ID = 'slonig-tikz-source-v1';
const TIKZ_METADATA_RENDERER = 'tikzjax@1.6.0';

export const DEFAULT_TIKZ_SOURCE = '';

/** Lightweight TikZ detection kept separate from the renderer chunk. */
export function isTikzCode (value: string): boolean {
  const trimmed = value.trim();

  return /\\begin\s*\{tikzpicture\}/.test(trimmed) && /\\end\s*\{tikzpicture\}/.test(trimmed);
}

function encodeUtf8Base64 (value: string): string {
  const bytes = new TextEncoder().encode(value);
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return globalThis.btoa(binary);
}

function decodeUtf8Base64 (value: string): string {
  const binary = globalThis.atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));

  return new TextDecoder().decode(bytes);
}

/**
 * Persist editable TikZ source inside the rendered SVG without changing how the
 * asset is displayed. The knowledge JSON can therefore continue to reference a
 * single image CID while the SVG remains fully editable later.
 */
export function embedTikzSourceInSvg (svg: string, tikz: string): string {
  const trimmedSvg = svg.trim();

  if (!/^<svg\b/i.test(trimmedSvg) || !/<\/svg>$/i.test(trimmedSvg)) {
    throw new Error('Cannot embed TikZ source in invalid SVG markup.');
  }

  const metadataPattern = new RegExp(`<metadata\\b(?=[^>]*\\bid=["']${TIKZ_METADATA_ID}["'])[^>]*>[\\s\\S]*?<\\/metadata>`, 'gi');
  const withoutPreviousSource = trimmedSvg.replace(metadataPattern, '');
  const source = encodeUtf8Base64(tikz);
  const metadata = `<metadata id="${TIKZ_METADATA_ID}" data-encoding="base64" data-renderer="${TIKZ_METADATA_RENDERER}">${source}</metadata>`;

  return withoutPreviousSource.replace(/^(<svg\b[^>]*>)/i, `$1${metadata}`);
}

/** Return the editable TikZ source when the SVG was persisted by this app. */
export function extractTikzSourceFromSvg (svg: string): string | undefined {
  const metadataPattern = new RegExp(`<metadata\\b(?=[^>]*\\bid=["']${TIKZ_METADATA_ID}["'])[^>]*>([\\s\\S]*?)<\\/metadata>`, 'i');
  const match = metadataPattern.exec(svg);

  if (!match) {
    return undefined;
  }

  try {
    const encoded = match[1].replace(/\s+/g, '');
    return decodeUtf8Base64(encoded);
  } catch {
    return undefined;
  }
}
