// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';


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

export function parseFixedConcept (content: string): FixedConcept {
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

  return { description: parsed.description.trim(), title: parsed.title.trim() };
}

export function chapterLevelMissingConcept (
  bookId: BookConcept['bookPage'][0],
  chapterId: BookConcept['chapterId'],
  concept: MissingChapterConcept,
  attempt = 0
): Pick<BookConcept, 'attempt' | 'bookPage' | 'chapterId' | 'description' | 'title'> {
  return {
    attempt,
    bookPage: [bookId, concept.pageNumber],
    chapterId,
    description: concept.description,
    title: concept.title
  };
}

export function parseMissingChapterConcepts (content: string, existingConcepts: Array<Pick<BookConcept, 'description' | 'title'>> = [], allowedPageNumbers?: Set<number>): FixChapterConceptsResult {
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

    return [{ description: trimmedDescription, pageNumber, title: trimmedTitle }];
  });

  const removeConceptIndexes = Array.from(new Set((parsed.removeConceptIndexes ?? []).flatMap((value): number[] =>
    typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value < existingConcepts.length ? [value] : []
  ))).sort((a, b) => a - b);

  return { concepts, removeConceptIndexes };
}
