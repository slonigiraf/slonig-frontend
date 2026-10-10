// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from 'react';

import { isBookProcessingCommandReady, type BookProcessingRunnerState } from './bookProcessingCommand.js';
import type { BookProcessingCommand } from './bookPipeline.js';

interface UseBookProcessingRunnerOptions extends BookProcessingRunnerState {
  assignStandards: (force?: boolean) => Promise<void>;
  deduplicateAllConcepts: (model: string) => Promise<void>;
  embedAllConcepts: () => Promise<void>;
  fixAllConcepts: (model: string, onlyFailed: boolean) => Promise<void>;
  fixOnlyFailedConcepts: boolean;
  generateAllConcepts: () => Promise<void>;
  generateAllConceptsModel: string;
  generateOnlyMissingStandards: boolean;
  generateAllExercises: () => Promise<void>;
  identifyChapters: () => Promise<void>;
  onProcessingComplete: () => void;
  openAgeDetectionConfirmation: () => void;
  openLanguageDetectionConfirmation: () => void;
  openSubjectDetectionConfirmation: () => void;
  processingCommand?: BookProcessingCommand;
  recognizeAllPages: () => Promise<void>;
  refineAllChapters: (model: string) => Promise<void>;
  setActivePane: (pane: 'text') => void;
  setError: (message: string) => void;
  sortAllConcepts: (model: string) => Promise<void>;
}

export function useBookProcessingRunner ({ ageSamplePageCount, ageSampleTextCount, assignStandards, conceptChapterCount, deduplicateAllConcepts, embedAllConcepts, fixAllConcepts, fixOnlyFailedConcepts, generateAllConcepts, generateAllConceptsModel, generateAllExercises, generateOnlyMissingStandards, identifyChapters, isAssigningStandards, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isMmdConversionComplete, isRecognizingAll, isRefiningChapters, isSortingConcepts, onProcessingComplete, openAgeDetectionConfirmation, openLanguageDetectionConfirmation, openSubjectDetectionConfirmation, processingCommand, processingPage, recognizeAllPages, refineAllChapters, setActivePane, setError, sortAllConcepts, totalPages }: UseBookProcessingRunnerOptions): void {
  // Treat a command already present when the reader mounts as stale. This
  // preserves the old counter behavior when switching books/remounting readers.
  const handledCommandIdRef = useRef(processingCommand?.id);

  useEffect((): void => {
    if (!processingCommand || processingCommand.id === handledCommandIdRef.current) {
      return;
    }

    const runnerState: BookProcessingRunnerState = {
      ageSamplePageCount,
      ageSampleTextCount,
      conceptChapterCount,
      isAssigningStandards,
      isDeduplicatingConcepts,
      isEmbeddingConcepts,
      isFixingConcepts,
      isGeneratingAllConcepts,
      isGeneratingAllExercises,
      isIdentifyingChapters,
      isMmdConversionComplete,
      isRecognizingAll,
      isRefiningChapters,
      isSortingConcepts,
      processingPage,
      totalPages
    };

    if (!isBookProcessingCommandReady(processingCommand.action, runnerState)) {
      return;
    }

    handledCommandIdRef.current = processingCommand.id;

    switch (processingCommand.action) {
      case 'language':
        openLanguageDetectionConfirmation();
        return;
      case 'subject':
        openSubjectDetectionConfirmation();
        return;
      case 'age':
        openAgeDetectionConfirmation();
        return;
      case 'exercises':
        generateAllExercises().catch((processingError) => {
          setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
          onProcessingComplete();
        });
        return;
      case 'concepts':
        generateAllConcepts().catch((generationError) => {
          setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
          onProcessingComplete();
        });
        return;
      case 'fixConcepts':
        fixAllConcepts(generateAllConceptsModel, fixOnlyFailedConcepts)
          .catch((fixError) => setError(fixError instanceof Error ? fixError.message : 'Unable to fix chapter concepts.'))
          .finally(onProcessingComplete);
        return;
      case 'embeddings':
        embedAllConcepts()
          .catch((embeddingError) => setError(embeddingError instanceof Error ? embeddingError.message : 'Unable to calculate concept Embedings.'))
          .finally(onProcessingComplete);
        return;
      case 'deduplicateConcepts':
        deduplicateAllConcepts(generateAllConceptsModel)
          .catch((deduplicateError) => setError(deduplicateError instanceof Error ? deduplicateError.message : 'Unable to deduplicate concepts.'))
          .finally(onProcessingComplete);
        return;
      case 'sortConcepts':
        sortAllConcepts(generateAllConceptsModel)
          .catch((sortError) => setError(sortError instanceof Error ? sortError.message : 'Unable to sort chapter concepts.'))
          .finally(onProcessingComplete);
        return;
      case 'refineChapters':
        refineAllChapters(generateAllConceptsModel)
          .catch((refineError) => setError(refineError instanceof Error ? refineError.message : 'Unable to refine chapters.'))
          .finally(onProcessingComplete);
        return;
      case 'chapters':
        identifyChapters().catch((chapterError) => {
          setError(chapterError instanceof Error ? chapterError.message : 'Unable to identify chapters.');
          onProcessingComplete();
        });
        return;
      case 'recognize':
        setActivePane('text');
        recognizeAllPages().catch((recognitionError) => {
          setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
          onProcessingComplete();
        });
        return;
      case 'standards':
        assignStandards(!generateOnlyMissingStandards)
          .catch((assignmentError) => setError(assignmentError instanceof Error ? assignmentError.message : 'Unable to assign chapter standards.'))
          .finally(onProcessingComplete);
    }
  }, [ageSamplePageCount, ageSampleTextCount, assignStandards, conceptChapterCount, deduplicateAllConcepts, embedAllConcepts, fixAllConcepts, fixOnlyFailedConcepts, generateAllConcepts, generateAllConceptsModel, generateAllExercises, generateOnlyMissingStandards, identifyChapters, isAssigningStandards, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isMmdConversionComplete, isRecognizingAll, isRefiningChapters, isSortingConcepts, onProcessingComplete, openAgeDetectionConfirmation, openLanguageDetectionConfirmation, openSubjectDetectionConfirmation, processingCommand, processingPage, recognizeAllPages, refineAllChapters, setActivePane, setError, sortAllConcepts, totalPages]);
}
