// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import { getSetting, SettingKey } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { BookReaderCommandAction, PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';

import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_EMBEDDER, DEFAULT_STANDARDS_MODEL } from '../../../book/application/config.js';
import { bookProcessingManager } from '../../../book/application/pipeline/bookProcessingManager.js';
import { useTranslation } from '../../../../common/translate.js';
import { createProcessingToolbars } from '../processing/UploadProcessingToolbar.js';
import { useUploadConceptGeneration } from './useUploadConceptGeneration.js';
import { useUploadConceptOrganization } from './useUploadConceptOrganization.js';
import { useUploadMetadataProcessing } from './useUploadMetadataProcessing.js';
import { useUploadPricing } from './useUploadPricing.js';
import { useUploadStandardsProcessing } from './useUploadStandardsProcessing.js';

interface UploadProcessingParams {
  isBusy: boolean;
  readerFile?: File;
  refreshBooks: () => Promise<void>;
  selectedBook?: Book;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setError: Dispatch<SetStateAction<string>>;
}

export function useUploadProcessing ({ isBusy, readerFile, refreshBooks, selectedBook, setBooks, setError }: UploadProcessingParams) {
  const { t } = useTranslation();
  const [pendingProcessingAction, setPendingProcessingAction] = useState<PendingBookProcessingAction>();
  const [generateAllConceptsModel, setGenerateAllConceptsModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [standardsModel, setStandardsModel] = useState(DEFAULT_STANDARDS_MODEL);
  const [embeddingModel, setEmbeddingModel] = useState(DEFAULT_STANDARDS_EMBEDDER);

  const requestProcessing = useCallback((action: BookReaderCommandAction): void => {
    if (selectedBook) bookProcessingManager.enqueue(selectedBook.id, action);
  }, [selectedBook?.id]);

  useEffect(() => {
    getSetting(SettingKey.CONCEPTS_EMBEDDER)
      .then((storedModel) => {
        if (storedModel) {
          setEmbeddingModel(storedModel);
        }
      })
      .catch(() => undefined);
  }, []);

  const metadata = useUploadMetadataProcessing({
    generateAllConceptsModel,
    readerFile,
    requestProcessing,
    selectedBook,
    setBooks,
    setError,
    setPendingProcessingAction
  });
  const conceptGeneration = useUploadConceptGeneration({
    embeddingModel,
    generateAllConceptsModel,
    requestProcessing,
    selectedBook,
    setBooks,
    setEmbeddingModel,
    setError,
    setPendingProcessingAction
  });
  const conceptOrganization = useUploadConceptOrganization({
    embeddingModel,
    generateAllConceptsModel,
    requestProcessing,
    selectedBook,
    setBooks,
    setError,
    setPendingProcessingAction
  });
  const standardsProcessing = useUploadStandardsProcessing({
    embeddingModel,
    requestProcessing,
    selectedBook,
    setBooks,
    setError,
    setPendingProcessingAction,
    standardsModel
  });
  const pricing = useUploadPricing({
    embeddingModel,
    readerFile,
    refreshBooks,
    selectedBook,
    setBooks,
    setError,
    setEmbeddingModel,
    setGenerateAllConceptsModel,
    setPendingProcessingAction,
    setStandardsModel
  });

  useEffect((): void => {
    if (!pricing.isFastForwardRunning) {
      return;
    }

    if (metadata.isRecognizeConfirmationOpen) {
      metadata.confirmRecognize();
    } else if (metadata.isIdentifyChaptersConfirmationOpen) {
      metadata.confirmIdentifyChapters();
    } else if (conceptGeneration.isGenerateConceptsConfirmationOpen) {
      conceptGeneration.confirmGenerateConcepts();
    } else if (conceptGeneration.isFixConceptsConfirmationOpen) {
      conceptGeneration.confirmFixConcepts();
    } else if (conceptGeneration.isEmbeddingsConfirmationOpen) {
      conceptGeneration.confirmEmbeddings();
    } else if (conceptOrganization.isDeduplicateConceptsConfirmationOpen) {
      conceptOrganization.confirmDeduplicateConcepts();
    } else if (conceptOrganization.isSortConceptsConfirmationOpen) {
      conceptOrganization.confirmSortConcepts();
    } else if (conceptOrganization.isRefineChaptersConfirmationOpen) {
      conceptOrganization.confirmRefineChapters();
    } else if (standardsProcessing.isStandardsConfirmationOpen) {
      standardsProcessing.confirmAssignStandards();
    }
  }, [
    conceptOrganization.confirmDeduplicateConcepts,
    conceptGeneration.confirmEmbeddings,
    conceptGeneration.confirmFixConcepts,
    conceptGeneration.confirmGenerateConcepts,
    conceptOrganization.confirmRefineChapters,
    conceptOrganization.confirmSortConcepts,
    conceptOrganization.isDeduplicateConceptsConfirmationOpen,
    conceptGeneration.isEmbeddingsConfirmationOpen,
    conceptGeneration.isFixConceptsConfirmationOpen,
    conceptGeneration.isGenerateConceptsConfirmationOpen,
    conceptOrganization.isRefineChaptersConfirmationOpen,
    conceptOrganization.isSortConceptsConfirmationOpen,
    metadata.confirmIdentifyChapters,
    metadata.confirmRecognize,
    metadata.isIdentifyChaptersConfirmationOpen,
    metadata.isRecognizeConfirmationOpen,
    pricing.isFastForwardRunning,
    standardsProcessing.confirmAssignStandards,
    standardsProcessing.isStandardsConfirmationOpen
  ]);

  const onBookChange = useCallback((updatedBook: Book): void => {
    setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
  }, [setBooks]);

  const onProcessingComplete = useCallback((): void => {
    setPendingProcessingAction(undefined);
    refreshBooks().catch(() => setError(t('Unable to refresh book processing stages.')));
  }, [refreshBooks, setError, t]);

  const processingToolbars = selectedBook
    ? createProcessingToolbars(selectedBook, isBusy, Boolean(readerFile), {
      onAssignStandards: standardsProcessing.onAssignStandards,
      onDeduplicateConcepts: conceptOrganization.onDeduplicateConcepts,
      onEmbeddings: conceptGeneration.onEmbeddings,
      onFixConcepts: conceptGeneration.onFixConcepts,
      onGenerateConcepts: conceptGeneration.onGenerateConcepts,
      onIdentifyChapters: metadata.onIdentifyChapters,
      onRecognize: metadata.onRecognize,
      onRefineChapters: conceptOrganization.onRefineChapters,
      onSkipRefineChapters: conceptOrganization.skipRefineChapters,
      onRetryMissingConcepts: conceptGeneration.onRetryMissingConcepts,
      onShowAge: metadata.onShowAge,
      onShowLanguage: metadata.onShowLanguage,
      onShowSubject: metadata.onShowSubject,
      onSortConcepts: conceptOrganization.onSortConcepts
    }, t)
    : { prefix: [], suffix: [] };

  return {
    conceptGeneration,
    conceptOrganization,
    embeddingModel,
    generateAllConceptsModel,
    metadata,
    onBookChange,
    onProcessingComplete,
    pendingProcessingAction,
    pricing,
    processingToolbars,
    setEmbeddingModel,
    setGenerateAllConceptsModel,
    setStandardsModel,
    standardsProcessing,
    standardsModel
  };
}

export type UploadProcessing = ReturnType<typeof useUploadProcessing>;
