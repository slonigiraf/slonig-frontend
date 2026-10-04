// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookProcessingStageKey } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getBook, resetBookProcessingStagesFrom } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useState } from 'react';

import type { PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';
import type { BookExternalCalls } from '../../../book/infrastructure/storage/bookExternalCalls.js';
import type { BookStageTimes } from '../../../book/infrastructure/storage/bookStageTime.js';
import type { FastForwardEstimate } from '../components/UploadPriceModals.js';

import { estimateAiInput } from '../../../book/application/pricing/aiEstimate.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_MODEL, MATHPIX_PDF_PAGE_PRICE_USD } from '../../../book/application/config.js';
import { STANDARDS_MATCH_RUNS } from '../../../book/domain/standards/standards.js';
import { BOOK_PRICE_STAGES } from '../../../book/application/pipeline/bookPipeline.js';
import { loadBookExternalCalls } from '../../../book/infrastructure/storage/bookExternalCalls.js';
import { loadBookStageTimes } from '../../../book/infrastructure/storage/bookStageTime.js';
import { loadPdfJs } from '../../../book/infrastructure/pdf/pdf.js';
import { useTranslation } from '../../../../common/translate.js';

interface UploadPricingParams {
  embeddingModel: string;
  readerFile?: File;
  refreshBooks: () => Promise<void>;
  selectedBook?: Book;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setGenerateAllConceptsModel: Dispatch<SetStateAction<string>>;
  setPendingProcessingAction: Dispatch<SetStateAction<PendingBookProcessingAction | undefined>>;
  setStandardsModel: Dispatch<SetStateAction<string>>;
}

export function useUploadPricing ({ embeddingModel, readerFile, refreshBooks, selectedBook, setBooks, setError, setGenerateAllConceptsModel, setPendingProcessingAction, setStandardsModel }: UploadPricingParams) {
  const { t } = useTranslation();
  const [isPriceOpen, setIsPriceOpen] = useState(false);
  const [priceBook, setPriceBook] = useState<Book>();
  const [priceStageTimes, setPriceStageTimes] = useState<BookStageTimes>({});
  const [priceExternalCalls, setPriceExternalCalls] = useState<BookExternalCalls>({});
  const [isFastForwardConfirmationOpen, setIsFastForwardConfirmationOpen] = useState(false);
  const [isFastForwardRunning, setIsFastForwardRunning] = useState(false);
  const [fastForwardStartKey, setFastForwardStartKey] = useState<string>();
  const [fastForwardEstimate, setFastForwardEstimate] = useState<FastForwardEstimate>();

  const onPrice = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setPriceBook(selectedBook);
    setPriceStageTimes(loadBookStageTimes(selectedBook.id));
    setPriceExternalCalls(loadBookExternalCalls(selectedBook.id));
    setIsPriceOpen(true);
    getBook(selectedBook.id)
      .then((storedBook) => {
        if (storedBook) {
          setPriceBook(storedBook);
        }
      })
      .catch(() => setError(t('Unable to load book spending.')));
  }, [selectedBook, setError, t]);

  const closePrice = useCallback((): void => {
    setIsPriceOpen(false);
    setPriceBook(undefined);
    setPriceStageTimes({});
    setPriceExternalCalls({});
  }, []);

  const onFastForward = useCallback((startKey: string): void => {
    if (!selectedBook || !readerFile || isFastForwardRunning) {
      return;
    }

    const requestedStartIndex = BOOK_PRICE_STAGES.findIndex(({ key }) => key === startKey);

    if (requestedStartIndex < 0) {
      return;
    }

    setFastForwardStartKey(startKey);
    setFastForwardEstimate(undefined);
    setIsFastForwardConfirmationOpen(true);

    let document: PDFDocumentProxy | undefined;

    const calculate = async (): Promise<void> => {
      const { getDocument } = await loadPdfJs();
      const task = getDocument({ data: new Uint8Array(await readerFile.arrayBuffer()) });

      document = await task.promise;

      const remaining = BOOK_PRICE_STAGES.slice(requestedStartIndex);
      const pageCount = document.numPages;
      const recognitionUsd = remaining.some(({ key }) => key === 'recognize') ? pageCount * MATHPIX_PDF_PAGE_PRICE_USD : 0;
      const remainingAiStages = remaining.filter(({ key }) => key !== 'recognize');
      const recordedStageCosts = BOOK_PRICE_STAGES.flatMap(({ key }) => {
        const value = selectedBook.stageSpend?.[key] ?? 0;

        return value > 0 ? [value] : [];
      }).sort((a, b) => a - b);
      const typicalRecordedCost = recordedStageCosts.length
        ? recordedStageCosts[Math.floor(recordedStageCosts.length / 2)]
        : 0;
      const syntheticInputLength = Math.min(120_000, Math.max(4_000, pageCount * 900));
      const embeddingStages = remainingAiStages.filter(({ key }) => key === 'embeddings');
      const standardStages = remainingAiStages.filter(({ key }) => key === 'standards');
      const regularStages = remainingAiStages.filter(({ key }) => key !== 'standards' && key !== 'embeddings');
      const regularFallback = regularStages.length
        ? estimateAiInput(DEFAULT_PROCESSING_MODEL, regularStages.map(() => 'x'.repeat(syntheticInputLength)), 1_200).totalPriceUsd / regularStages.length
        : 0;
      const embeddingsFallback = embeddingStages.length
        ? estimateAiInput(embeddingModel, embeddingStages.map(() => 'x'.repeat(syntheticInputLength)), 0).totalPriceUsd / embeddingStages.length
        : 0;
      const standardsFallback = standardStages.length
        ? (estimateAiInput(embeddingModel, standardStages.map(() => 'x'.repeat(syntheticInputLength)), 0).totalPriceUsd +
          estimateAiInput(DEFAULT_STANDARDS_MODEL, standardStages.flatMap(() => Array.from({ length: STANDARDS_MATCH_RUNS }, () => 'x'.repeat(Math.min(24_000, syntheticInputLength)))), 300).totalPriceUsd) / standardStages.length
        : 0;
      const aiUsd = remainingAiStages.reduce((total, { key }) => {
        const recorded = selectedBook.stageSpend?.[key] ?? 0;
        const fallback = key === 'standards' ? standardsFallback : key === 'embeddings' ? embeddingsFallback : regularFallback;
        const useSpecializedFallback = key === 'embeddings' || key === 'standards';

        return total + (recorded > 0 ? recorded : !useSpecializedFallback && typicalRecordedCost > 0 ? typicalRecordedCost : fallback);
      }, 0);

      setFastForwardEstimate({
        aiUsd,
        pageCount,
        recognitionUsd,
        remainingStages: remaining.length,
        totalUsd: recognitionUsd + aiUsd
      });
    };

    calculate()
      .catch(() => setError(t('Unable to estimate the fast-forward processing cost.')))
      .finally(() => document?.destroy().catch(console.error));
  }, [embeddingModel, isFastForwardRunning, readerFile, selectedBook, setError, t]);

  const closeFastForwardConfirmation = useCallback((): void => {
    setIsFastForwardConfirmationOpen(false);
    setFastForwardStartKey(undefined);
  }, []);

  const confirmFastForward = useCallback(async (): Promise<void> => {
    if (!selectedBook || !fastForwardStartKey || !fastForwardEstimate || fastForwardEstimate.remainingStages === 0) {
      return;
    }

    try {
      const resetBook = await resetBookProcessingStagesFrom(selectedBook.id, fastForwardStartKey as BookProcessingStageKey);

      if (resetBook) {
        setBooks((current) => current.map((book) => book.id === resetBook.id ? resetBook : book));
      }

      setGenerateAllConceptsModel(DEFAULT_PROCESSING_MODEL);
      setStandardsModel(DEFAULT_STANDARDS_MODEL);
      setIsFastForwardConfirmationOpen(false);
      setIsFastForwardRunning(true);
    } catch {
      setError(t('Unable to prepare the selected stage for fast-forward processing.'));
    }
  }, [fastForwardEstimate, fastForwardStartKey, selectedBook, setBooks, setError, setGenerateAllConceptsModel, setStandardsModel, t]);

  const abortFastForward = useCallback((): void => {
    setIsFastForwardRunning(false);
  }, []);

  const onFastForwardComplete = useCallback((): void => {
    setIsFastForwardRunning(false);
    setFastForwardStartKey(undefined);
    setPendingProcessingAction(undefined);
    refreshBooks().catch(() => setError(t('Unable to refresh book processing stages.')));
  }, [refreshBooks, setError, setPendingProcessingAction, t]);

  return {
    abortFastForward,
    closeFastForwardConfirmation,
    closePrice,
    confirmFastForward,
    fastForwardEstimate,
    fastForwardStartKey,
    isFastForwardConfirmationOpen,
    isFastForwardRunning,
    isPriceOpen,
    onFastForward,
    onFastForwardComplete,
    onPrice,
    priceBook,
    priceExternalCalls,
    priceStageTimes
  };
}
