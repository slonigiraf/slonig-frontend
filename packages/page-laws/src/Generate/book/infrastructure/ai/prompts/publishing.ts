// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const COURSE_NAMES_PROMPT = (input: unknown): string => {
  return `Correct and improve the book name and each editable chapter name using only the ordered skill-template titles as evidence. Keep names concise, specific, and in the same language as the skill-template titles. Follow that language's native capitalization rules for the Course and ALL Module titles. For English, use sentence case ("This is an example of a title"): capitalize the first word, proper nouns, and acronyms only. For other languages, follow native orthographic rules; never impose English title case. Strip any leading chapter number or prefix, e.g. "Chapter 2: Fractions" must become "Fractions". Do not translate. Return exactly this JSON shape and no commentary: {"bookName":"Name","chapters":[{"id":1,"title":"Chapter name"}]}. Return one chapter entry for every supplied editable chapter ID.

${JSON.stringify(input)}`;
};
