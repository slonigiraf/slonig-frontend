// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept, BookSubject } from '@slonigiraf/db';

export interface SortedChapterConceptIndexes {
  conceptIndexes: number[];
}

export function sortChapterConceptsPrompt (
  chapterTitle: string,
  concepts: Array<Pick<BookConcept, 'bookPage' | 'description' | 'title'>>,
  bookSubject: BookSubject | undefined,
  bookLanguage: string | undefined,
  learnerAge: number | undefined
): string {
  return `Order one chapter's existing concepts into a pedagogical progression based on the learner's zone of proximal development (ZPD).

The learner is age ${Number.isSafeInteger(learnerAge) ? learnerAge : 'unknown'}. The book language is ${bookLanguage || 'unknown'} and the book topic/subject is ${bookSubject || 'unknown'}. Chapter: ${chapterTitle || '(untitled)'}.

Interpret ZPD here as the sequence that makes each next concept learnable with minimal support from concepts already placed earlier. This stage does not know the individual learner's measured mastery, so use age-appropriate assumed background knowledge plus prerequisite relationships among the concepts in this chapter.

Ordering rules, in priority order:
1. Put concepts that are prerequisites for several other chapter concepts before the concepts that depend on them.
2. At each step, prefer a concept whose chapter-local prerequisites are already earlier in the sequence, so the next concept lies just beyond what the learner could reasonably know at that point.
3. Prefer concrete, directly observable, vocabulary, representation, and single-step ideas before abstractions, generalizations, multi-step procedures, and applications when that reflects a real prerequisite relationship.
4. Keep tightly related prerequisite/dependent concepts close together when possible.
5. Do not sort by source page, title alphabetically, or the current order merely because it is the current order. Source page is evidence about where the book introduces a concept, not evidence of ideal teaching order.
6. Do not add, remove, merge, split, rename, or rewrite concepts. Return every conceptIndex exactly once.
7. When two concepts are genuinely independent and equally appropriate, preserve their current relative order to avoid arbitrary churn.

Existing concepts (conceptIndex is zero-based; sourcePage is informational only):
${JSON.stringify(concepts.map(({ bookPage, description, title }, conceptIndex) => ({ conceptIndex, sourcePage: bookPage[1] || null, title, description })))}

Return only valid JSON in this exact shape:
{"conceptIndexes":[2,0,1]}

The conceptIndexes array must be a complete permutation of 0 through ${Math.max(0, concepts.length - 1)}. Return {"conceptIndexes":[]} when there are no concepts.`;
}

export function parseSortedChapterConceptIndexes (content: string, conceptCount: number): SortedChapterConceptIndexes {
  if (!Number.isSafeInteger(conceptCount) || conceptCount < 0) {
    throw new Error('Invalid concept count for Sort Concepts.');
  }

  const json = content.replace(/^```json\s*|\s*```$/gi, '').trim();
  let parsed: Partial<SortedChapterConceptIndexes>;

  try {
    parsed = JSON.parse(json) as Partial<SortedChapterConceptIndexes>;
  } catch {
    throw new Error('OpenRouter returned invalid Sort Concepts data.');
  }

  if (!Array.isArray(parsed.conceptIndexes) || parsed.conceptIndexes.length !== conceptCount) {
    throw new Error('OpenRouter returned invalid Sort Concepts data.');
  }

  const conceptIndexes = parsed.conceptIndexes;

  if (conceptIndexes.some((value) => typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0 || value >= conceptCount)) {
    throw new Error('OpenRouter returned invalid Sort Concepts data.');
  }

  if (new Set(conceptIndexes).size !== conceptCount) {
    throw new Error('OpenRouter returned invalid Sort Concepts data.');
  }

  return { conceptIndexes };
}
