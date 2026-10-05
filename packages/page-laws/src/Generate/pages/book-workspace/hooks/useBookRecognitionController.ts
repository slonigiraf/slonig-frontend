// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookPage, BookProcessingStageKey } from '@slonigiraf/db';
import { deleteMathpixPdfJob, getMathpixPdfJob, getSetting, putBookPage, putMathpixPdfJob, SettingKey, storeSetting } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { MATHPIX_PDF_PAGE_PRICE_USD } from '../../../book/application/config.js';
import { MathpixPdfTerminalError, mathpixPdfSlices, recognizePdfWithMathpix } from '../../../book/infrastructure/pdf/mathpixPdf.js';
import { createPdfPageSliceFactory, mathpixHeadingsForRecognitionPage } from '../../../book/application/workspace/bookReaderProcessing.js';
import type { RecognitionTarget } from '../../../shared/types/bookWorkspace.js';
import type { BookExternalCallProvider } from '../../../book/infrastructure/storage/bookExternalCalls.js';

function isRecognizedPage (page: BookPage | undefined): boolean {
  return page?.pageMMD !== undefined;
}

function isRecognizedSlice (pages: Map<number, BookPage>, startPage: number, endPage: number): boolean {
  for (let currentPage = startPage; currentPage <= endPage; currentPage++) {
    if (!isRecognizedPage(pages.get(currentPage))) {
      return false;
    }
  }

  return true;
}

function recognizedPageTotal (pages: Map<number, BookPage>, totalPages: number): number {
  return Array.from({ length: totalPages }, (_, index) => pages.get(index + 1)).filter(isRecognizedPage).length;
}

interface UseBookRecognitionControllerOptions {
  addRecognizeCost: (costUsd: number) => void;
  addRecognizeExternalCall: (provider: Exclude<BookExternalCallProvider, 'openrouter'>) => void;
  bookId: number;
  completeStage: (stage: BookProcessingStageKey) => Promise<void>;
  currentReaderProcessingSignal: () => AbortSignal;
  file: File;
  isGeneratingAllConcepts: boolean;
  isIdentifyingChapters: boolean;
  onProcessingComplete: () => void;
  pageNumber: number;
  pages: Map<number, BookPage>;
  setActivePane: (pane: 'text') => void;
  setError: Dispatch<SetStateAction<string>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setPages: Dispatch<SetStateAction<Map<number, BookPage>>>;
  totalPages: number;
}

