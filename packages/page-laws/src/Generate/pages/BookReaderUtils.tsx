// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, Exercise } from '@slonigiraf/db';
import { deleteAbilities, deleteBookConcept, deleteExercise, getBookConceptsForBookPage, getExercisesForBookPage } from '@slonigiraf/db';
import { type MissingChapterConcept } from '../book/processing/concepts/fixConcepts.js';
import { type FixConceptsChapterStatuses } from '../book/runtime/fixConceptsProgress.js';
import { conceptBelongsToChapter } from '../book/processing/chapters/refineChapters.js';
import { stripMarkdownImageReferences } from '../book/processing/source/bookImageRefs.js';
import { type ConceptChapterNavigationItem } from '../book/processing/concepts/conceptRecognition.js';
import { sortExercisesForDisplay } from '../book/processing/concepts/learningOrder.js';
import { embeddingCosineDistance } from '../book/processing/standards/standards.js';
import { type PipelineAction } from './Skills.js';

function conceptDisplayOrder (concept: BookConcept): number | undefined {
  return Number.isFinite(concept.displayOrder) ? concept.displayOrder : undefined;
}

function sortConceptsForDisplay (concepts: BookConcept[]): BookConcept[] {
  return concepts
    .map((concept, index) => ({ concept, index, order: conceptDisplayOrder(concept) }))
    .sort((a, b) => (a.order ?? a.index) - (b.order ?? b.index) || a.index - b.index)
    .map(({ concept }) => concept);
}

async function getBookConceptInventory (bookId: number, pageNumbers: Iterable<number>): Promise<BookConcept[]> {
  return [
    ...(await Promise.all(Array.from(new Set(pageNumbers)).map((pageNumber) => getBookConceptsForBookPage(bookId, pageNumber)))).flat(),
    ...await getBookConceptsForBookPage(bookId, 0)
  ];
}

function conceptsForNavigationChapter (concepts: BookConcept[], chapter: ConceptChapterNavigationItem): BookConcept[] {
  return sortConceptsForDisplay(concepts.filter((concept) => conceptBelongsToChapter(concept, chapter)));
}

