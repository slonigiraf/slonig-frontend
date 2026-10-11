// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';

import { assertSupportedLearnerTextMarkup } from '../learnerTextMarkup.js';
import { formatSentenceCaseTitle } from '../naming/sentenceCase.js';

export const FIX_CONCEPTS_RUNS = 2;


export interface MissingChapterConcept {
  description: string;
  pageNumber: number;
  title: string;
}

export interface FixChapterConceptsResult {
  concepts: MissingChapterConcept[];
  removeConceptIndexes: number[];
}

export interface FixedConcept {
  description: string;
  title: string;
}

export function parseFixedConcept (content: string, language = 'en'): FixedConcept {
  const json = content.replace(/^```json\s*|\s*```$/gi, '').trim();
  let parsed: Partial<FixedConcept>;

  try {
    parsed = JSON.parse(json) as Partial<FixedConcept>;
  } catch {
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as Partial<FixedConcept>;
  }

  if (typeof parsed.title !== 'string' || typeof parsed.description !== 'string' || !parsed.title.trim() || !parsed.description.trim()) {
    throw new Error('OpenRouter returned invalid single Concept repair data.');
  }

  assertSupportedLearnerTextMarkup(parsed.title, 'Concept title');
  assertSupportedLearnerTextMarkup(parsed.description, 'Concept description');

  return { description: parsed.description.trim(), title: formatSentenceCaseTitle(parsed.title, language) };
}

export function chapterLevelMissingConcept (
  bookId: BookConcept['bookPage'][0],
  chapterId: BookConcept['chapterId'],
  concept: MissingChapterConcept,
  attempt = 0,
  language = 'en'
): Pick<BookConcept, 'attempt' | 'bookPage' | 'chapterId' | 'description' | 'title'> {
  return {
    attempt,
    bookPage: [bookId, concept.pageNumber],
    chapterId,
    description: concept.description,
    title: formatSentenceCaseTitle(concept.title, language)
  };
}

export function parseMissingChapterConcepts (content: string, existingConcepts: Array<Pick<BookConcept, 'description' | 'title'>> = [], allowedPageNumbers?: Set<number>, language = 'en'): FixChapterConceptsResult {
  const json = content.replace(/^```json\s*|\s*```$/gi, '').trim();
  let parsed: Partial<FixChapterConceptsResult>;

  try {
    parsed = JSON.parse(json) as Partial<FixChapterConceptsResult>;
  } catch {
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as Partial<FixChapterConceptsResult>;
  }

  if (!Array.isArray(parsed.concepts) || (parsed.removeConceptIndexes !== undefined && !Array.isArray(parsed.removeConceptIndexes))) {
    throw new Error('OpenRouter returned invalid Fix Concepts data.');
  }

  const concepts = parsed.concepts.flatMap((value): MissingChapterConcept[] => {
    if (typeof value !== 'object' || value === null) {
      return [];
    }

    const { description, pageNumber, title } = value as Partial<MissingChapterConcept>;

    if (typeof title !== 'string' || typeof description !== 'string' || typeof pageNumber !== 'number' || !Number.isSafeInteger(pageNumber) || (allowedPageNumbers && !allowedPageNumbers.has(pageNumber))) {
      return [];
    }

    const trimmedTitle = title.trim();
    const trimmedDescription = description.trim();

    if (!trimmedTitle || !trimmedDescription) {
      return [];
    }

    assertSupportedLearnerTextMarkup(trimmedTitle, 'Fix concepts title');
    assertSupportedLearnerTextMarkup(trimmedDescription, 'Fix concepts description');

    return [{ description: trimmedDescription, pageNumber, title: formatSentenceCaseTitle(trimmedTitle, language) }];
  });

  const removeConceptIndexes = Array.from(new Set((parsed.removeConceptIndexes ?? []).flatMap((value): number[] =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < existingConcepts.length ? [value] : []
  ))).sort((a, b) => a - b);

  return { concepts, removeConceptIndexes };
}

/** An unsaved inventory, incorporating each completed Fix concepts pass. */
export interface FixChapterConceptsDraft {
  inventory: BookConcept[];
  removed: BookConcept[];
}

export function applyFixChapterConceptsPass (
  draft: FixChapterConceptsDraft,
  fixes: FixChapterConceptsResult,
  bookId: number,
  chapterId: BookConcept['chapterId'],
  language = 'en'
): FixChapterConceptsDraft {
  // Removal indexes refer to the inventory supplied to THIS pass, not the
  // original persisted inventory. Unsaved additions may also be removed.
  const indexesToRemove = new Set(fixes.removeConceptIndexes);
  const removedInPass = draft.inventory.filter((_, index) => indexesToRemove.has(index) && _.id !== undefined);
  const retained = draft.inventory.filter((_, index) => !indexesToRemove.has(index));
  const added = fixes.concepts.map((concept): BookConcept => chapterLevelMissingConcept(bookId, chapterId, concept, 0, language));

  return { inventory: [...retained, ...added], removed: [...draft.removed, ...removedInPass] };
}

export function proposedFixChapterConcepts (draft: FixChapterConceptsDraft): MissingChapterConcept[] {
  return draft.inventory.flatMap(({ bookPage, description, id, title }): MissingChapterConcept[] => id === undefined
    ? [{ description, pageNumber: bookPage[1], title }]
    : []);
}
