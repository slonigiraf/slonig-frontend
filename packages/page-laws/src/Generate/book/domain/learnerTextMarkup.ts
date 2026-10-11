// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

// Mirror SpanWithTags tokenization. Code content is literal, while KaTeX
// content is checked for nested HTML tags as well. Only <kx> and <code> render.
const supportedContent = /```([a-zA-Z0-9_-]+)?[ \t]*\n([\s\S]*?)```|``((?:(?!``)[^\n])+)``|`([^`\n]+)`|<kx>([\s\S]*?)<\/kx>|<code>([\s\S]*?)<\/code>/g;
const htmlTag = /<\/?[a-z][a-z0-9:-]*(?:\s+[^<>]*?)?\s*\/?>/i;

/** Reject HTML-like markup that SpanWithTags would render as literal text. */
export function assertSupportedLearnerTextMarkup (value: string, field: string): void {
  const unparsed = value.replace(supportedContent, (_match, _language, _fence, _double, _single, katex: string | undefined) => katex ?? ' ');
  const forbidden = htmlTag.exec(unparsed);

  if (forbidden) {
    throw new Error(`${field} contains unsupported HTML tag ${forbidden[0]}; only <kx> and <code> are supported.`);
  }
}
