// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, BookProcessingStageKey, BookStageSpendKey } from '@slonigiraf/db';
import { getBookPages, getSetting, SettingKey } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../../openrouter/concurrency.js';
import { areAllBookPagesConceptsProcessed, countUnprocessedBookPages } from '../../../book/processing/bookProcessing.js';
import { conceptChaptersFromPages, type ConceptChapterNavigationItem } from '../../../book/processing/concepts/conceptRecognition.js';
import { standardsChapterKey } from '../../../book/processing/standards/standards.js';
import { conceptGenerationErrorMessage, createOpenRouterClient, generateChapterContentWithEmptyConceptRetry, getChapterConceptInputs, storeGeneratedChapterConcepts } from '../BookReaderProcessing.js';
import { analysisPageNumbers, conceptReferenceKey, type ReaderPane } from '../BookReaderUtils.js';

interface UseBookConceptGenerationOptions {
  addConceptsCost: (costUsd: number) => void;
  book: Book;
  completeStage: (stage: BookProcessingStageKey) => Promise<void>;
  conceptChapters: ConceptChapterNavigationItem[];
  currentConceptChapter?: ConceptChapterNavigationItem;
  currentReaderProcessingSignal: () => AbortSignal;
  generateAllConceptsModel: string;
  generateOnlyMissingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isIdentifyingChapters: boolean;
  isRecognizingAll: boolean;
  loadConceptCountsByChapter: (targetChapters: ConceptChapterNavigationItem[]) => Promise<Map<string, number>>;
  onProcessingComplete: () => void;
  pageNumber: number;
  pages: Map<number, BookPage>;
  processingPage?: number;
  refreshConceptCounts: () => Promise<void>;
  refreshEntityCounts: () => Promise<void>;
  revealPane: (pane: ReaderPane) => void;
  selectedModel: string;
  setConceptFirstPageByKey: Dispatch<SetStateAction<Map<string, number>>>;
  setConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setConfirmedProcessingStage: Dispatch<SetStateAction<BookStageSpendKey | undefined>>;
  setError: Dispatch<SetStateAction<string>>;
  setGeneratedConceptsChapterCount: Dispatch<SetStateAction<number>>;
  setIsGeneratingAllConcepts: Dispatch<SetStateAction<boolean>>;
  setIsGeneratingChapterConcepts: Dispatch<SetStateAction<boolean>>;
  setIsPageGenerationConfirmationOpen: Dispatch<SetStateAction<boolean>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setPages: Dispatch<SetStateAction<Map<number, BookPage>>>;
  setProcessingPage: Dispatch<SetStateAction<number | undefined>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
  totalPages: number;
}

