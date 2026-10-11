// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookStageSpendKey } from '@slonigiraf/db';
import { useEffect, useState } from 'react';
import { useTranslation } from '../../../../common/translate.js';
import { REFINE_CHAPTERS_SPEND_STAGE } from '../../../book/domain/chapters/refineChapters.js';
import { useBookStageTimer } from '../../../book/infrastructure/storage/bookStageTime.js';
import type { PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';
import type { ProcessingStatus } from '../../../shared/types/processing.js';

interface UseBookReaderProcessingStatusOptions {
  autoRunAll: boolean;
  autoRunProcessing?: ProcessingStatus;
  bookId: number;
  chapterIdentificationLabel: string;
  conceptChapterCount: number;
  confirmedProcessingStage?: BookStageSpendKey;
  fixConceptsTargetChapterCount: number;
  hasFixConceptsReview: boolean;
  hasDeduplicateConceptsReview: boolean;
  isApplyingDeduplicateConceptsReview: boolean;
  fixedConceptsChapterCount: number;
  generatedConceptsChapterCount: number;
  identifiedChapterPageCount: number;
  isApplyingFixConceptsReview: boolean;
  isAssigningStandards: boolean;
  isDeduplicatingConcepts: boolean;
  isDetectingBookAge: boolean;
  isDetectingBookLanguage: boolean;
  isDetectingBookSubject: boolean;
  isEmbeddingConcepts: boolean;
  isFixingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isIdentifyingChapters: boolean;
  isRecognizingAll: boolean;
  isRefiningChapters: boolean;
  isSortingConcepts: boolean;
  openRouterSpent: number;
  pendingProcessingAction?: PendingBookProcessingAction;
  processingPage?: number;
  recognizedPageCount: number;
  refinedChaptersChapterCount: number;
  sortedConceptsChapterCount: number;
  standardsAssignedChapterCount: number;
  standardsTargetChapterCount: number;
  totalPages: number;
}

export function useBookReaderProcessingStatus ({
  autoRunAll,
  autoRunProcessing,
  bookId,
  chapterIdentificationLabel,
  conceptChapterCount,
  confirmedProcessingStage,
  fixConceptsTargetChapterCount,
  hasFixConceptsReview,
  hasDeduplicateConceptsReview,
  isApplyingDeduplicateConceptsReview,
  fixedConceptsChapterCount,
  generatedConceptsChapterCount,
  identifiedChapterPageCount,
  isApplyingFixConceptsReview,
  isAssigningStandards,
  isDeduplicatingConcepts,
  isDetectingBookAge,
  isDetectingBookLanguage,
  isDetectingBookSubject,
  isEmbeddingConcepts,
  isFixingConcepts,
  isGeneratingAllConcepts,
  isIdentifyingChapters,
  isRecognizingAll,
  isRefiningChapters,
  isSortingConcepts,
  openRouterSpent,
  pendingProcessingAction,
  processingPage,
  recognizedPageCount,
  refinedChaptersChapterCount,
  sortedConceptsChapterCount,
  standardsAssignedChapterCount,
  standardsTargetChapterCount,
  totalPages
}: UseBookReaderProcessingStatusOptions) {
  const { t } = useTranslation();
  const [lastReaderProcessing, setLastReaderProcessing] = useState<ProcessingStatus>();
  // Extraction is only the first part of Fix concepts. In Fast Forward the
  // generated review is applied automatically, and the stage is not finished
  // until those changes have been saved and its DB checkpoint is committed.
  // Keep the reader busy across that handoff so Fast Forward cannot mistake
  // the interval between AI extraction and review application for a failure.
  const isFixConceptsProcessing = isFixingConcepts || (autoRunAll && (hasFixConceptsReview || isApplyingFixConceptsReview));
  // Deduplicate concepts is a two-step operation: extraction produces a review,
  // then the review is automatically applied and committed in Fast Forward.
  // Its checkpoint is not written until that second step finishes. Keep the
  // reader busy throughout so the manager never treats the handoff as failure.
  const isDeduplicateConceptsProcessing = isDeduplicatingConcepts || (autoRunAll && (hasDeduplicateConceptsReview || isApplyingDeduplicateConceptsReview));
  const processingTotal = isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined || isEmbeddingConcepts || pendingProcessingAction === 'embeddings' || isDeduplicateConceptsProcessing || pendingProcessingAction === 'deduplicateConcepts'
    ? 1
    : isFixConceptsProcessing || pendingProcessingAction === 'fixConcepts'
      ? Math.max(1, fixConceptsTargetChapterCount || conceptChapterCount)
      : isAssigningStandards
        ? Math.max(1, standardsTargetChapterCount || conceptChapterCount)
      : isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isSortingConcepts || pendingProcessingAction === 'sortConcepts' || isRefiningChapters || pendingProcessingAction === 'refineChapters' || pendingProcessingAction === 'standards'
        ? Math.max(1, conceptChapterCount)
        : Math.max(1, totalPages);
  const processingValue = isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined || isEmbeddingConcepts || pendingProcessingAction === 'embeddings' || isDeduplicateConceptsProcessing || pendingProcessingAction === 'deduplicateConcepts'
    ? 0
    : isRecognizingAll || pendingProcessingAction === 'recognize'
      ? recognizedPageCount
      : isIdentifyingChapters || pendingProcessingAction === 'chapters'
        ? identifiedChapterPageCount
        : isFixConceptsProcessing || pendingProcessingAction === 'fixConcepts'
          ? fixedConceptsChapterCount
          : isSortingConcepts || pendingProcessingAction === 'sortConcepts'
            ? sortedConceptsChapterCount
            : isRefiningChapters || pendingProcessingAction === 'refineChapters'
              ? refinedChaptersChapterCount
              : isAssigningStandards || pendingProcessingAction === 'standards'
                ? standardsAssignedChapterCount
                  : generatedConceptsChapterCount;
  const processingLabel = processingPage !== undefined
      ? t('Processing page {{page}}', { replace: { page: processingPage } })
      : isDetectingBookLanguage
        ? t('Detecting book language')
        : isDetectingBookSubject
          ? t('Detecting book subject')
          : isDetectingBookAge
            ? t('Detecting learner age')
            : isRecognizingAll || pendingProcessingAction === 'recognize'
              ? t('Recognizing pages')
              : isIdentifyingChapters || pendingProcessingAction === 'chapters'
                ? t(chapterIdentificationLabel)
                : isFixConceptsProcessing || pendingProcessingAction === 'fixConcepts'
                  ? t('Fix concepts')
                  : isEmbeddingConcepts || pendingProcessingAction === 'embeddings'
                    ? t('Calculating concept Embedings')
                    : isDeduplicateConceptsProcessing || pendingProcessingAction === 'deduplicateConcepts'
                      ? t('Finding duplicate concepts across the book')
                      : isSortingConcepts || pendingProcessingAction === 'sortConcepts'
                        ? t('Sorting concepts by ZPD')
                        : isRefiningChapters || pendingProcessingAction === 'refineChapters'
                          ? t('Clustering concepts into thematic chapters')
                          : isAssigningStandards || pendingProcessingAction === 'standards'
                            ? t('Matching standards to chapter concepts')
                            : t('Extracting concepts by chapter');

  const readerProcessingStage: BookStageSpendKey | undefined = confirmedProcessingStage
    ?? (isDetectingBookLanguage
        ? 'language'
        : isDetectingBookSubject
          ? 'subject'
          : isDetectingBookAge
            ? 'age'
            : isRecognizingAll
              ? 'recognize'
              : isIdentifyingChapters
                ? 'chapters'
                : isGeneratingAllConcepts
                  ? 'concepts'
                  : isFixConceptsProcessing
                    ? 'fixConcepts'
                    : isEmbeddingConcepts
                      ? 'embeddings'
                      : isDeduplicateConceptsProcessing
                        ? 'deduplicateConcepts'
                        : isSortingConcepts
                          ? 'sortConcepts'
                          : isRefiningChapters
                            ? REFINE_CHAPTERS_SPEND_STAGE
                            : isAssigningStandards
                              ? 'standards'
                              : pendingProcessingAction ?? (processingPage !== undefined ? 'recognize' : undefined));

  useBookStageTimer(bookId, readerProcessingStage);

  const hasReaderProcessing = Boolean(
    pendingProcessingAction ||
    processingPage !== undefined ||
    isDetectingBookLanguage ||
    isDetectingBookSubject ||
    isDetectingBookAge ||
    isRecognizingAll ||
    isIdentifyingChapters ||
    isGeneratingAllConcepts ||
    isFixConceptsProcessing ||
    isEmbeddingConcepts ||
    isDeduplicateConceptsProcessing ||
    isSortingConcepts ||
    isRefiningChapters ||
    isAssigningStandards
  );
  const readerProcessing: ProcessingStatus | undefined = hasReaderProcessing
    ? {
      label: processingLabel,
      progressTotal: processingTotal,
      progressValue: processingValue,
      spent: openRouterSpent
    }
    : undefined;

  useEffect((): void => {
    if (!autoRunAll) {
      setLastReaderProcessing(undefined);
      return;
    }

    if (hasReaderProcessing) {
      setLastReaderProcessing({
        label: processingLabel,
        progressTotal: processingTotal,
        progressValue: processingValue,
        spent: openRouterSpent
      });
    }
  }, [autoRunAll, hasReaderProcessing, openRouterSpent, processingLabel, processingTotal, processingValue]);

  // Remember the most recent *real* skills-stage update too. During handoffs
  // display that stage (or the last reader stage), not "Preparing next stage".
  useEffect((): void => {
    if (autoRunAll && autoRunProcessing) {
      setLastReaderProcessing(autoRunProcessing);
    }
  }, [autoRunAll, autoRunProcessing]);

  const processingPopupStatus = autoRunAll
    ? readerProcessing ?? lastReaderProcessing ?? autoRunProcessing
    : readerProcessing;

  return {
    hasReaderProcessing,
    lastReaderProcessing,
    processingLabel,
    processingPopupStatus,
    processingTotal,
    processingValue,
    readerProcessing,
    readerProcessingStage,
    setLastReaderProcessing
  } as const;
}
