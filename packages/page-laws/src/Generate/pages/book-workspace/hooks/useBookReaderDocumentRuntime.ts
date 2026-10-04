// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, BookProcessingStageKey, Exercise } from '@slonigiraf/db';
import { getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import type { Dispatch, MutableRefObject, RefObject, SetStateAction } from 'react';
import { useEffect, useLayoutEffect } from 'react';
import { areAllBookPagesConceptsProcessed } from '../../../book/application/processing/bookProcessing.js';
import type { ConceptChapterNavigationItem } from '../../../book/domain/concepts/conceptRecognition.js';
import { missingGeneratedExerciseConceptIndexes } from '../../../book/domain/exercises/exercises.js';
import { loadPdfJs } from '../../../book/infrastructure/pdf/pdf.js';
import { analysisPageNumbers, conceptReferenceKey, conceptsForExerciseChapter, conceptsForNavigationChapter, exerciseChapterNavigationKey, exercisesForExerciseChapter, getBookConceptInventory } from '../../../book/application/workspace/bookReaderWorkspace.js';
import { getSessionPage } from '../../../book/infrastructure/storage/bookReaderSession.js';
import { type ExerciseChapterNavigationItem, type ReaderPane } from '../../../shared/types/bookWorkspace.js';
interface UseBookReaderDocumentRuntimeOptions {
  activePane: ReaderPane;
  autoRunAll: boolean;
  book: Book;
  canvasRef: RefObject<HTMLCanvasElement>;
  completeStageRef: MutableRefObject<(stage: BookProcessingStageKey) => Promise<void>>;
  concepts: BookConcept[];
  conceptsOutputRef: RefObject<HTMLDivElement>;
  currentConceptChapter?: ConceptChapterNavigationItem;
  currentExerciseChapter?: ExerciseChapterNavigationItem;
  embeddingHeatmapMode: 'book' | 'chapter';
  exerciseChapterConcepts: BookConcept[];
  exerciseChapters: ExerciseChapterNavigationItem[];
  exerciseConceptsOutputRef: RefObject<HTMLDivElement>;
  file: File;
  isExerciseChapterLoading: boolean;
  isMaximized: boolean;
  pageAreaRef: RefObject<HTMLDivElement>;
  pageNumber: number;
  pages: Map<number, BookPage>;
  pdf?: PDFDocumentProxy;
  pendingConceptChapterFocusRef: MutableRefObject<boolean>;
  pendingExerciseChapterFocusRef: MutableRefObject<boolean>;
  pendingStandardsChapterFocusRef: MutableRefObject<boolean>;
  setChapters: Dispatch<SetStateAction<BookChapter[]>>;
  setConceptFirstPageByKey: Dispatch<SetStateAction<Map<string, number>>>;
  setConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setExerciseChapterConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setExerciseChapterExercises: Dispatch<SetStateAction<Exercise[]>>;
  setExerciseChapterMissingCounts: Dispatch<SetStateAction<Map<string, number>>>;
  setIsExerciseChapterLoading: Dispatch<SetStateAction<boolean>>;
  setPageInput: Dispatch<SetStateAction<string>>;
  setPageNumber: Dispatch<SetStateAction<number>>;
  setPages: Dispatch<SetStateAction<Map<number, BookPage>>>;
  setPdf: Dispatch<SetStateAction<PDFDocumentProxy | undefined>>;
  setRenderedPageHeight: Dispatch<SetStateAction<number | undefined>>;
  setTotalPages: Dispatch<SetStateAction<number>>;
  skillsRefreshToken: number;
  standardsChapterIndex: number;
  standardsChapterOutputRef: RefObject<HTMLDivElement>;
}

export function useBookReaderDocumentRuntime ({
  activePane,
  autoRunAll,
  book,
  canvasRef,
  completeStageRef,
  concepts,
  conceptsOutputRef,
  currentConceptChapter,
  currentExerciseChapter,
  embeddingHeatmapMode,
  exerciseChapterConcepts,
  exerciseChapters,
  exerciseConceptsOutputRef,
  file,
  isExerciseChapterLoading,
  isMaximized,
  pageAreaRef,
  pageNumber,
  pages,
  pdf,
  pendingConceptChapterFocusRef,
  pendingExerciseChapterFocusRef,
  pendingStandardsChapterFocusRef,
  setChapters,
  setConceptFirstPageByKey,
  setConcepts,
  setError,
  setExerciseChapterConcepts,
  setExerciseChapterExercises,
  setExerciseChapterMissingCounts,
  setIsExerciseChapterLoading,
  setPageInput,
  setPageNumber,
  setPages,
  setPdf,
  setRenderedPageHeight,
  setTotalPages,
  skillsRefreshToken,
  standardsChapterIndex,
  standardsChapterOutputRef
}: UseBookReaderDocumentRuntimeOptions): void {
  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;

    setError('');
    setPdf(undefined);
    setRenderedPageHeight(undefined);
    setTotalPages(0);

    const load = async (): Promise<void> => {
      const data = new Uint8Array(await file.arrayBuffer());

      if (!active) {
        return;
      }

      const { getDocument } = await loadPdfJs();

      if (!active) {
        return;
      }

      loadingTask = getDocument({ data });

      const [document, storedPages, storedChapters] = await Promise.all([
        loadingTask.promise,
        getBookPages(book.id),
        getBookChapters(book.id)
      ]);

      if (!active) {
        void document.destroy();

        return;
      }

      setPdf(document);
      setTotalPages(document.numPages);
      setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
      setChapters(storedChapters);
      const hasEveryPage = storedPages.length === document.numPages;

      if (areAllBookPagesConceptsProcessed(document.numPages, storedPages, analysisPageNumbers(storedPages))) {
        await completeStageRef.current('concepts');
      } else if (hasEveryPage && storedPages.every(({ chapterId, chapter, excludedFromAnalysis }) => excludedFromAnalysis || chapterId !== undefined || Boolean(chapter.trim()))) {
        await completeStageRef.current('chapters');
      } else if (hasEveryPage && storedPages.every(({ pageMMD }) => pageMMD !== undefined)) {
        await completeStageRef.current('recognize');
      }

      const restoredPage = Math.min(document.numPages, getSessionPage(book.id));

      setPageNumber(restoredPage);
      setPageInput(String(restoredPage));
    };

    load().catch(() => active && setError('Unable to open this PDF.'));

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [book.id, file]);

  useLayoutEffect(() => {
    if (!pendingConceptChapterFocusRef.current || !concepts.length) {
      return;
    }

    const first = conceptsOutputRef.current?.querySelector<HTMLElement>('.conceptItem');

    if (first) {
      pendingConceptChapterFocusRef.current = false;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [concepts]);

  useLayoutEffect(() => {
    if (!pendingExerciseChapterFocusRef.current || isExerciseChapterLoading || !exerciseChapterConcepts.length) {
      return;
    }

    const first = exerciseConceptsOutputRef.current?.querySelector<HTMLElement>('.exerciseConceptCard');

    if (first) {
      pendingExerciseChapterFocusRef.current = false;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [exerciseChapterConcepts, isExerciseChapterLoading]);

  useLayoutEffect(() => {
    if (!pendingStandardsChapterFocusRef.current || (activePane === 'embeddings' && embeddingHeatmapMode !== 'chapter')) {
      return;
    }

    const first = standardsChapterOutputRef.current;

    if (first) {
      pendingStandardsChapterFocusRef.current = false;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activePane, embeddingHeatmapMode, standardsChapterIndex]);

  useEffect(() => {
    let active = true;

    const loadChapterConcepts = async (): Promise<void> => {
      if (!currentConceptChapter) {
        if (active) {
          setConcepts([]);
          setConceptFirstPageByKey(new Map());
        }

        return;
      }

      const inventory = await getBookConceptInventory(book.id, pages.keys());

      if (active) {
        const storedConcepts = conceptsForNavigationChapter(inventory, currentConceptChapter);
        const references = new Map<string, number>();

        storedConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), concept.bookPage[1]));
        setConcepts(storedConcepts);
        setConceptFirstPageByKey(references);
      }
    };

    loadChapterConcepts().catch(() => active && setError('Unable to load chapter concepts.'));

    return () => {
      active = false;
    };
  }, [book.id, currentConceptChapter, pages]);

  useEffect(() => {
    if (!autoRunAll && activePane !== 'conceptExercises') {
      return;
    }

    let active = true;

    const loadChapterLearningContent = async (): Promise<void> => {
      if (!currentExerciseChapter) {
        setExerciseChapterConcepts([]);
        setExerciseChapterExercises([]);
        setIsExerciseChapterLoading(false);

        return;
      }

      setExerciseChapterConcepts([]);
      setExerciseChapterExercises([]);
      setIsExerciseChapterLoading(true);
      const pageRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => {
        const [storedConcepts, storedExercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, chapterPageNumber),
          getExercisesForBookPage([book.id, chapterPageNumber])
        ]);

        return { concepts: storedConcepts, exercises: storedExercises, pageNumber: chapterPageNumber };
      }));
      const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
      const chapterConcepts = conceptsForExerciseChapter([...pageRows.flatMap(({ concepts }) => concepts), ...pageLessConcepts], currentExerciseChapter);

      if (active) {
        setExerciseChapterConcepts(chapterConcepts);
        setExerciseChapterExercises(exercisesForExerciseChapter(pageRows, chapterConcepts, currentExerciseChapter));
      }
    };

    loadChapterLearningContent()
      .catch(() => active && setError('Unable to load this chapter’s exercises.'))
      .finally(() => active && setIsExerciseChapterLoading(false));

    return () => {
      active = false;
    };
  }, [activePane, book.id, currentExerciseChapter, pages, skillsRefreshToken]);

  useEffect(() => {
    if (activePane !== 'conceptExercises') {
      return;
    }

    let active = true;

    setExerciseChapterMissingCounts(new Map());

    const loadMissingCounts = async (): Promise<Map<string, number>> => {
      const pageRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => {
        const [storedConcepts, storedExercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, chapterPageNumber),
          getExercisesForBookPage([book.id, chapterPageNumber])
        ]);

        return { concepts: storedConcepts, exercises: storedExercises, pageNumber: chapterPageNumber };
      }));
      const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
      const inventory = [...pageRows.flatMap(({ concepts }) => concepts), ...pageLessConcepts];

      return new Map(exerciseChapters.map((chapter) => {
        const concepts = conceptsForExerciseChapter(inventory, chapter);
        const exercises = exercisesForExerciseChapter(pageRows, concepts, chapter);

        return [exerciseChapterNavigationKey(chapter), missingGeneratedExerciseConceptIndexes(concepts, exercises).length] as const;
      }));
    };

    loadMissingCounts()
      .then((counts) => active && setExerciseChapterMissingCounts(counts))
      .catch(() => active && setExerciseChapterMissingCounts(new Map()));

    return () => {
      active = false;
    };
  }, [activePane, autoRunAll, book.id, exerciseChapters, pages, skillsRefreshToken]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !pageAreaRef.current) {
      return;
    }

    let renderTask: RenderTask | undefined;
    let active = true;
    const canvas = canvasRef.current;
    const pageArea = pageAreaRef.current;

    const render = async (): Promise<void> => {
      const page = await pdf.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(pageArea.clientWidth, 320);
      const scale = availableWidth / initialViewport.width;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');

      if (!active || !context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;

      if (active) {
        setRenderedPageHeight(canvas.getBoundingClientRect().height);
      }
    };

    render().catch((renderError: Error) => {
      if (renderError.name !== 'RenderingCancelledException') {
        setError('Unable to render this page.');
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [activePane, isMaximized, pageNumber, pdf]);

}
