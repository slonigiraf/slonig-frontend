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
  currentConceptChapterTitle?: string;
  fixConceptsTargetChapterCount: number;
  fixedConceptsChapterCount: number;
  generatedConceptsChapterCount: number;
  generatedExercisesPageCount: number;
  identifiedChapterPageCount: number;
  isAssigningStandards: boolean;
  isDeduplicatingConcepts: boolean;
  isDetectingBookAge: boolean;
  isDetectingBookLanguage: boolean;
  isDetectingBookSubject: boolean;
  isEmbeddingConcepts: boolean;
  isFixingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isGeneratingAllExercises: boolean;
  isGeneratingChapterConcepts: boolean;
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
  currentConceptChapterTitle,
  fixConceptsTargetChapterCount,
  fixedConceptsChapterCount,
  generatedConceptsChapterCount,
  generatedExercisesPageCount,
  identifiedChapterPageCount,
  isAssigningStandards,
  isDeduplicatingConcepts,
  isDetectingBookAge,
  isDetectingBookLanguage,
  isDetectingBookSubject,
  isEmbeddingConcepts,
  isFixingConcepts,
  isGeneratingAllConcepts,
  isGeneratingAllExercises,
  isGeneratingChapterConcepts,
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
  const processingTotal = isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined || isEmbeddingConcepts || pendingProcessingAction === 'embeddings' || isDeduplicatingConcepts || pendingProcessingAction === 'deduplicateConcepts'
    ? 1
    : isFixingConcepts || pendingProcessingAction === 'fixConcepts'
      ? Math.max(1, fixConceptsTargetChapterCount || conceptChapterCount)
      : isAssigningStandards
        ? Math.max(1, standardsTargetChapterCount || conceptChapterCount)
      : isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isSortingConcepts || pendingProcessingAction === 'sortConcepts' || isRefiningChapters || pendingProcessingAction === 'refineChapters' || pendingProcessingAction === 'standards'
        ? Math.max(1, conceptChapterCount)
        : Math.max(1, totalPages);
  const processingValue = isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined || isEmbeddingConcepts || pendingProcessingAction === 'embeddings' || isDeduplicatingConcepts || pendingProcessingAction === 'deduplicateConcepts'
    ? 0
    : isRecognizingAll || pendingProcessingAction === 'recognize'
      ? recognizedPageCount
      : isIdentifyingChapters || pendingProcessingAction === 'chapters'
        ? identifiedChapterPageCount
        : isFixingConcepts || pendingProcessingAction === 'fixConcepts'
          ? fixedConceptsChapterCount
          : isSortingConcepts || pendingProcessingAction === 'sortConcepts'
            ? sortedConceptsChapterCount
            : isRefiningChapters || pendingProcessingAction === 'refineChapters'
              ? refinedChaptersChapterCount
              : isAssigningStandards || pendingProcessingAction === 'standards'
                ? standardsAssignedChapterCount
                : isGeneratingAllExercises || pendingProcessingAction === 'exercises'
                  ? generatedExercisesPageCount
                  : generatedConceptsChapterCount;
  const processingLabel = isGeneratingChapterConcepts
    ? t('Processing chapter {{chapter}}', { replace: { chapter: currentConceptChapterTitle || '' } })
    : processingPage !== undefined
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
                : isFixingConcepts || pendingProcessingAction === 'fixConcepts'
                  ? t('Finding missing chapter concepts')
                  : isEmbeddingConcepts || pendingProcessingAction === 'embeddings'
                    ? t('Calculating concept Embedings')
                    : isDeduplicatingConcepts || pendingProcessingAction === 'deduplicateConcepts'
                      ? t('Finding duplicate concepts across the book')
                      : isSortingConcepts || pendingProcessingAction === 'sortConcepts'
                        ? t('Sorting concepts by ZPD')
                        : isRefiningChapters || pendingProcessingAction === 'refineChapters'
                          ? t('Clustering concepts into thematic chapters')
                          : isAssigningStandards || pendingProcessingAction === 'standards'
                            ? t('Matching standards to chapter concepts')
                            : isGeneratingAllExercises || pendingProcessingAction === 'exercises'
                              ? t('Generating exercises')
                              : t('Extracting concepts by chapter');

  const readerProcessingStage: BookStageSpendKey | undefined = confirmedProcessingStage
    ?? (isGeneratingChapterConcepts
      ? 'concepts'
      : isDetectingBookLanguage
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
                  : isFixingConcepts
                    ? 'fixConcepts'
                    : isEmbeddingConcepts
                      ? 'embeddings'
                      : isDeduplicatingConcepts
                        ? 'deduplicateConcepts'
                        : isSortingConcepts
                          ? 'sortConcepts'
                          : isRefiningChapters
                            ? REFINE_CHAPTERS_SPEND_STAGE
                            : isAssigningStandards
                              ? 'standards'
                              : isGeneratingAllExercises
                                ? 'exercises'
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
    isFixingConcepts ||
    isEmbeddingConcepts ||
    isDeduplicatingConcepts ||
    isSortingConcepts ||
    isRefiningChapters ||
    isAssigningStandards ||
    isGeneratingAllExercises
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

  const processingPopupStatus = autoRunAll
    ? readerProcessing ?? autoRunProcessing ?? lastReaderProcessing ?? {
      label: t('Preparing next stage…'),
      progressTotal: 1,
      progressValue: 0,
      spent: 0
    }
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
