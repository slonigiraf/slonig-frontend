// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept, BookPage } from '@slonigiraf/db';
import { deleteAbilities, deleteBookConcept, getBookConceptsForBookPage } from '@slonigiraf/db';

import { conceptBelongsToChapter } from '../../domain/chapters/refineChapters.js';
import type { ConceptChapterNavigationItem } from '../../domain/concepts/conceptRecognition.js';
import { embeddingCosineDistance } from '../../domain/standards/standards.js';
import type { ConceptEmbeddingHeatmapEntry } from '../../../shared/types/bookWorkspace.js';

export function conceptDisplayOrder (concept: BookConcept): number | undefined {
  return Number.isFinite(concept.displayOrder) ? concept.displayOrder : undefined;
}

export function sortConceptsForDisplay (concepts: BookConcept[]): BookConcept[] {
  return concepts
    .map((concept, index) => ({ concept, index, order: conceptDisplayOrder(concept) }))
    .sort((a, b) => (a.order ?? a.index) - (b.order ?? b.index) || a.index - b.index)
    .map(({ concept }) => concept);
}

export async function getBookConceptInventory (bookId: number, pageNumbers: Iterable<number>): Promise<BookConcept[]> {
  // Manually added Concepts can have page 0. Include it exactly once,
  // even if a caller already includes 0 among the requested page numbers.
  const allPageNumbers = new Set(pageNumbers);

  allPageNumbers.add(0);

  return (await Promise.all(Array.from(allPageNumbers, (pageNumber) => getBookConceptsForBookPage(bookId, pageNumber)))).flat();
}

export function conceptsForNavigationChapter (concepts: BookConcept[], chapter: ConceptChapterNavigationItem): BookConcept[] {
  return sortConceptsForDisplay(concepts.filter((concept) => conceptBelongsToChapter(concept, chapter)));
}

export function conceptInsertionDisplayOrder (concepts: BookConcept[], insertionIndex: number): number {
  const previousIndex = insertionIndex - 1;
  const previousOrder = previousIndex >= 0
    ? conceptDisplayOrder(concepts[previousIndex]) ?? previousIndex
    : undefined;
  const nextOrder = insertionIndex < concepts.length
    ? conceptDisplayOrder(concepts[insertionIndex]) ?? insertionIndex
    : undefined;

  if (previousOrder === undefined) {
    return (nextOrder ?? 0) - 1;
  }

  if (nextOrder === undefined) {
    return previousOrder + 1;
  }

  return previousOrder + ((nextOrder - previousOrder) / 2);
}

export function conceptDisplayPage (concept: BookConcept): number | undefined {
  const pageNumber = concept.bookPage[1];

  return pageNumber > 0 ? pageNumber : undefined;
}

export function analysisPageNumbers (pages: BookPage[]): number[] {
  return pages.flatMap(({ excludedFromAnalysis, pageNumber }) => excludedFromAnalysis ? [] : [pageNumber]);
}

export function conceptEmbeddingDistanceMatrix (entries: ConceptEmbeddingHeatmapEntry[]): Array<Array<number | undefined>> {
  const matrix = Array.from({ length: entries.length }, () => Array<number | undefined>(entries.length));

  for (let row = 0; row < entries.length; row++) {
    matrix[row][row] = 0;

    for (let column = row + 1; column < entries.length; column++) {
      const left = entries[row];
      const right = entries[column];
      const distance = embeddingCosineDistance(left.embedding, right.embedding, left.norm, right.norm);

      matrix[row][column] = distance;
      matrix[column][row] = distance;
    }
  }

  return matrix;
}

export function conceptReferenceKey ({ description, id, title }: Pick<BookConcept, 'description' | 'id' | 'title'>): string {
  return id === undefined ? `content:${title}\n${description}` : `id:${id}`;
}

export function conceptContentKey ({ description, title }: Pick<BookConcept, 'description' | 'title'>): string {
  return `${title.trim().toLocaleLowerCase()}\n${description.trim().toLocaleLowerCase()}`;
}

export function matchingLiveConcept (displayed: BookConcept, live: BookConcept[]): BookConcept | undefined {
  if (displayed.id !== undefined) {
    const byId = live.find(({ id }) => id === displayed.id);

    if (byId) {
      return byId;
    }
  }

  const contentKey = conceptContentKey(displayed);
  const contentMatches = live.filter((candidate) => conceptContentKey(candidate) === contentKey);

  return contentMatches.length === 1 ? contentMatches[0] : undefined;
}

export const conceptAbilityModuleId = (bookId: number, conceptId: number): string => `book-${bookId}-concept-${conceptId}`;

export async function deleteConceptAndDependencies (bookId: number, concept: BookConcept, _pageNumbers: number[]): Promise<void> {
  if (concept.id === undefined) {
    throw new Error('Unable to delete a concept without an id.');
  }

  await deleteAbilities(conceptAbilityModuleId(bookId, concept.id));
  await deleteBookConcept(concept.id);
}
