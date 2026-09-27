// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept, BookSubject } from '@slonigiraf/db';

export interface DeduplicateConceptInput {
  chapterId: number;
  chapterTitle: string;
  conceptId: number;
  description: string;
  pageNumber?: number;
  title: string;
}

export interface DeduplicateConceptPair {
  deletedConceptId: number;
  keptConceptId: number;
}

interface DeduplicateConceptResponsePair {
  conceptIdA: number;
  conceptIdB: number;
}

interface DeduplicateConceptResponse {
  duplicatePairs: DeduplicateConceptResponsePair[];
}

function isRecord (value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseResponse (content: string): unknown {
  const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();

  try {
    return JSON.parse(json) as unknown;
  } catch {
    return JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as unknown;
  }
}

export function deduplicateConceptsPrompt (
  concepts: DeduplicateConceptInput[],
  bookSubject: BookSubject | undefined,
  bookLanguage: string | undefined,
  learnerAge: number | undefined
): string {
  return `Find clear duplicate concepts across the entire book.

The book language is ${bookLanguage || 'unknown'}, the book topic/subject is ${bookSubject || 'unknown'}, and the learner age is ${Number.isSafeInteger(learnerAge) ? learnerAge : 'unknown'}.

A duplicate means two concepts anywhere in the book that teach essentially the same independently learnable knowledge unit. They may be in the same chapter or in different chapters. Be conservative. Report a pair only when the concepts are near-equivalent in meaning, not merely related, prerequisite/dependent, examples of one another, broader/narrower versions, neighboring skills, or concepts that share vocabulary. Different mathematical procedures, cases, properties, representations, or levels of generality are not duplicates unless they truly express the same learning target.

Compare title AND description. Ignore superficial wording differences. Do not rewrite, merge, add, or otherwise modify concepts.

The application, not you, decides which duplicate is deleted. For every connected duplicate set, it keeps one canonical concept: the concept with the LOWEST chapterId, breaking ties by the LOWEST conceptId. Every other concept in that duplicate set is proposed for deletion. Your job is only to identify duplicate pairs.

Concept inventory:
${JSON.stringify(concepts.map(({ chapterId, chapterTitle, conceptId, description, pageNumber, title }) => ({ chapterId, chapterTitle, conceptId, pageNumber: pageNumber ?? null, title, description })))}

Return only valid JSON in this exact shape:
{"duplicatePairs":[{"conceptIdA":12,"conceptIdB":45}]}

Return {"duplicatePairs":[]} when no clear duplicates exist. Each id must be a conceptId from the supplied inventory.`;
}

export function parseDeduplicateConceptPairs (content: string, concepts: DeduplicateConceptInput[]): DeduplicateConceptPair[] {
  const parsed = parseResponse(content);

  if (!isRecord(parsed) || !Array.isArray(parsed.duplicatePairs)) {
    throw new Error('OpenRouter returned invalid Deduplicate Concepts data.');
  }

  const byId = new Map<number, DeduplicateConceptInput>();

  concepts.forEach((concept) => {
    if (!Number.isSafeInteger(concept.conceptId) || !Number.isSafeInteger(concept.chapterId) || byId.has(concept.conceptId)) {
      throw new Error('Deduplicate Concepts received an invalid concept inventory.');
    }

    byId.set(concept.conceptId, concept);
  });

  const adjacency = new Map<number, Set<number>>();

  parsed.duplicatePairs.forEach((value: unknown): void => {
    if (
      !isRecord(value) ||
      typeof value.conceptIdA !== 'number' ||
      !Number.isSafeInteger(value.conceptIdA) ||
      typeof value.conceptIdB !== 'number' ||
      !Number.isSafeInteger(value.conceptIdB) ||
      value.conceptIdA === value.conceptIdB
    ) {
      throw new Error('OpenRouter returned an invalid duplicate Concept pair.');
    }

    const conceptA = byId.get(value.conceptIdA);
    const conceptB = byId.get(value.conceptIdB);

    if (!conceptA || !conceptB) {
      throw new Error('OpenRouter returned a duplicate Concept pair containing a concept outside the supplied inventory.');
    }

    adjacency.set(value.conceptIdA, new Set([...(adjacency.get(value.conceptIdA) ?? []), value.conceptIdB]));
    adjacency.set(value.conceptIdB, new Set([...(adjacency.get(value.conceptIdB) ?? []), value.conceptIdA]));
  });

  const visited = new Set<number>();
  const result: DeduplicateConceptPair[] = [];

  for (const startId of adjacency.keys()) {
    if (visited.has(startId)) {
      continue;
    }

    const stack = [startId];
    const component: DeduplicateConceptInput[] = [];

    while (stack.length) {
      const conceptId = stack.pop() as number;

      if (visited.has(conceptId)) {
        continue;
      }

      visited.add(conceptId);
      const concept = byId.get(conceptId);

      if (concept) {
        component.push(concept);
      }

      for (const neighborId of adjacency.get(conceptId) ?? []) {
        if (!visited.has(neighborId)) {
          stack.push(neighborId);
        }
      }
    }

    if (component.length < 2) {
      continue;
    }

    component.sort((a, b) => a.chapterId - b.chapterId || a.conceptId - b.conceptId);
    const kept = component[0];

    component.slice(1).forEach((deleted) => {
      result.push({ deletedConceptId: deleted.conceptId, keptConceptId: kept.conceptId });
    });
  }

  return result.sort((a, b) => {
    const deletedA = byId.get(a.deletedConceptId) as DeduplicateConceptInput;
    const deletedB = byId.get(b.deletedConceptId) as DeduplicateConceptInput;

    return deletedA.chapterId - deletedB.chapterId || a.deletedConceptId - b.deletedConceptId;
  });
}

export function conceptDeduplicationInput (
  concept: Pick<BookConcept, 'bookPage' | 'chapterId' | 'description' | 'id' | 'title'>,
  chapter: { chapterId?: number; title: string }
): DeduplicateConceptInput | undefined {
  if (concept.id === undefined || chapter.chapterId === undefined || !Number.isSafeInteger(chapter.chapterId)) {
    return undefined;
  }

  const pageNumber = concept.bookPage[1];

  return {
    chapterId: chapter.chapterId,
    chapterTitle: chapter.title,
    conceptId: concept.id,
    description: concept.description,
    ...(pageNumber > 0 ? { pageNumber } : {}),
    title: concept.title
  };
}
