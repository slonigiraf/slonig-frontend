// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept, BookPage, Exercise } from '@slonigiraf/db';
import { deleteAbilities, deleteBookConcept, deleteExercise, getBookConceptsForBookPage, getExercisesForBookPage } from '@slonigiraf/db';

import { conceptBelongsToChapter } from '../../domain/chapters/refineChapters.js';
import type { ConceptChapterNavigationItem } from '../../domain/concepts/conceptRecognition.js';
import { sortExercisesForDisplay } from '../../domain/concepts/learningOrder.js';
import { embeddingCosineDistance } from '../../domain/standards/standards.js';
import { stripMarkdownImageReferences } from '../../infrastructure/pdf/bookImageRefs.js';
import type { ConceptEmbeddingHeatmapEntry, ExerciseChapterNavigationItem } from '../../../shared/types/bookWorkspace.js';

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
  return [
    ...(await Promise.all(Array.from(new Set(pageNumbers)).map((pageNumber) => getBookConceptsForBookPage(bookId, pageNumber)))).flat(),
    ...await getBookConceptsForBookPage(bookId, 0)
  ];
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

export function singleExerciseRepairInput (language: string, exercise: Exercise, chapterTitle: string, learnerAge?: number): unknown {
  return {
    bookLanguage: language,
    ...(learnerAge === undefined ? {} : { learnerAge }),
    exercises: [{
      conceptId: exercise.conceptId,
      exercise: {
        description: stripMarkdownImageReferences(exercise.description),
        imageDescription: exercise.imageDescription ?? '',
        solution: exercise.solution ?? '',
        solutionImageDescription: exercise.solutionImageDescription ?? '',
        title: exercise.title
      },
      id: exercise.id,
      index: 0
    }],
    chapterTitle
  };
}

export function exerciseForPageReplacement ({ conceptId, description, displayOrder, imageDescription, solution, solutionImageDescription, source, title }: Exercise): Omit<Exercise, 'bookPage' | 'id'> {
  return {
    conceptId,
    displayOrder,
    description: stripMarkdownImageReferences(description),
    imageDescription,
    solution,
    solutionImageDescription,
    source,
    title
  };
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

export function exerciseChapterNavigationKey ({ id, pageNumbers, title }: ExerciseChapterNavigationItem): string {
  return `${id ?? title}\n${pageNumbers.join(',')}`;
}

export function conceptsForExerciseChapter (concepts: BookConcept[], chapter: ExerciseChapterNavigationItem): BookConcept[] {
  return sortConceptsForDisplay(concepts.filter((concept) => conceptBelongsToChapter(concept, { chapterId: chapter.id, pageNumbers: chapter.pageNumbers })));
}

export function exercisesForExerciseChapter (
  pageRows: Array<{ exercises: Exercise[]; pageNumber: number }>,
  concepts: BookConcept[],
  chapter: ExerciseChapterNavigationItem
): Exercise[] {
  const conceptIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));

  return sortExercisesForDisplay(pageRows.flatMap(({ exercises, pageNumber }) => exercises.filter(({ conceptId }) =>
    conceptId === undefined ? chapter.pageNumbers.includes(pageNumber) : conceptIds.has(conceptId)
  )));
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

export const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

export async function deleteConceptAndDependencies (bookId: number, concept: BookConcept, pageNumbers: number[]): Promise<void> {
  if (concept.id === undefined) {
    throw new Error('Unable to delete a concept without an id.');
  }

  const exercises = (await Promise.all(pageNumbers.map((conceptPageNumber) => getExercisesForBookPage([bookId, conceptPageNumber])))).flat();
  const referencedExercises = exercises.filter(({ conceptId, id }) => id !== undefined && conceptId === concept.id);

  for (const exercise of referencedExercises) {
    await deleteAbilities(exerciseAbilityModuleId(bookId, exercise.id as number));
    await deleteExercise(exercise.id as number);
  }

  await deleteBookConcept(concept.id);
}