export function useBookRecognitionController ({
  addRecognizeCost,
  addRecognizeExternalCall,
  bookId,
  completeStage,
  currentReaderProcessingSignal,
  file,
  isGeneratingAllConcepts,
  isIdentifyingChapters,
  onProcessingComplete,
  pageNumber,
  pages,
  setActivePane,
  setError,
  setOpenRouterSpent,
  setPages,
  totalPages
}: UseBookRecognitionControllerOptions) {
  const [isMathpixKeyPromptOpen, setIsMathpixKeyPromptOpen] = useState(false);
  const [isRecognizingAll, setIsRecognizingAll] = useState(false);
  const [mathpixApiKey, setMathpixApiKey] = useState('');
  const [recognizedPageCount, setRecognizedPageCount] = useState(0);
  const [recognitionTarget, setRecognitionTarget] = useState<RecognitionTarget>('page');
  const [processingPage, setProcessingPage] = useState<number>();

  const recognizePage = useCallback(async (): Promise<void> => {
    if (processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setProcessingPage(pageNumber);
    let activeSlice: { endPage: number; startPage: number } | undefined;

    try {
      const [appId, apiKey] = await Promise.all([
        getSetting(SettingKey.MATHPIX_APP_ID),
        getSetting(SettingKey.MATHPIX_API_KEY)
      ]);

      if (!apiKey) {
        setMathpixApiKey('');
        setRecognitionTarget('page');
        setIsMathpixKeyPromptOpen(true);

        return;
      }

      const slice = mathpixPdfSlices(totalPages).find(({ endPage, startPage }) => pageNumber >= startPage && pageNumber <= endPage);

      if (!slice) {
        throw new Error(`Unable to determine the 40-page PDF slice containing page ${pageNumber}.`);
      }

      activeSlice = slice;

      // A completed slice is already durable in IndexedDB. Avoid paying for a
      // second Mathpix submission, and clean up a stale pending-job row if the
      // previous session reloaded after storing all pages but before deleting it.
      if (isRecognizedSlice(pages, slice.startPage, slice.endPage)) {
        await deleteMathpixPdfJob(bookId, slice.startPage, slice.endPage);

        if (totalPages && recognizedPageTotal(pages, totalPages) === totalPages) {
          await completeStage('recognize');
        }

        setActivePane('text');
        return;
      }

      const pageCount = slice.endPage - slice.startPage + 1;
      const pendingJob = await getMathpixPdfJob(bookId, slice.startPage, slice.endPage);
      const createPdfPageSlice = await createPdfPageSliceFactory(file);
      const sliceFile = await createPdfPageSlice(slice.startPage, slice.endPage);
      const recognition = await recognizePdfWithMathpix(appId, apiKey, sliceFile, pageCount, undefined, addRecognizeExternalCall, currentReaderProcessingSignal(), {
        pdfId: pendingJob?.pdfId,
        onPdfId: async (pdfId) => {
          await putMathpixPdfJob({
            bookId,
            created: Date.now(),
            endPage: slice.endPage,
            pdfId,
            startPage: slice.startPage
          });
          addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD * pageCount);
        }
      });

      if (recognition.pages.length !== pageCount) {
        throw new Error(`Mathpix returned ${recognition.pages.length} pages for PDF pages ${slice.startPage}-${slice.endPage}.`);
      }

      const updatedPages = new Map(pages);

      for (let index = 0; index < pageCount; index++) {
        const currentPageNumber = slice.startPage + index;
        const storedPage = updatedPages.get(currentPageNumber);
        const recognized = recognition.pages[index];
        const recognizedPage: BookPage = {
          ...storedPage,
          bookId,
          chapter: storedPage?.chapter ?? '',
          conceptsProcessed: storedPage?.conceptsProcessed ?? false,
          mathpixHeadings: mathpixHeadingsForRecognitionPage(recognition, index),
          pageMMD: recognized.pageMMD,
          pageMMDZip: recognized.pageMMDZip,
          pageNumber: currentPageNumber
        };

        await putBookPage(recognizedPage);
        updatedPages.set(currentPageNumber, recognizedPage);
      }

      // The remote job is no longer needed only after every page in the slice
      // has been durably stored. A reload before this point leaves the pdfId in
      // IndexedDB so the next run can reconnect instead of submitting again.
      await deleteMathpixPdfJob(bookId, slice.startPage, slice.endPage);
      setPages(updatedPages);

      if (totalPages && recognizedPageTotal(updatedPages, totalPages) === totalPages) {
        await completeStage('recognize');
      }

      setActivePane('text');
    } catch (recognitionError) {
      if (activeSlice && recognitionError instanceof MathpixPdfTerminalError) {
        try {
          await deleteMathpixPdfJob(bookId, activeSlice.startPage, activeSlice.endPage);
        } catch (deleteError) {
          console.error(deleteError);
        }
      }

      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this PDF slice.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [addRecognizeCost, addRecognizeExternalCall, completeStage, currentReaderProcessingSignal, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, setActivePane, setError, setOpenRouterSpent, setPages, totalPages, bookId]);

  const recognizeAllPages = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsRecognizingAll(true);
    setRecognizedPageCount(recognizedPageTotal(pages, totalPages));

    const [appId, apiKey] = await Promise.all([
      getSetting(SettingKey.MATHPIX_APP_ID),
      getSetting(SettingKey.MATHPIX_API_KEY)
    ]);

    // Existing installations only stored MATHPIX_API_KEY and previously
    // authenticated Mathpix with the app_key header alone. Keep that path
    // working instead of forcing users through a new App ID migration prompt.
    if (!apiKey) {
      setMathpixApiKey('');
      setRecognitionTarget('all');
      setIsMathpixKeyPromptOpen(true);
      setIsRecognizingAll(false);
      onProcessingComplete();

      return;
    }

    let recognitionCompleted = false;
    const processingSignal = currentReaderProcessingSignal();

    try {
      const createPdfPageSlice = await createPdfPageSliceFactory(file);
      const failedPagesBySlice = await Promise.all(mathpixPdfSlices(totalPages).map(async ({ endPage, startPage }) => {
        const pageCount = endPage - startPage + 1;
        const existingRecognizedPages = Array.from({ length: pageCount }, (_, index) => pages.get(startPage + index)).filter(isRecognizedPage).length;
        let newlyStoredPageCount = 0;

        try {
          if (processingSignal.aborted) {
            const abortError = new Error('The operation was aborted.');

            abortError.name = 'AbortError';
            throw abortError;
          }

          // The entire chunk is already durable, so no Mathpix request is
          // needed. Also remove a stale job row left by a reload between the
          // final page write and pending-job cleanup.
          if (existingRecognizedPages === pageCount) {
            await deleteMathpixPdfJob(bookId, startPage, endPage);
            return 0;
          }

          const pendingJob = await getMathpixPdfJob(bookId, startPage, endPage);
          const sliceFile = await createPdfPageSlice(startPage, endPage);
          const recognition = await recognizePdfWithMathpix(appId, apiKey, sliceFile, pageCount, undefined, addRecognizeExternalCall, processingSignal, {
            pdfId: pendingJob?.pdfId,
            onPdfId: async (pdfId) => {
              await putMathpixPdfJob({ bookId, created: Date.now(), endPage, pdfId, startPage });
              addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD * pageCount);
            }
          });

          if (recognition.pages.length !== pageCount) {
            throw new Error(`Mathpix returned ${recognition.pages.length} pages for PDF pages ${startPage}-${endPage}.`);
          }

          for (let index = 0; index < pageCount; index++) {
            const currentPageNumber = startPage + index;
            const storedPage = pages.get(currentPageNumber);
            const recognized = recognition.pages[index];
            const recognizedPage: BookPage = {
              ...storedPage,
              bookId,
              chapter: storedPage?.chapter ?? '',
              conceptsProcessed: storedPage?.conceptsProcessed ?? false,
              mathpixHeadings: mathpixHeadingsForRecognitionPage(recognition, index),
              pageMMD: recognized.pageMMD,
              pageMMDZip: recognized.pageMMDZip,
              pageNumber: currentPageNumber
            };

            await putBookPage(recognizedPage);

            if (!isRecognizedPage(storedPage)) {
              newlyStoredPageCount++;
              setRecognizedPageCount((count) => count + 1);
            }

            setPages((current) => new Map(current).set(currentPageNumber, recognizedPage));
          }

          await deleteMathpixPdfJob(bookId, startPage, endPage);
          return 0;
        } catch (error) {
          if (processingSignal.aborted || (error instanceof Error && error.name === 'AbortError')) {
            throw error;
          }

          if (error instanceof MathpixPdfTerminalError) {
            try {
              await deleteMathpixPdfJob(bookId, startPage, endPage);
            } catch (deleteError) {
              console.error(deleteError);
            }
          }

          return Math.max(0, pageCount - existingRecognizedPages - newlyStoredPageCount);
        }
      }));
      const failedPages = failedPagesBySlice.reduce((total, count) => total + count, 0);

      if (failedPages) {
        setError(`${failedPages} of ${totalPages} pages could not be recognized.`);
      } else {
        await completeStage('recognize');
        recognitionCompleted = true;
      }
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
    } finally {
      setIsRecognizingAll(false);
      onProcessingComplete();

      if (recognitionCompleted) {
        setActivePane('text');
      }
    }
  }, [addRecognizeCost, addRecognizeExternalCall, bookId, completeStage, currentReaderProcessingSignal, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, processingPage, setActivePane, setError, setOpenRouterSpent, setPages, totalPages]);

  const saveMathpixApiKey = useCallback(async (): Promise<void> => {
    const apiKey = mathpixApiKey.trim();

    if (!apiKey) {
      return;
    }

    await storeSetting(SettingKey.MATHPIX_API_KEY, apiKey);
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
    await (recognitionTarget === 'all' ? recognizeAllPages() : recognizePage());
  }, [mathpixApiKey, recognitionTarget, recognizeAllPages, recognizePage]);

  const submitMathpixApiKey = useCallback((): void => {
    saveMathpixApiKey().catch((saveError) => {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the Mathpix API key.');
    });
  }, [saveMathpixApiKey, setError]);

  const closeMathpixKeyPrompt = useCallback((): void => {
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
  }, []);

  return {
    closeMathpixKeyPrompt,
    isMathpixKeyPromptOpen,
    isRecognizingAll,
    mathpixApiKey,
    processingPage,
    recognizedPageCount,
    recognitionTarget,
    recognizeAllPages,
    recognizePage,
    saveMathpixApiKey,
    setIsMathpixKeyPromptOpen,
    setIsRecognizingAll,
    setMathpixApiKey,
    setProcessingPage,
    setRecognizedPageCount,
    setRecognitionTarget,
    submitMathpixApiKey
  } as const;
}