function conceptInsertionDisplayOrder (concepts: BookConcept[], insertionIndex: number): number {
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

function conceptDisplayPage (concept: BookConcept): number | undefined {
  const pageNumber = concept.bookPage[1];

  return pageNumber > 0 ? pageNumber : undefined;
}

function analysisPageNumbers (pages: BookPage[]): number[] {
  return pages.flatMap(({ excludedFromAnalysis, pageNumber }) => excludedFromAnalysis ? [] : [pageNumber]);
}

const pageSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-page`;

function getSessionPage(bookId: number): number {
  try {
    const value = Number(sessionStorage.getItem(pageSessionKey(bookId)));

    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

function storeSessionPage(bookId: number, pageNumber: number): void {
  try {
    sessionStorage.setItem(pageSessionKey(bookId), String(pageNumber));
  } catch {
    // Session storage may be unavailable in privacy-restricted browser contexts.
  }
}

const recognitionAttemptSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-recognition-attempted`;

function getSessionRecognitionAttempted(bookId: number): boolean {
  try {
    return sessionStorage.getItem(recognitionAttemptSessionKey(bookId)) === 'true';
  } catch {
    return false;
  }
}

function storeSessionRecognitionAttempted(bookId: number): void {
  try {
    sessionStorage.setItem(recognitionAttemptSessionKey(bookId), 'true');
  } catch {
    // Session storage may be unavailable in privacy-restricted browser contexts.
  }
}

type ExerciseEditableFields = Pick<Exercise, 'description' | 'imageDescription' | 'solution' | 'solutionImageDescription' | 'title'>;

function singleExerciseRepairInput (language: string, exercise: Exercise, chapterTitle: string, learnerAge?: number): unknown {
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

function exerciseForPageReplacement ({ conceptId, description, displayOrder, imageDescription, solution, solutionImageDescription, source, title }: Exercise): Omit<Exercise, 'bookPage' | 'id'> {
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

interface Props {
  ageTabRequest: number;
  assignAllStandardsRequest: number;
  embedAllConceptsRequest: number;
  autoRunAll?: boolean;
  autoRunStartKey?: string;
  deduplicateAllConceptsRequest: number;
  fixAllConceptsRequest: number;
  fixOnlyFailedConcepts: boolean;
  sortAllConceptsRequest: number;
  refineAllChaptersRequest: number;
  book: Book;
  file: File;
  embeddingModel: string;
  generateAllConceptsModel: string;
  generateAllConceptsRequest: number;
  generateOnlyMissingConcepts: boolean;
  identifyChaptersRequest: number;
  languageTabRequest: number;
  subjectTabRequest: number;
  onBookChange: (book: Book) => void;
  onAutoRunComplete?: () => void;
  onAbortFastForward: () => void;
  onFastForward: (startKey: string) => void;
  onPrice: () => void;
  onProcessingComplete: () => void;
  isPriceDisabled?: boolean;
  pendingProcessingAction?: 'chapters' | 'concepts' | 'fixConcepts' | 'embeddings' | 'deduplicateConcepts' | 'sortConcepts' | 'refineChapters' | 'recognize' | 'standards' | 'exercises';
  processingToolbar: PipelineAction[];
  processingToolbarAfterFixImages?: PipelineAction[];
  generateAllExercisesRequest: number;
  generateOnlyMissingExercises: boolean;
  recognizeAllRequest: number;
  standardsModel: string;
}

type ReaderPane = 'age' | 'chapters' | 'conceptExercises' | 'conceptsSkills' | 'embeddings' | 'language' | 'subject' | 'pdf' | 'preExercisesExercises' | 'skillsCourse' | 'standards' | 'text' | 'textConcepts';

type RecognitionTarget = 'all' | 'page';

interface ReaderEntityCounts {
  abilities: number;
  bookExercises: number;
  concepts: number;
  exercises: number;
}

interface ConceptEmbeddingHeatmapEntry {
  concept: BookConcept;
  embedding: number[];
  norm: number;
}

function conceptEmbeddingDistanceMatrix (entries: ConceptEmbeddingHeatmapEntry[]): Array<Array<number | undefined>> {
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

interface FixConceptsReviewChapter {
  before: BookConcept[];
  chapter: ConceptChapterNavigationItem;
  missing: MissingChapterConcept[];
  removed: BookConcept[];
}

interface FixConceptsReview {
  baseStatuses: FixConceptsChapterStatuses;
  chapters: FixConceptsReviewChapter[];
  failedChapters: Array<{ chapter: ConceptChapterNavigationItem; reason: string }>;
  targetChapterCount: number;
}

interface DeduplicateConceptsReviewPair {
  deleted: BookConcept;
  deletedChapterId: number;
  deletedChapterTitle: string;
  kept: BookConcept;
  keptChapterId: number;
  keptChapterTitle: string;
  selected: boolean;
}

interface DeduplicateConceptsReview {
  checkedConceptCount: number;
  pairs: DeduplicateConceptsReviewPair[];
}

interface ExerciseChapterNavigationItem {
  id?: number;
  pageNumbers: number[];
  title: string;
}

function exerciseChapterNavigationKey ({ id, pageNumbers, title }: ExerciseChapterNavigationItem): string {
  return `${id ?? title}\n${pageNumbers.join(',')}`;
}

function conceptsForExerciseChapter (concepts: BookConcept[], chapter: ExerciseChapterNavigationItem): BookConcept[] {
  return sortConceptsForDisplay(concepts.filter((concept) => conceptBelongsToChapter(concept, { chapterId: chapter.id, pageNumbers: chapter.pageNumbers })));
}

function exercisesForExerciseChapter (
  pageRows: Array<{ exercises: Exercise[]; pageNumber: number }>,
  concepts: BookConcept[],
  chapter: ExerciseChapterNavigationItem
): Exercise[] {
  const conceptIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));

  return sortExercisesForDisplay(pageRows.flatMap(({ exercises, pageNumber }) => exercises.filter(({ conceptId }) =>
    conceptId === undefined ? chapter.pageNumbers.includes(pageNumber) : conceptIds.has(conceptId)
  )));
}

function conceptReferenceKey({ description, id, title }: Pick<BookConcept, 'description' | 'id' | 'title'>): string {
  return id === undefined ? `content:${title}\n${description}` : `id:${id}`;
}

function conceptContentKey({ description, title }: Pick<BookConcept, 'description' | 'title'>): string {
  return `${title.trim().toLocaleLowerCase()}\n${description.trim().toLocaleLowerCase()}`;
}

function matchingLiveConcept(displayed: BookConcept, live: BookConcept[]): BookConcept | undefined {
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

const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

async function deleteConceptAndDependencies (bookId: number, concept: BookConcept, pageNumbers: number[]): Promise<void> {
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

const readerPaneSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-pane`;

const readerMaximizedSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-maximized`;

const exerciseChapterSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-exercises-chapter`;

function getSessionExerciseChapter(bookId: number): number {
  try {
    const stored = Number(sessionStorage.getItem(exerciseChapterSessionKey(bookId)));

    return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function getSessionReaderMaximized(bookId: number): boolean {
  try {
    return sessionStorage.getItem(readerMaximizedSessionKey(bookId)) === 'true';
  } catch {
    return false;
  }
}

function getSessionReaderPane(bookId: number): ReaderPane {
  try {
    const value = sessionStorage.getItem(readerPaneSessionKey(bookId));

    if (value === 'pdfText' || value === 'pdf') {
      return 'text';
    }

    return value === 'text' || value === 'language' || value === 'subject' || value === 'age' || value === 'chapters' || value === 'textConcepts' || value === 'standards' || value === 'embeddings' || value === 'conceptExercises' || value === 'preExercisesExercises' || value === 'skillsCourse' ? value : 'text';
  } catch {
    return 'text';
  }
}

export { analysisPageNumbers, conceptContentKey, conceptDisplayOrder, conceptDisplayPage, conceptEmbeddingDistanceMatrix, conceptInsertionDisplayOrder, conceptReferenceKey, conceptsForExerciseChapter, conceptsForNavigationChapter, deleteConceptAndDependencies, exerciseAbilityModuleId, exerciseChapterNavigationKey, exerciseChapterSessionKey, exerciseForPageReplacement, exercisesForExerciseChapter, getBookConceptInventory, getSessionExerciseChapter, getSessionPage, getSessionReaderMaximized, getSessionReaderPane, getSessionRecognitionAttempted, matchingLiveConcept, pageSessionKey, readerMaximizedSessionKey, readerPaneSessionKey, recognitionAttemptSessionKey, singleExerciseRepairInput, sortConceptsForDisplay, storeSessionPage, storeSessionRecognitionAttempted };
export type { ConceptEmbeddingHeatmapEntry, DeduplicateConceptsReview, DeduplicateConceptsReviewPair, ExerciseChapterNavigationItem, ExerciseEditableFields, FixConceptsReview, FixConceptsReviewChapter, Props, ReaderEntityCounts, ReaderPane, RecognitionTarget };
