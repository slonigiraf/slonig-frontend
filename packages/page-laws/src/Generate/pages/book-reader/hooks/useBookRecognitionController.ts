// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookPage, BookProcessingStageKey } from '@slonigiraf/db';
import { getSetting, putBookPage, SettingKey, storeSetting } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';
import { MATHPIX_PDF_PAGE_PRICE_USD } from '../../../book/processing/config.js';
import { mathpixPdfSlices, recognizePdfWithMathpix } from '../../../book/processing/source/mathpixPdf.js';
import { createPdfPageSliceFactory, mathpixHeadingsForRecognitionPage } from '../BookReaderProcessing.js';
import type { RecognitionTarget } from '../BookReaderUtils.js';
import type { BookExternalCallProvider } from '../../../book/runtime/bookExternalCalls.js';

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

      const pageCount = slice.endPage - slice.startPage + 1;
      const createPdfPageSlice = await createPdfPageSliceFactory(file);
      const sliceFile = await createPdfPageSlice(slice.startPage, slice.endPage);
      const recognition = await recognizePdfWithMathpix(appId, apiKey, sliceFile, pageCount, undefined, addRecognizeExternalCall, currentReaderProcessingSignal());

      if (recognition.pages.length !== pageCount) {
        throw new Error(`Mathpix returned ${recognition.pages.length} pages for PDF pages ${slice.startPage}-${slice.endPage}.`);
      }

      addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD * pageCount);

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

      setPages(updatedPages);

      if (totalPages && Array.from({ length: totalPages }, (_, index) => updatedPages.get(index + 1)).every((page) => page?.pageMMD !== undefined)) {
        await completeStage('recognize');
      }

      setActivePane('text');
    } catch (recognitionError) {
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
    setRecognizedPageCount(0);

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
        let storedPageCount = 0;

        try {
          if (processingSignal.aborted) {
            const abortError = new Error('The operation was aborted.');

            abortError.name = 'AbortError';
            throw abortError;
          }

          const sliceFile = await createPdfPageSlice(startPage, endPage);
          const recognition = await recognizePdfWithMathpix(appId, apiKey, sliceFile, pageCount, undefined, addRecognizeExternalCall, processingSignal);

          if (recognition.pages.length !== pageCount) {
            throw new Error(`Mathpix returned ${recognition.pages.length} pages for PDF pages ${startPage}-${endPage}.`);
          }

          addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD * pageCount);

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
            storedPageCount++;
            setPages((current) => new Map(current).set(currentPageNumber, recognizedPage));
            setRecognizedPageCount((count) => count + 1);
          }

          return 0;
        } catch (error) {
          if (processingSignal.aborted || (error instanceof Error && error.name === 'AbortError')) {
            throw error;
          }

          return pageCount - storedPageCount;
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
