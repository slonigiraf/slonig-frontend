// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const COURSE_NAMES_PROMPT = (input: unknown): string => {
  return `Correct and improve the book name and each editable chapter name using only the ordered skill-template titles as evidence. Keep names concise, specific, and in the same language as the skill-template titles. Follow that language's native capitalization rules for the book and ALL chapter titles. For English, use sentence case ("This is an example of a title"): capitalize the first word, proper nouns, and acronyms only. For other languages, follow native orthographic rules; never impose English title case. MANDATORY CHAPTER-TITLE RULE: Every returned chapter title must contain ONLY its subject name, never a chapter number or label. For example, "Chapter 1. Fractions" must become "Fractions", and "1. Fractions" must also become "Fractions". Remove prefixes such as "Chapter 2:", "2.1", "Section 3", and Roman numerals from ALL chapter titles, even if they appear in the supplied names. Do not add numbering yourself. Do not translate. Return exactly this JSON shape and no commentary: {"bookName":"Name","chapters":[{"id":1,"title":"Fractions"}]}. Return one chapter entry for every supplied editable chapter ID.

${JSON.stringify(input)}`;
};
