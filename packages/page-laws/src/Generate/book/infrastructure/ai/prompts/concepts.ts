// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { MATH_DISPLAY_REQUIREMENTS_PROMPT } from './shared.js';

export const BOOK_CHAPTER_EXTRACTION_PROMPT = `Read the complete supplied chapter as one unit and extract only the distinct concepts that are intentionally introduced or explained as new anywhere in this chapter. Chapter assignment is already known; do not identify, infer, or return a different chapter or section.

${MATH_DISPLAY_REQUIREMENTS_PROMPT}

Use the smallest useful knowledge unit as the unit of extraction. Each concept object must contain exactly one minimal independently teachable fact, definition, relationship, rule, property, operation, procedure, interpretation, or distinction. Prefer producing several small concepts over one broad concept whenever the source supports the smaller concepts. When uncertain whether one candidate contains one idea or several, split it.

Apply aggressive decomposition. A single concept must NOT combine:
- two named topics, terms, quantities, objects, rules, properties, or methods joined as "A and B", "A or B", "A/B", "A vs. B", or a comma-separated list;
- an umbrella topic together with one or more of its independently teachable subtopics;
- a definition together with a separate property, consequence, purpose, application, example type, exception, or method of using that thing;
- a cause together with a separately teachable effect, or multiple causes/effects that can each be stated independently;
- multiple properties, laws, cases, categories, conditions, transformations, representations, or strategies merely because the chapter presents them in one paragraph, table, diagram, or sequence;
- multiple steps that the chapter explicitly teaches as distinct reusable operations.

For example, do not return "Mean, median, and mode"; return separate concepts for mean, median, and mode when each is introduced. Do not return "Slope and y-intercept"; separate slope from y-intercept. Do not return "Definition and properties of a parallelogram"; separate the definition from each independently taught property. Do not return "Evaporation and condensation"; separate them. Do not hide bundling in the description: a narrow-looking title is still invalid if its description explains several separable ideas.

A concept may contain multiple words, clauses, symbols, or mechanical steps only when they are inseparable parts of one single meaning and splitting them would create fragments that are not useful knowledge on their own. A relationship itself can be one concept only when the relationship is the actual new idea being taught; do not use a relationship label as an excuse to bundle full explanations of both related topics.

Use narrow titles following the original language's capitalization conventions. For English, prefer sentence case ("This is an example of a title"): capitalize the first word, proper nouns and acronyms only. For other languages, follow native orthographic rules. Preserve mathematical symbols. Name only the one knowledge unit represented by that object. Avoid conjunctions, slashes, broad plural category titles, colon-separated bundles, or list-like titles when they connect separable ideas. Descriptions should normally make one central claim about that title. If a description needs a second independently meaningful sentence or clause to teach another fact, property, rule, condition, use, consequence, or case, create another concept instead. Examples may clarify the one concept but must not introduce an additional concept.

Do not emit a broad parent concept merely to summarize several child concepts when the parent adds no independently taught knowledge. If a section called "Properties of equality" teaches the addition property and multiplication property separately, emit the individual properties rather than a generic "Properties of equality" concept unless the chapter also explicitly teaches the general notion of an equality-preserving property as its own idea.

Granularity comes before deduplication: first split the material into minimal useful concepts, then deduplicate only true repetitions of the same minimal concept across the whole chapter. Closely related is not the same as duplicate. If two concepts answer different questions, state different facts, use different conditions, describe different directions, or could reasonably be taught or tested separately, keep them separate. If the same minimal concept is introduced, restated, expanded, exemplified, or referenced on multiple pages, return it exactly once. Set pageNumber to the earliest supplied page where that exact minimal concept is actually introduced as new, not the page with the longest or clearest later explanation.

Before returning JSON, perform an atomicity audit on every object. Ask: "Could a learner know one meaningful part of this title or description while not knowing another meaningful part?" If yes, split it again. Then ask whether the title contains multiple coordinated items and whether the description contains more than one independently testable claim. Keep splitting until the answer to both is no. Favor over-splitting over under-splitting, except when splitting would produce meaningless fragments of one indivisible definition, relationship, or procedure.

Do not include concepts that the chapter assumes the reader already knows, merely reviews, references from earlier chapters, or uses only in exercises/examples without introducing them. Ignore exercises, questions, problems, drills, review tasks, and their solutions completely: do not parse, solve, summarize, or return them.

Return only valid JSON in this exact shape, keeping the original language of the input:
{"concepts":[{"title":"New concept","description":"One focused explanation of that concept","pageNumber":12}]}

Every pageNumber must be one of the supplied page numbers. Use an empty array when no new concepts are present. Keep each concept description focused on the explanation of the concept itself; do not turn an exercise statement into a concept description. Use only <kx>...</kx> as mathematical delimiters. Do not use \\(...\\), \\[...\\], $...$, or $$...$$ anywhere in the returned text. For example, write "<kx>n</kx>", never "\\(<kx>n</kx>\\)" or "\\(n\\)". Escape every backslash in mathematical notation so the result remains valid JSON. Do not add markdown or any text outside the JSON.`;

export const BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT = (
  chapterTitle: string,
  pages: Array<{ imageNames: string[]; pageNumber: number; text: string }>,
  learnerAge?: number
): string => {
  return `${BOOK_CHAPTER_EXTRACTION_PROMPT}

Chapter: ${chapterTitle}

The learner age is ${Number.isSafeInteger(learnerAge) ? learnerAge : 'unknown'}. Use this age to choose age-appropriate wording, assumed background knowledge, and conceptual depth in titles/descriptions. Do NOT omit a concept that the chapter explicitly teaches merely because it seems advanced for that age; source coverage has priority.

The following ordered pages and ${pages.reduce((count, { imageNames }) => count + imageNames.length, 0)} attached image(s) were extracted from Mathpix MMD ZIPs. Treat all supplied pages as one chapter-wide context. Use attached images only when they contain information needed to understand a concept introduced in this chapter. Ignore exercise-only images and exercise/solution content.

${pages.map(({ imageNames, pageNumber, text }) => `--- page ${pageNumber} ---\nAttached page images: ${imageNames.length ? imageNames.join(', ') : 'none'}\n${text}`).join('\n\n')}`;
};
