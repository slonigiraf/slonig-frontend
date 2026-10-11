// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookProcessingStageKey } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { bypassBookProcessingStage, getBook, resetBookProcessingStagesFrom } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';
import type { BookExternalCalls } from '../../../book/infrastructure/storage/bookExternalCalls.js';
import type { BookStageTimes } from '../../../book/infrastructure/storage/bookStageTime.js';
import type { FastForwardEstimate } from '../components/UploadPriceModals.js';

import { estimateAiInput } from '../../../book/application/pricing/aiEstimate.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_MODEL, MATHPIX_PDF_PAGE_PRICE_USD } from '../../../book/application/config.js';
import { STANDARDS_MATCH_RUNS } from '../../../book/domain/standards/standards.js';
import { BOOK_PRICE_STAGES } from '../../../book/application/pipeline/bookPipeline.js';
import { bookProcessingManager } from '../../../book/application/pipeline/bookProcessingManager.js';
import { skipBookStage } from '../../../book/application/pipeline/skipBookStage.js';
import { useBookProcessingRun } from '../../../book/application/pipeline/useBookProcessingRun.js';
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
  setEmbeddingModel: Dispatch<SetStateAction<string>>;
  setPendingProcessingAction: Dispatch<SetStateAction<PendingBookProcessingAction | undefined>>;
  setStandardsModel: Dispatch<SetStateAction<string>>;
}