export function useBookConceptGeneration ({
  addConceptsCost,
  book,
  completeStage,
  conceptChapters,
  currentConceptChapter,
  currentReaderProcessingSignal,
  generateAllConceptsModel,
  generateOnlyMissingConcepts,
  isGeneratingAllConcepts,
  isIdentifyingChapters,
  isRecognizingAll,
  loadConceptCountsByChapter,
  onProcessingComplete,
  pageNumber,
  pages,
  processingPage,
  refreshConceptCounts,
  refreshEntityCounts,
  revealPane,
  selectedModel,
  setConceptFirstPageByKey,
  setConcepts,
  setConfirmedProcessingStage,
  setError,
  setGeneratedConceptsChapterCount,
  setIsGeneratingAllConcepts,
  setIsGeneratingChapterConcepts,
  setIsPageGenerationConfirmationOpen,
  setOpenRouterSpent,
  setPages,
  setProcessingPage,
  setSkillsRefreshToken,
  totalPages
}: UseBookConceptGenerationOptions) {
  const generateConcepts = useCallback(async (): Promise<void> => {
    const storedPage = pages.get(pageNumber);

    if (!storedPage || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    if (!currentConceptChapter) {
      setError('Assign this page to a chapter before generating concepts.');
      return;
    }

    const chapterPages = currentConceptChapter.pageNumbers.flatMap((chapterPageNumber) => {
      const page = pages.get(chapterPageNumber);

      return page ? [page] : [];
    });

    if (chapterPages.length !== currentConceptChapter.pageNumbers.length) {
      setError('Recognize every page in this chapter before generating concepts.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingChapterConcepts(true);
    setProcessingPage(pageNumber);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const chapterInputs = await getChapterConceptInputs(chapterPages);
      const generatedConcepts = await generateChapterContentWithEmptyConceptRetry(client, selectedModel, currentConceptChapter.title, chapterInputs, chapterInputs.length > 0, addConceptsCost);
      const stored = await storeGeneratedChapterConcepts(book.id, chapterPages, generatedConcepts);
      const updatedPages = new Map(pages);
      const references = new Map<string, number>();
      const storedConcepts: BookConcept[] = [];

      stored.pages.forEach((page) => updatedPages.set(page.pageNumber, page));
      stored.conceptsByPage.forEach((pageConcepts, conceptPageNumber) => pageConcepts.forEach((concept) => {
        storedConcepts.push(concept);
        references.set(conceptReferenceKey(concept), conceptPageNumber);
      }));

      setPages(updatedPages);
      setConcepts(storedConcepts);
      setConceptFirstPageByKey(references);
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);

      if (areAllBookPagesConceptsProcessed(totalPages, Array.from(updatedPages.values()), analysisPageNumbers(Array.from(updatedPages.values())))) {
        await completeStage('concepts');
        revealPane('textConcepts');
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for this chapter.');
    } finally {
      setIsGeneratingChapterConcepts(false);
      setProcessingPage(undefined);
    }
  }, [currentReaderProcessingSignal, addConceptsCost, completeStage, book.id, currentConceptChapter, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, refreshConceptCounts, refreshEntityCounts, revealPane, selectedModel, totalPages]);
  const closePageGenerationConfirmation = useCallback((): void => setIsPageGenerationConfirmationOpen(false), []);
  const confirmPageGeneration = useCallback((): void => {
    setIsPageGenerationConfirmationOpen(false);
    setConfirmedProcessingStage('concepts');
    generateConcepts()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'concepts' ? undefined : current));
  }, [generateConcepts]);

  const generateAllConcepts = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    const orderedPages = Array.from({ length: totalPages }, (_, index) => pages.get(index + 1));

    if (orderedPages.some((page) => !page)) {
      setError('Recognize every page before generating concepts.');
      onProcessingComplete();
      return;
    }

    const bookPages = orderedPages as BookPage[];

    const activePages = bookPages.filter(({ excludedFromAnalysis }) => !excludedFromAnalysis);

    if (activePages.some(({ chapter, chapterId }) => chapterId === undefined && !chapter.trim())) {
      setError('Assign every included page to a chapter before generating concepts. Deleted chapters stay excluded from analysis.');
      onProcessingComplete();
      return;
    }

    const recognitionChapters = conceptChaptersFromPages(bookPages);

    if (!recognitionChapters.length || recognitionChapters.reduce((count, chapter) => count + chapter.pageNumbers.length, 0) !== activePages.length) {
      setError('Every included page must belong to exactly one chapter before generating concepts.');
      onProcessingComplete();
      return;
    }

    // An explicit Concepts action is a regeneration request, not merely a
    // completion check. Re-run every chapter even when its persisted
    // conceptsProcessed flag is already true; otherwise a manual rerun can
    // return immediately without sending any concept request.
    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingAllConcepts(true);
    setGeneratedConceptsChapterCount(0);

    const allChapterTasks = recognitionChapters.map((chapter) => ({
      chapter,
      pages: chapter.pageNumbers.map((chapterPageNumber) => pages.get(chapterPageNumber) as BookPage)
    }));
    let chapterTasks = allChapterTasks;

    if (generateOnlyMissingConcepts) {
      try {
        const conceptCounts = await loadConceptCountsByChapter(recognitionChapters);

        chapterTasks = allChapterTasks.filter(({ chapter }) => (conceptCounts.get(standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers)) ?? 0) === 0);
      } catch {
        setError('Unable to determine which chapters are missing concepts.');
        setIsGeneratingAllConcepts(false);
        onProcessingComplete();

        return;
      }
    }

    if (!chapterTasks.length) {
      await completeStage('concepts');
      revealPane('textConcepts');
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      setError('No OpenRouter token found. Add it in Settings.');
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();

      return;
    }

    const client = createOpenRouterClient(key, currentReaderProcessingSignal());

    try {
      const generationResults = await mapConcurrent(chapterTasks, OPENROUTER_CONCURRENCY, async ({ chapter, pages: chapterPages }) => {
        try {
          const chapterInputs = await getChapterConceptInputs(chapterPages);

          return {
            chapter,
            chapterPages,
            generatedConcepts: await generateChapterContentWithEmptyConceptRetry(client, generateAllConceptsModel, chapter.title, chapterInputs, chapterInputs.length > 0, addConceptsCost),
            status: 'fulfilled' as const
          };
        } catch (reason) {
          return { chapter, chapterPages, reason, status: 'rejected' as const };
        }
      });
      let failedConceptTasks = 0;
      const failedConceptDetails: string[] = [];

      // Persist chapter-by-chapter. A concept is written only to the page where
      // the chapter-wide AI response says it was first introduced.
      for (const result of generationResults) {
        const chapterLabel = result.chapter.title.trim() || `pages ${result.chapter.pageNumbers[0]}-${result.chapter.pageNumbers[result.chapter.pageNumbers.length - 1]}`;

        if (result.status === 'rejected') {
          failedConceptTasks++;
          failedConceptDetails.push(`${chapterLabel}: ${conceptGenerationErrorMessage(result.reason)}`);
          continue;
        }

        try {
          const stored = await storeGeneratedChapterConcepts(book.id, result.chapterPages, result.generatedConcepts);

          setGeneratedConceptsChapterCount((count) => count + 1);

          if (result.chapter.pageNumbers.includes(pageNumber)) {
            const currentConcepts: BookConcept[] = [];
            const references = new Map<string, number>();

            stored.conceptsByPage.forEach((pageConcepts, conceptPageNumber) => pageConcepts.forEach((concept) => {
              currentConcepts.push(concept);
              references.set(conceptReferenceKey(concept), conceptPageNumber);
            }));
            setConcepts(currentConcepts);
            setConceptFirstPageByKey(references);
          }
        } catch (reason) {
          failedConceptTasks++;
          failedConceptDetails.push(`${chapterLabel}: saving generated concepts failed (${conceptGenerationErrorMessage(reason)})`);
        }
      }

      const storedPagesAfterGeneration = await getBookPages(book.id);
      const analyzedPageNumbers = analysisPageNumbers(storedPagesAfterGeneration);
      const conceptsComplete = areAllBookPagesConceptsProcessed(totalPages, storedPagesAfterGeneration, analyzedPageNumbers);

      setPages(new Map(storedPagesAfterGeneration.map((storedPage) => [storedPage.pageNumber, storedPage])));
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);

      // Keep successful chapter results and let the pipeline continue even if
      // individual chapters failed. Chapters with no stored concepts remain
      // eligible for the "missing concepts only" rerun from the Concepts popup.
      const successfulConceptTasks = chapterTasks.length - failedConceptTasks;

      if (successfulConceptTasks > 0) {
        await completeStage('concepts');
        revealPane('textConcepts');
      }

      if (failedConceptTasks > 0 || !conceptsComplete) {
        const unprocessedPages = countUnprocessedBookPages(totalPages, storedPagesAfterGeneration, analyzedPageNumbers);

        const failureDetails = failedConceptDetails.length ? ` ${failedConceptDetails.join(' | ')}` : '';

        setError(successfulConceptTasks > 0
          ? `Concept generation completed with ${failedConceptTasks} of ${chapterTasks.length} attempted chapters failing; ${unprocessedPages} pages remain unprocessed. Successful chapter results were kept. Rerun Concepts to retry, optionally only for chapters missing concepts.${failureDetails}`
          : `Concept generation failed for all ${chapterTasks.length} attempted chapters; ${unprocessedPages} pages remain unprocessed. The Concepts stage remains incomplete. Retry concept generation.${failureDetails}`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
    } finally {
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();
    }
  }, [currentReaderProcessingSignal, addConceptsCost, completeStage, book.id, conceptChapters, generateAllConceptsModel, generateOnlyMissingConcepts, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, loadConceptCountsByChapter, onProcessingComplete, pageNumber, pages, processingPage, refreshConceptCounts, refreshEntityCounts, revealPane, totalPages]);


  return {
    generateConcepts,
    closePageGenerationConfirmation,
    confirmPageGeneration,
    generateAllConcepts
  };
}
