// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookReaderCommandAction } from './bookPipeline.js';

export interface BookProcessingRunnerState {
  ageSamplePageCount: number;
  ageSampleTextCount: number;
  conceptChapterCount: number;
  isAssigningStandards: boolean;
  isDeduplicatingConcepts: boolean;
  isEmbeddingConcepts: boolean;
  isFixingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isIdentifyingChapters: boolean;
  isMmdConversionComplete: boolean;
  isRecognizingAll: boolean;
  isRefiningChapters: boolean;
  isSortingConcepts: boolean;
  processingPage?: number;
  totalPages: number;
}

export function isBookProcessingCommandReady (action: BookReaderCommandAction, state: BookProcessingRunnerState): boolean {
  const {
    ageSamplePageCount,
    ageSampleTextCount,
    conceptChapterCount,
    isAssigningStandards,
    isDeduplicatingConcepts,
    isEmbeddingConcepts,
    isFixingConcepts,
    isGeneratingAllConcepts,
    isIdentifyingChapters,
    isMmdConversionComplete,
    isRecognizingAll,
    isRefiningChapters,
    isSortingConcepts,
    processingPage,
    totalPages
  } = state;

  switch (action) {
    case 'language':
    case 'subject':
      return isMmdConversionComplete;
    case 'age':
      return ageSamplePageCount === Math.min(3, totalPages) && ageSampleTextCount === ageSamplePageCount;
    case 'concepts':
    case 'chapters':
    case 'recognize':
      return Boolean(totalPages) &&
        processingPage === undefined &&
        !isGeneratingAllConcepts &&
        !isRecognizingAll &&
        !isIdentifyingChapters;
    case 'fixConcepts':
      return Boolean(conceptChapterCount) &&
        processingPage === undefined &&
        !isGeneratingAllConcepts &&
        !isFixingConcepts &&
        !isRecognizingAll &&
        !isIdentifyingChapters;
    case 'embeddings':
    case 'deduplicateConcepts':
    case 'sortConcepts':
      return processingPage === undefined &&
        !isGeneratingAllConcepts &&
        !isFixingConcepts &&
        !isEmbeddingConcepts &&
        !isDeduplicatingConcepts &&
        !isSortingConcepts &&
        !isRecognizingAll &&
        !isIdentifyingChapters;
    case 'refineChapters':
      return processingPage === undefined &&
        !isGeneratingAllConcepts &&
        !isFixingConcepts &&
        !isEmbeddingConcepts &&
        !isDeduplicatingConcepts &&
        !isSortingConcepts &&
        !isRefiningChapters &&
        !isRecognizingAll &&
        !isIdentifyingChapters;
    case 'standards':
      return Boolean(conceptChapterCount) &&
        processingPage === undefined &&
        !isGeneratingAllConcepts &&
        !isRecognizingAll &&
        !isIdentifyingChapters &&
        !isAssigningStandards;
  }
}
