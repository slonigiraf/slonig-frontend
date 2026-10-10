// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { formatChapterTitle } from '../../../book/domain/chapters/chapterTitles.js';

import type { Book, BookChapter, BookPage, BookProcessingStageKey } from '@slonigiraf/db';
import { assignBookPageChapter, deleteAbilities, deleteBookChapters, getBookChapters, getBookPages, getExercisesForBookPage, getSetting, mergeBookChapterWithPrevious, replaceBookChapterAssignments, SettingKey, splitBookChapterAtPage, updateBookChapterTitle, updateBookFieldsAndStages, withBookProcessingStagesResetFrom, withCompletedBookProcessingStage } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect } from 'react';
import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../../openrouter/concurrency.js';
import { chapterAssignmentsFromBoundaries, chapterEvidenceWindows, chapterReconciliationPrompt, chapterWindowPrompt, deriveStructuralChapterCandidates, pageChapterEvidence, stabilizeChapterBoundaries } from '../../../book/domain/chapters/chapterSegmentation.js';
import { extractPdfOutlineChapterBoundaries } from '../../../book/infrastructure/pdf/pdf.js';
import { createOpenRouterClient, requestChapterBoundaries } from '../../../book/application/workspace/bookReaderProcessing.js';
import { exerciseAbilityModuleId } from '../../../book/application/workspace/bookReaderWorkspace.js';
import { type ReaderPane } from '../../../shared/types/bookWorkspace.js';
interface UseBookChapterActionsOptions {
  addChaptersCost: (costUsd: number) => void;
  book: Book;
  chapterTitleDraft: string;
  chapters: BookChapter[];
  completeStage: (stage: BookProcessingStageKey) => Promise<void>;
  currentChapter?: BookChapter;
  currentReaderProcessingSignal: () => AbortSignal;
  generateAllConceptsModel: string;
  isDeletingChapters: boolean;
  isGeneratingAllConcepts: boolean;
  isGeneratingAllExercises: boolean;
  isIdentifyingChapters: boolean;
  isRecognizingAll: boolean;
  newChapterTitle: string;
  onBookChange: (book: Book) => void;
  onProcessingComplete: () => void;
  pageNumber: number;
  pages: Map<number, BookPage>;
  pdf?: PDFDocumentProxy;
  processingPage?: number;
  refreshConceptCounts: () => Promise<void>;
  refreshEntityCounts: () => Promise<void>;
  revealPane: (pane: ReaderPane) => void;
  selectedChapterIds: Set<number>;
  setChapterIdentificationPhase: Dispatch<SetStateAction<'bookmarks' | 'saving' | 'text'>>;
  setChapters: Dispatch<SetStateAction<BookChapter[]>>;
  setEditingChapter: Dispatch<SetStateAction<BookChapter | undefined>>;
  setError: Dispatch<SetStateAction<string>>;
  setIdentifiedChapterPageCount: Dispatch<SetStateAction<number>>;
  setIsDeletingChapters: Dispatch<SetStateAction<boolean>>;
  setIsIdentifyingChapters: Dispatch<SetStateAction<boolean>>;
  setNewChapterTitle: Dispatch<SetStateAction<string>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setPages: Dispatch<SetStateAction<Map<number, BookPage>>>;
  setSelectedChapterIds: Dispatch<SetStateAction<Set<number>>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
  totalPages: number;
}

