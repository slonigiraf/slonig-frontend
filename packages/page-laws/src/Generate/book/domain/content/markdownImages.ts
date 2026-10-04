// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

// Mathpix normally emits ![](./images/file.jpg). Allow optional whitespace and
// angle-bracket destinations as well so older stored MMD continues to work.
const MARKDOWN_IMAGE_SOURCE = String.raw`!\[[^\]]*\]\s*\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+["'][^"']*["'])?\s*\)`;

function markdownImageRegex (): RegExp {
  return new RegExp(MARKDOWN_IMAGE_SOURCE, 'gi');
}

export function markdownImageReferences (text: string): string[] {
  const refs: string[] = [];

  for (const match of text.matchAll(markdownImageRegex())) {
    const reference = (match[1] || match[2] || '').trim();

    if (reference) {
      refs.push(reference);
    }
  }

  return refs;
}

export function stripMarkdownImageReferences (text: string): string {
  return text
    .replace(markdownImageRegex(), ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
