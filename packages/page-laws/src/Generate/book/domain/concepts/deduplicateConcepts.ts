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

export interface DeduplicateConceptCandidatePair {
  conceptIdA: number;
  conceptIdB: number;
  cosineDistance: number;
}

export const DEDUPLICATION_MAX_COSINE_DISTANCE = 0.3;
export const DEDUPLICATION_MAX_NEIGHBORS_PER_CONCEPT = 5;

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
  candidates: DeduplicateConceptCandidatePair[],
  bookSubject: BookSubject | undefined,
  bookLanguage: string | undefined,
  learnerAge: number | undefined
): string {
  const candidateIds = new Set(candidates.flatMap(({ conceptIdA, conceptIdB }) => [conceptIdA, conceptIdB]));
  const candidateConcepts = concepts.filter(({ conceptId }) => candidateIds.has(conceptId));

  return `Confirm clear duplicate concepts from an embedding-generated candidate list.

The book language is ${bookLanguage || 'unknown'}, the book topic/subject is ${bookSubject || 'unknown'}, and the learner age is ${Number.isSafeInteger(learnerAge) ? learnerAge : 'unknown'}.

The embedding stage selected semantically close candidate pairs for this deduplication pass. Review ONLY the supplied candidate pairs. A candidate is not automatically a duplicate: confirm a pair only when both concepts teach essentially the same independently learnable knowledge unit. Be conservative. Reject pairs that are merely related, prerequisite/dependent, examples of one another, broader/narrower versions, neighboring skills, or concepts that share vocabulary. Different mathematical procedures, cases, properties, representations, or levels of generality are not duplicates unless they truly express the same learning target.

Compare title AND description. Ignore superficial wording differences. Do not rewrite, merge, add, or otherwise modify concepts. Do not return a pair that is absent from candidatePairs.

The application, not you, decides which confirmed duplicate is deleted. For every connected confirmed duplicate set, it keeps one canonical concept: the concept with the LOWEST chapterId, breaking ties by the LOWEST conceptId. Every other concept in that duplicate set is proposed for deletion. Your job is only to confirm which embedding candidates are true duplicate pairs.

Candidate concept inventory:
${JSON.stringify(candidateConcepts.map(({ chapterId, chapterTitle, conceptId, description, pageNumber, title }) => ({ chapterId, chapterTitle, conceptId, pageNumber: pageNumber ?? null, title, description })))}

Candidate pairs (smaller cosineDistance means semantically closer):
${JSON.stringify(candidates.map(({ conceptIdA, conceptIdB, cosineDistance }) => ({ conceptIdA, conceptIdB, cosineDistance: Number(cosineDistance.toFixed(4)) })))}

Return only valid JSON in this exact shape:
{"duplicatePairs":[{"conceptIdA":12,"conceptIdB":45}]}

Return {"duplicatePairs":[]} when none of the candidate pairs are clear duplicates. Each id must be a conceptId from the supplied candidate inventory, and every returned pair must exactly match one of the supplied candidatePairs.`;
}

function vectorNorm (embedding: number[]): number {
  return Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0));
}

function cosineDistance (left: number[], right: number[]): number | undefined {
  if (!left.length || left.length !== right.length) {
    return undefined;
  }

  const leftNorm = vectorNorm(left);
  const rightNorm = vectorNorm(right);

  if (!leftNorm || !rightNorm) {
    return undefined;
  }

  let dot = 0;

  for (let index = 0; index < left.length; index++) {
    dot += left[index] * right[index];
  }

  const similarity = dot / (leftNorm * rightNorm);

  return Number.isFinite(similarity) ? Math.max(0, Math.min(2, 1 - similarity)) : undefined;
}