export function useBookChapterActions ({
  addChaptersCost,
  book,
  chapterTitleDraft,
  chapters,
  completeStage,
  currentChapter,
  currentReaderProcessingSignal,
  generateAllConceptsModel,
  isDeletingChapters,
  isGeneratingAllConcepts,
  isGeneratingAllExercises,
  isIdentifyingChapters,
  isRecognizingAll,
  newChapterTitle,
  onBookChange,
  onProcessingComplete,
  pageNumber,
  pages,
  pdf,
  processingPage,
  refreshConceptCounts,
  refreshEntityCounts,
  revealPane,
  selectedChapterIds,
  setChapterIdentificationPhase,
  setChapters,
  setEditingChapter,
  setError,
  setIdentifiedChapterPageCount,
  setIsDeletingChapters,
  setIsIdentifyingChapters,
  setNewChapterTitle,
  setOpenRouterSpent,
  setPages,
  setSelectedChapterIds,
  setSkillsRefreshToken,
  totalPages
}: UseBookChapterActionsOptions) {
  const refreshChapterAssignments = useCallback(async (): Promise<void> => {
    const [storedPages, storedChapters] = await Promise.all([getBookPages(book.id), getBookChapters(book.id)]);

    setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
    setChapters(storedChapters);
  }, [book.id]);
  const openChapterEditor = useCallback((chapterId?: number): void => {
    if (chapterId === undefined) {
      return;
    }

    const chapter = chapters.find(({ id }) => id === chapterId);

    if (chapter) {
      setEditingChapter(chapter);
    }
  }, [chapters]);
  const closeChapterEditor = useCallback((): void => setEditingChapter(undefined), []);
  const refreshAfterChapterRename = useCallback((): void => {
    refreshChapterAssignments()
      .then(() => setSkillsRefreshToken((value) => value + 1))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to refresh chapters.'));
  }, [refreshChapterAssignments]);

  useEffect(() => {
    const availableIds = new Set(chapters.flatMap(({ id }) => id === undefined ? [] : [id]));

    setSelectedChapterIds((current) => new Set(Array.from(current).filter((id) => availableIds.has(id))));
  }, [chapters]);

  const toggleChapterSelection = useCallback((chapterId: number): void => {
    setSelectedChapterIds((current) => {
      const next = new Set(current);

      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }

      return next;
    });
  }, []);

  const synchronizeChapterProcessingStage = useCallback(async (): Promise<void> => {
    const storedPages = await getBookPages(book.id);
    const complete = totalPages > 0 && storedPages.length === totalPages && storedPages.every(({ chapterId, chapter, excludedFromAnalysis }) => excludedFromAnalysis || chapterId !== undefined || Boolean(chapter.trim()));
    let updated: Book | undefined;

    if (complete) {
      // Manual chapter edits change the input partition for every downstream
      // artifact. Keep Chapters complete, but invalidate Concepts and all later
      // stages even when every page still has a syntactically valid chapter.
      updated = await updateBookFieldsAndStages(book.id, {}, {
        complete: ['chapters'],
        resetFrom: 'chapters'
      });
    } else {
      updated = await updateBookFieldsAndStages(book.id, {}, { resetFrom: 'chapters' });
    }

    const fallback = complete
      ? withCompletedBookProcessingStage(withBookProcessingStagesResetFrom(book, 'chapters'), 'chapters')
      : withBookProcessingStagesResetFrom(book, 'chapters');

    onBookChange(updated ?? fallback);
  }, [book, onBookChange, totalPages]);

  const deleteSelectedChapters = useCallback(async (): Promise<void> => {
    const chapterIds = Array.from(selectedChapterIds);

    if (!chapterIds.length || isDeletingChapters) {
      return;
    }

    setError('');
    setIsDeletingChapters(true);

    try {
      const selected = new Set(chapterIds);
      const selectedPageNumbers = Array.from(pages.values()).flatMap(({ chapterId, pageNumber }) => chapterId !== undefined && selected.has(chapterId) ? [pageNumber] : []);
      const selectedExercises = (await Promise.all(selectedPageNumbers.map((selectedPageNumber) => getExercisesForBookPage([book.id, selectedPageNumber])))).flat();

      await Promise.all(selectedExercises.flatMap(({ id }) => id === undefined ? [] : [deleteAbilities(exerciseAbilityModuleId(book.id, id))]));
      await deleteBookChapters(book.id, chapterIds);
      setSelectedChapterIds(new Set());
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete the selected chapters.');
    } finally {
      setIsDeletingChapters(false);
    }
  }, [book.id, isDeletingChapters, pages, refreshChapterAssignments, refreshConceptCounts, refreshEntityCounts, selectedChapterIds, synchronizeChapterProcessingStage]);

  const saveCurrentChapterTitle = useCallback(async (): Promise<void> => {
    const title = formatChapterTitle(chapterTitleDraft, book.language);

    if (currentChapter?.id === undefined || !title) {
      return;
    }

    setError('');

    try {
      await updateBookChapterTitle(currentChapter.id, title);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rename chapter.');
    }
  }, [chapterTitleDraft, currentChapter?.id, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const assignCurrentPageToChapter = useCallback(async (chapterId: number): Promise<void> => {
    setError('');

    try {
      await assignBookPageChapter(book.id, pageNumber, chapterId);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to assign this page to the chapter.');
    }
  }, [book.id, pageNumber, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const startChapterHere = useCallback(async (): Promise<void> => {
    const title = formatChapterTitle(newChapterTitle, book.language);

    if (!title) {
      setError('Enter a chapter title first.');
      return;
    }

    setError('');

    try {
      await splitBookChapterAtPage(book.id, pageNumber, title);
      setNewChapterTitle('');
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start a chapter here.');
    }
  }, [book.id, newChapterTitle, pageNumber, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const mergeCurrentChapterWithPrevious = useCallback(async (): Promise<void> => {
    if (currentChapter?.id === undefined) {
      return;
    }

    setError('');

    try {
      await mergeBookChapterWithPrevious(book.id, currentChapter.id);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to merge this chapter with the previous chapter.');
    }
  }, [book.id, currentChapter?.id, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const identifyChapters = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isGeneratingAllExercises || isIdentifyingChapters) {
      return;
    }

    const recognizedPages = Array.from(pages.values()).sort((a, b) => a.pageNumber - b.pageNumber);

    if (recognizedPages.length !== totalPages || recognizedPages.some(({ pageMMD }) => pageMMD === undefined)) {
      setError('Recognize every page before identifying chapters.');
      onProcessingComplete();
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIdentifiedChapterPageCount(0);
    setChapterIdentificationPhase('bookmarks');
    setIsIdentifyingChapters(true);

    try {
      // The document outline/bookmarks are author-provided PDF metadata, so
      // prefer them over inferred headings and AI reconciliation whenever they
      // contain usable destinations.
      if (!pdf) {
        throw new Error('The PDF is still loading. Try identifying chapters again.');
      }

      const outlineBoundaries = await extractPdfOutlineChapterBoundaries(pdf);

      if (outlineBoundaries.length) {
        const boundaries = chapterAssignmentsFromBoundaries(outlineBoundaries, totalPages);

        setChapterIdentificationPhase('saving');
        await replaceBookChapterAssignments(book.id, boundaries);
        await refreshChapterAssignments();
        await completeStage('chapters');
        revealPane('chapters');
        setIdentifiedChapterPageCount(totalPages);
        return;
      }

      if (!book.language) {
        throw new Error('Set the book language after recognition before identifying chapters without PDF bookmarks.');
      }

      setChapterIdentificationPhase('text');
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const windows = chapterEvidenceWindows(recognizedPages);
      const windowResults = await mapConcurrent(windows, Math.min(3, OPENROUTER_CONCURRENCY), async (window) => {
        const result = await requestChapterBoundaries(client, generateAllConceptsModel, chapterWindowPrompt(window), totalPages, addChaptersCost);
        setIdentifiedChapterPageCount((current) => Math.max(current, window[window.length - 1]?.pageNumber ?? current));

        return result;
      });
      const proposals = windowResults.flat();
      const evidence = recognizedPages.map(pageChapterEvidence);
      const structural = deriveStructuralChapterCandidates(evidence);
      const reconciled = await requestChapterBoundaries(client, generateAllConceptsModel, chapterReconciliationPrompt(proposals, evidence, totalPages, structural), totalPages, addChaptersCost);
      const stable = stabilizeChapterBoundaries(reconciled.length ? reconciled : proposals, structural, totalPages, evidence);
      const boundaries = chapterAssignmentsFromBoundaries(stable, totalPages);

      setChapterIdentificationPhase('saving');
      await replaceBookChapterAssignments(book.id, boundaries);
      await refreshChapterAssignments();
      await completeStage('chapters');
      revealPane('chapters');
      setIdentifiedChapterPageCount(totalPages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to identify chapters.');
    } finally {
      setIsIdentifyingChapters(false);
      onProcessingComplete();
    }
  }, [currentReaderProcessingSignal, addChaptersCost, completeStage, book.id, book.language, generateAllConceptsModel, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, pdf, processingPage, refreshChapterAssignments, revealPane, totalPages]);

  return {
    assignCurrentPageToChapter,
    closeChapterEditor,
    deleteSelectedChapters,
    identifyChapters,
    mergeCurrentChapterWithPrevious,
    openChapterEditor,
    refreshAfterChapterRename,
    refreshChapterAssignments,
    saveCurrentChapterTitle,
    startChapterHere,
    synchronizeChapterProcessingStage,
    toggleChapterSelection
  } as const;
}
