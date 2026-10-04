// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookStageSpendKey } from '@slonigiraf/db';
import { useEffect, useState } from 'react';
import { REFINE_CHAPTERS_SPEND_STAGE } from '../book/processing/chapters/refineChapters.js';
import { useBookStageTimer } from '../book/runtime/bookStageTime.js';
import type { PendingBookProcessingAction } from '../book/runtime/bookPipeline.js';
import type { ProcessingStatus } from '../components/ProcessingPopup.js';

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
  totalPages
}: UseBookReaderProcessingStatusOptions) {
  const [lastReaderProcessing, setLastReaderProcessing] = useState<ProcessingStatus>();
  const processingTotal = isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined || isEmbeddingConcepts || pendingProcessingAction === 'embeddings' || isDeduplicatingConcepts || pendingProcessingAction === 'deduplicateConcepts'
    ? 1
    : isFixingConcepts || pendingProcessingAction === 'fixConcepts'
      ? Math.max(1, fixConceptsTargetChapterCount || conceptChapterCount)
      : isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isSortingConcepts || pendingProcessingAction === 'sortConcepts' || isRefiningChapters || pendingProcessingAction === 'refineChapters' || isAssigningStandards || pendingProcessingAction === 'standards'
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
    ? `Processing chapter ${currentConceptChapterTitle || ''}`
    : processingPage !== undefined
      ? `Processing page ${processingPage}`
      : isDetectingBookLanguage
        ? 'Detecting book language'
        : isDetectingBookSubject
          ? 'Detecting book subject'
          : isDetectingBookAge
            ? 'Detecting learner age'
            : isRecognizingAll || pendingProcessingAction === 'recognize'
              ? 'Recognizing pages'
              : isIdentifyingChapters || pendingProcessingAction === 'chapters'
                ? chapterIdentificationLabel
                : isFixingConcepts || pendingProcessingAction === 'fixConcepts'
                  ? 'Finding missing chapter concepts'
                  : isEmbeddingConcepts || pendingProcessingAction === 'embeddings'
                    ? 'Calculating concept Embedings'
                    : isDeduplicatingConcepts || pendingProcessingAction === 'deduplicateConcepts'
                      ? 'Finding duplicate concepts across the book'
                      : isSortingConcepts || pendingProcessingAction === 'sortConcepts'
                        ? 'Sorting concepts by ZPD'
                        : isRefiningChapters || pendingProcessingAction === 'refineChapters'
                          ? 'Clustering concepts into thematic chapters'
                          : isAssigningStandards || pendingProcessingAction === 'standards'
                            ? 'Matching standards to chapter concepts'
                            : isGeneratingAllExercises || pendingProcessingAction === 'exercises'
                              ? 'Generating exercises'
                              : 'Extracting concepts by chapter';

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
      label: 'Preparing next stage…',
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