function deduplicateConceptCandidatesFiltered (
  concepts: DeduplicateConceptInput[],
  embeddings: ReadonlyMap<number, number[]>,
  pairAllowed: (left: DeduplicateConceptInput, right: DeduplicateConceptInput) => boolean,
  maxDistance = DEDUPLICATION_MAX_COSINE_DISTANCE,
  maxNeighborsPerConcept = DEDUPLICATION_MAX_NEIGHBORS_PER_CONCEPT
): DeduplicateConceptCandidatePair[] {
  const byPair = new Map<string, DeduplicateConceptCandidatePair>();

  concepts.forEach((concept, conceptIndex) => {
    const sourceEmbedding = embeddings.get(concept.conceptId);

    if (!sourceEmbedding?.length) {
      return;
    }

    const nearest = concepts.flatMap((other, otherIndex) => {
      if (otherIndex === conceptIndex || !pairAllowed(concept, other)) {
        return [];
      }

      const otherEmbedding = embeddings.get(other.conceptId);
      const distance = otherEmbedding ? cosineDistance(sourceEmbedding, otherEmbedding) : undefined;

      return distance !== undefined && distance <= maxDistance
        ? [{ distance, other }]
        : [];
    }).sort((a, b) => a.distance - b.distance || a.other.conceptId - b.other.conceptId)
      .slice(0, Math.max(1, maxNeighborsPerConcept));

    nearest.forEach(({ distance, other }) => {
      const conceptIdA = Math.min(concept.conceptId, other.conceptId);
      const conceptIdB = Math.max(concept.conceptId, other.conceptId);
      const key = `${conceptIdA}:${conceptIdB}`;
      const existing = byPair.get(key);

      if (!existing || distance < existing.cosineDistance) {
        byPair.set(key, { conceptIdA, conceptIdB, cosineDistance: distance });
      }
    });
  });

  return Array.from(byPair.values()).sort((a, b) => a.cosineDistance - b.cosineDistance || a.conceptIdA - b.conceptIdA || a.conceptIdB - b.conceptIdB);
}

export function deduplicateConceptCandidates (
  concepts: DeduplicateConceptInput[],
  embeddings: ReadonlyMap<number, number[]>,
  maxDistance = DEDUPLICATION_MAX_COSINE_DISTANCE,
  maxNeighborsPerConcept = DEDUPLICATION_MAX_NEIGHBORS_PER_CONCEPT
): DeduplicateConceptCandidatePair[] {
  return deduplicateConceptCandidatesFiltered(concepts, embeddings, () => true, maxDistance, maxNeighborsPerConcept);
}

export function deduplicateConceptCandidatesWithinChapters (
  concepts: DeduplicateConceptInput[],
  embeddings: ReadonlyMap<number, number[]>,
  maxDistance = DEDUPLICATION_MAX_COSINE_DISTANCE,
  maxNeighborsPerConcept = DEDUPLICATION_MAX_NEIGHBORS_PER_CONCEPT
): DeduplicateConceptCandidatePair[] {
  return deduplicateConceptCandidatesFiltered(concepts, embeddings, (left, right) => left.chapterId === right.chapterId, maxDistance, maxNeighborsPerConcept);
}

export function deduplicateConceptCandidatesAcrossChapters (
  concepts: DeduplicateConceptInput[],
  embeddings: ReadonlyMap<number, number[]>,
  maxDistance = DEDUPLICATION_MAX_COSINE_DISTANCE,
  maxNeighborsPerConcept = DEDUPLICATION_MAX_NEIGHBORS_PER_CONCEPT
): DeduplicateConceptCandidatePair[] {
  return deduplicateConceptCandidatesFiltered(concepts, embeddings, (left, right) => left.chapterId !== right.chapterId, maxDistance, maxNeighborsPerConcept);
}

export function parseDeduplicateConceptPairs (content: string, concepts: DeduplicateConceptInput[], candidates?: DeduplicateConceptCandidatePair[]): DeduplicateConceptPair[] {
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
  const allowedPairs = candidates ? new Set(candidates.map(({ conceptIdA, conceptIdB }) => `${Math.min(conceptIdA, conceptIdB)}:${Math.max(conceptIdA, conceptIdB)}`)) : undefined;

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

    if (allowedPairs && !allowedPairs.has(`${Math.min(value.conceptIdA, value.conceptIdB)}:${Math.max(value.conceptIdA, value.conceptIdB)}`)) {
      throw new Error('OpenRouter returned a duplicate Concept pair outside the embedding candidate list.');
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