export function useUploadPricing ({ embeddingModel, readerFile, refreshBooks, selectedBook, setBooks, setError, setEmbeddingModel, setGenerateAllConceptsModel, setPendingProcessingAction, setStandardsModel }: UploadPricingParams) {
  const { t } = useTranslation();
  const [isPriceOpen, setIsPriceOpen] = useState(false);
  const [priceBook, setPriceBook] = useState<Book>();
  const [priceStageTimes, setPriceStageTimes] = useState<BookStageTimes>({});
  const [priceExternalCalls, setPriceExternalCalls] = useState<BookExternalCalls>({});
  const [isFastForwardConfirmationOpen, setIsFastForwardConfirmationOpen] = useState(false);
  const processingRun = useBookProcessingRun(selectedBook?.id);
  const isFastForwardRunning = processingRun?.mode === 'fastForward' && processingRun.status === 'running';
  const isFastForwardPaused = processingRun?.mode === 'fastForward' && processingRun.status === 'paused';
  const [fastForwardStartKey, setFastForwardStartKey] = useState<string>();
  const [fastForwardEstimate, setFastForwardEstimate] = useState<FastForwardEstimate>();
  const [skipRefineChaptersInFastForward, setSkipRefineChaptersInFastForward] = useState(false);

  useEffect(() => {
    if (selectedBook) {
      void bookProcessingManager.restore(selectedBook.id).catch(console.error);
    }
  }, [selectedBook?.id]);

  // A recovered run must use the same model configuration rather than whatever
  // defaults the new Upload component happened to initialize with.
  useEffect(() => {
    if (processingRun?.mode !== 'fastForward' || !processingRun.models) return;
    if (processingRun.status !== 'running' && processingRun.status !== 'paused') return;
    setEmbeddingModel(processingRun.models.embedding);
    setGenerateAllConceptsModel(processingRun.models.generation);
    setStandardsModel(processingRun.models.standards);
  }, [processingRun?.id, processingRun?.status, setEmbeddingModel, setGenerateAllConceptsModel, setStandardsModel]);

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
    if (!selectedBook || isFastForwardRunning) {
      return;
    }

    // The same Fast Forward button resumes an interrupted run. Preserve its
    // persisted cursor, completed stages and model settings instead of opening
    // a new price estimate and resetting the selected pipeline stage.
    if (isFastForwardPaused) {
      // The interrupted request may have been accepted by its paid provider.
      if (window.confirm(t('Resume Fast Forward? An interrupted stage may be charged again.'))) {
        bookProcessingManager.resume(selectedBook.id);
      }
      return;
    }

    if (!readerFile) return;

    const requestedStartIndex = BOOK_PRICE_STAGES.findIndex(({ key }) => key === startKey);

    if (requestedStartIndex < 0) {
      return;
    }

    setFastForwardStartKey(startKey);
    setFastForwardEstimate(undefined);
    setSkipRefineChaptersInFastForward(false);
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
      const refineChaptersUsd = remainingAiStages.reduce((total, { key }) => {
        if (key !== 'refineChapters') return total;
        const recorded = selectedBook.stageSpend?.[key] ?? 0;

        return total + (recorded > 0 ? recorded : typicalRecordedCost > 0 ? typicalRecordedCost : regularFallback);
      }, 0);

      setFastForwardEstimate({
        aiUsd,
        pageCount,
        refineChaptersUsd,
        recognitionUsd,
        remainingStages: remaining.length,
        totalUsd: recognitionUsd + aiUsd
      });
    };

    calculate()
      .catch(() => setError(t('Unable to estimate the fast-forward processing cost.')))
      .finally(() => document?.destroy().catch(console.error));
  }, [embeddingModel, isFastForwardPaused, isFastForwardRunning, readerFile, selectedBook, setError, t]);

  const closeFastForwardConfirmation = useCallback((): void => {
    setIsFastForwardConfirmationOpen(false);
    setFastForwardStartKey(undefined);
  }, []);

  const confirmFastForward = useCallback(async (): Promise<void> => {
    if (!selectedBook || !fastForwardStartKey || !fastForwardEstimate || fastForwardEstimate.remainingStages === 0) {
      return;
    }

    try {
      // Choosing a later stage after a recorded failure explicitly acknowledges
      // the previous failure. Do not turn it into a successful checkpoint.
      const failedKey = processingRun?.status === 'failed' ? (processingRun.currentStage ?? processingRun.triggeredStage ?? processingRun.stages.find((key) => !processingRun.completed.includes(key) && !processingRun.bypassedStages?.includes(key))) : undefined;
      const failedIndex = failedKey ? BOOK_PRICE_STAGES.findIndex(({ key }) => key === failedKey) : -1;
      const startIndex = BOOK_PRICE_STAGES.findIndex(({ key }) => key === fastForwardStartKey);

      if (failedKey && (processingRun?.failedStages?.[failedKey] || processingRun?.error) && failedIndex >= 0 && startIndex > failedIndex) {
        await bypassBookProcessingStage(selectedBook.id, failedKey);
      }
      const resetBook = await resetBookProcessingStagesFrom(selectedBook.id, fastForwardStartKey as BookProcessingStageKey);

      if (resetBook) {
        setBooks((current) => current.map((book) => book.id === resetBook.id ? resetBook : book));
      }

      setGenerateAllConceptsModel(DEFAULT_PROCESSING_MODEL);
      setStandardsModel(DEFAULT_STANDARDS_MODEL);
      setIsFastForwardConfirmationOpen(false);
      await bookProcessingManager.startFastForward(
        selectedBook.id,
        BOOK_PRICE_STAGES.slice(BOOK_PRICE_STAGES.findIndex(({ key }) => key === fastForwardStartKey)).map(({ key }) => key),
        skipRefineChaptersInFastForward,
        { generation: DEFAULT_PROCESSING_MODEL, embedding: embeddingModel, standards: DEFAULT_STANDARDS_MODEL }
      );
    } catch {
      setError(t('Unable to prepare the selected stage for fast-forward processing.'));
    }
  }, [embeddingModel, fastForwardEstimate, fastForwardStartKey, processingRun, selectedBook, setBooks, setError, setGenerateAllConceptsModel, setStandardsModel, skipRefineChaptersInFastForward, t]);

  const abortFastForward = useCallback((): void => {
    if (selectedBook) bookProcessingManager.cancel(selectedBook.id);
  }, [selectedBook?.id]);

  // Skip is offered in the stage's price confirmation, next to Run, not as
  // a persistent toolbar action. A bypass is never a success checkpoint.
  const skipStageFromConfirmation = useCallback(async (stage: BookProcessingStageKey): Promise<boolean> => {
    if (!selectedBook || isFastForwardRunning) return false;

    try {
      const updated = await skipBookStage(selectedBook.id, stage);
      setBooks((books) => books.map((book) => book.id === updated.id ? updated : book));
      setError('');
      return true;
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : t('Unable to skip this stage.'));
      return false;
    }
  }, [isFastForwardRunning, selectedBook?.id, setBooks, setError, t]);

  const onFastForwardComplete = useCallback((): void => {
    if (selectedBook) bookProcessingManager.complete(selectedBook.id);
    setFastForwardStartKey(undefined);
    setPendingProcessingAction(undefined);
    refreshBooks().catch(() => setError(t('Unable to refresh book processing stages.')));
  }, [refreshBooks, selectedBook?.id, setError, setPendingProcessingAction, t]);

  return {
    abortFastForward,
    skipStageFromConfirmation,
    closeFastForwardConfirmation,
    closePrice,
    confirmFastForward,
    fastForwardEstimate,
    fastForwardStartKey: isFastForwardRunning ? processingRun.startStage : fastForwardStartKey,
    skipRefineChaptersInFastForward: isFastForwardRunning ? processingRun.skipRefineChapters : skipRefineChaptersInFastForward,
    setSkipRefineChaptersInFastForward,
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
