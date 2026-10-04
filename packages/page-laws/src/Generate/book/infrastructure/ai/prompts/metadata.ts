// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const BOOK_LANGUAGE_DETECTION_PROMPT = (pageTexts: Array<{ pageNumber: number; text: string }>): string => {
  return `Identify the primary natural language of this book using only the supplied Mathpix MMD text from its middle pages. Ignore formulas, code, proper names, citations, isolated foreign phrases, and bilingual glossary fragments when deciding the main prose language. If the pages contain multiple languages, choose the language used for the majority of explanatory or instructional prose.

Return only valid JSON in this exact shape using a lowercase ISO 639-1 two-letter code:
{"language":"en"}

Middle-page MMD text:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
};

export const BOOK_SUBJECT_DETECTION_PROMPT = (bookLanguage: string, pageTexts: Array<{ pageNumber: number; text: string }>): string => {
  return `Classify the primary school-book category using only the supplied Mathpix MMD text from the book's middle pages. Choose exactly one of these stored values: en-math, en-ela, en-science, na.

The already-detected primary natural language of the book is ${bookLanguage}. Subject model classification is only used for English books; non-English books are assigned na before this prompt is called.

Classification rules for English books:
- en-math: mathematics instruction or mathematical problem solving.
- en-ela: English Language Arts, including English reading, literature, grammar, vocabulary, or writing instruction.
- en-science: natural or physical science such as biology, chemistry, physics, earth science, or general science.
- na: every subject outside those categories, including social studies, history, geography, computing, arts, business, and mixed/general material without a clear en-math, en-ela, or en-science majority.

Judge the dominant instructional subject, not isolated examples, formulas, passages, or chapter titles.

Return only valid JSON in this exact shape:
{"subject":"en-math"}

Middle-page MMD text:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
};

export const BOOK_AGE_DETECTION_PROMPT = (bookLanguage: string, bookSubject: string, pageTexts: Array<{ pageNumber: number; text: string }>): string => {
  return `Determine the single most appropriate typical learner age, in whole years, for learning the supplied educational material. Use the actual prerequisite knowledge, conceptual difficulty, abstraction, vocabulary, reading complexity, mathematical/scientific sophistication, and expected learner independence shown by the material. Do not infer age from visual design, topic popularity, publication metadata, or isolated mature/child-friendly subject matter alone.

The already-detected primary language is ${bookLanguage} and the stored subject category is ${bookSubject}. The supplied pages are representative samples from different parts of the book, not necessarily one continuous section.

Return valid JSON containing exactly one property named "age". Its value must be one integer from 3 through 30.

Choose the age based only on the demonstrated prerequisite knowledge and difficulty. Do not default to a common school age when the evidence is ambiguous, and do not copy a number from these instructions.

Do not return an age range, grade, explanation, confidence score, additional properties, or any text outside the JSON.

Representative MMD text pages:
${pageTexts.map(({ pageNumber, text }) => `--- page ${pageNumber} ---\n${text}`).join('\n\n')}`;
};
