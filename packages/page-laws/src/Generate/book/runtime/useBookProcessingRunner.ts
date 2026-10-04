// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from 'react';

interface UseBookProcessingRunnerOptions {
  ageSamplePageCount: number;
  ageSampleTextCount: number;
  ageTabRequest: number;
  assignAllStandardsRequest: number;
  assignStandards: (force?: boolean) => Promise<void>;
  conceptChapterCount: number;
  deduplicateAllConcepts: (model: string) => Promise<void>;
  deduplicateAllConceptsRequest: number;
  embedAllConcepts: () => Promise<void>;
  embedAllConceptsRequest: number;
  fixAllConcepts: (model: string, onlyFailed: boolean) => Promise<void>;
  fixAllConceptsRequest: number;
  fixOnlyFailedConcepts: boolean;
  generateAllConcepts: () => Promise<void>;
  generateAllConceptsModel: string;
  generateAllConceptsRequest: number;
  generateAllExercises: () => Promise<void>;
  generateAllExercisesRequest: number;
  identifyChapters: () => Promise<void>;
  identifyChaptersRequest: number;
  isAssigningStandards: boolean;
  isDeduplicatingConcepts: boolean;
  isEmbeddingConcepts: boolean;
  isFixingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isGeneratingAllExercises: boolean;
  isIdentifyingChapters: boolean;
  isMmdConversionComplete: boolean;
  isRecognizingAll: boolean;
  isRefiningChapters: boolean;
  isSortingConcepts: boolean;
  languageTabRequest: number;
  onProcessingComplete: () => void;
  openAgeDetectionConfirmation: () => void;
  openLanguageDetectionConfirmation: () => void;
  openSubjectDetectionConfirmation: () => void;
  processingPage?: number;
  recognizeAllPages: () => Promise<void>;
  recognizeAllRequest: number;
  refineAllChapters: (model: string) => Promise<void>;
  refineAllChaptersRequest: number;
  setActivePane: (pane: 'text') => void;
  setError: (message: string) => void;
  sortAllConcepts: (model: string) => Promise<void>;
  sortAllConceptsRequest: number;
  subjectTabRequest: number;
  totalPages: number;
}

export function useBookProcessingRunner ({ ageSamplePageCount, ageSampleTextCount, ageTabRequest, assignAllStandardsRequest, assignStandards, conceptChapterCount, deduplicateAllConcepts, deduplicateAllConceptsRequest, embedAllConcepts, embedAllConceptsRequest, fixAllConcepts, fixAllConceptsRequest, fixOnlyFailedConcepts, generateAllConcepts, generateAllConceptsModel, generateAllConceptsRequest, generateAllExercises, generateAllExercisesRequest, identifyChapters, identifyChaptersRequest, isAssigningStandards, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isMmdConversionComplete, isRecognizingAll, isRefiningChapters, isSortingConcepts, languageTabRequest, onProcessingComplete, openAgeDetectionConfirmation, openLanguageDetectionConfirmation, openSubjectDetectionConfirmation, processingPage, recognizeAllPages, recognizeAllRequest, refineAllChapters, refineAllChaptersRequest, setActivePane, setError, sortAllConcepts, sortAllConceptsRequest, subjectTabRequest, totalPages }: UseBookProcessingRunnerOptions): void {
  const handledAssignAllStandardsRequestRef = useRef(assignAllStandardsRequest);
  const handledEmbedAllConceptsRequestRef = useRef(embedAllConceptsRequest);
  const handledDeduplicateAllConceptsRequestRef = useRef(deduplicateAllConceptsRequest);
  const handledFixAllConceptsRequestRef = useRef(fixAllConceptsRequest);
  const handledSortAllConceptsRequestRef = useRef(sortAllConceptsRequest);
  const handledRefineAllChaptersRequestRef = useRef(refineAllChaptersRequest);
  const handledGenerateAllConceptsRequestRef = useRef(generateAllConceptsRequest);
  const handledLanguageTabRequestRef = useRef(languageTabRequest);
  const handledSubjectTabRequestRef = useRef(subjectTabRequest);
  const handledAgeTabRequestRef = useRef(ageTabRequest);
  const handledIdentifyChaptersRequestRef = useRef(identifyChaptersRequest);
  const handledGenerateAllExercisesRequestRef = useRef(generateAllExercisesRequest);
  const handledRecognizeAllRequestRef = useRef(recognizeAllRequest);

  useEffect((): void => {
    if (languageTabRequest === handledLanguageTabRequestRef.current || !isMmdConversionComplete) {
      return;
    }

    handledLanguageTabRequestRef.current = languageTabRequest;
    openLanguageDetectionConfirmation();
  }, [isMmdConversionComplete, languageTabRequest, openLanguageDetectionConfirmation]);

  useEffect((): void => {
    if (subjectTabRequest === handledSubjectTabRequestRef.current || !isMmdConversionComplete) {
      return;
    }

    handledSubjectTabRequestRef.current = subjectTabRequest;
    openSubjectDetectionConfirmation();
  }, [isMmdConversionComplete, openSubjectDetectionConfirmation, subjectTabRequest]);

  useEffect((): void => {
    if (ageTabRequest === handledAgeTabRequestRef.current) {
      return;
    }

    const hasAllSampleText = ageSamplePageCount === Math.min(3, totalPages) && ageSampleTextCount === ageSamplePageCount;

    if (!hasAllSampleText) {
      return;
    }

    handledAgeTabRequestRef.current = ageTabRequest;
    openAgeDetectionConfirmation();
  }, [ageSamplePageCount, ageSampleTextCount, ageTabRequest, openAgeDetectionConfirmation, totalPages]);

  useEffect((): void => {
    if (
      generateAllExercisesRequest === handledGenerateAllExercisesRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isRefiningChapters ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledGenerateAllExercisesRequestRef.current = generateAllExercisesRequest;
    generateAllExercises().catch((processingError) => {
      setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
      onProcessingComplete();
    });
  }, [generateAllExercises, generateAllExercisesRequest, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isRefiningChapters, onProcessingComplete, processingPage, setError, totalPages]);

  useEffect((): void => {
    if (
      generateAllConceptsRequest === handledGenerateAllConceptsRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledGenerateAllConceptsRequestRef.current = generateAllConceptsRequest;
    generateAllConcepts().catch((generationError) => {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
      onProcessingComplete();
    });
  }, [generateAllConcepts, generateAllConceptsRequest, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, setError, totalPages]);

  useEffect((): void => {
    if (
      fixAllConceptsRequest === handledFixAllConceptsRequestRef.current ||
      !conceptChapterCount ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isFixingConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledFixAllConceptsRequestRef.current = fixAllConceptsRequest;
    fixAllConcepts(generateAllConceptsModel, fixOnlyFailedConcepts)
      .catch((fixError) => setError(fixError instanceof Error ? fixError.message : 'Unable to fix chapter concepts.'))
      .finally(onProcessingComplete);
  }, [conceptChapterCount, fixAllConcepts, fixAllConceptsRequest, fixOnlyFailedConcepts, generateAllConceptsModel, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, setError]);

  useEffect((): void => {
    if (
      embedAllConceptsRequest === handledEmbedAllConceptsRequestRef.current ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isFixingConcepts ||
      isEmbeddingConcepts ||
      isDeduplicatingConcepts ||
      isSortingConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledEmbedAllConceptsRequestRef.current = embedAllConceptsRequest;
    embedAllConcepts()
      .catch((embeddingError) => setError(embeddingError instanceof Error ? embeddingError.message : 'Unable to calculate concept Embedings.'))
      .finally(onProcessingComplete);
  }, [embedAllConcepts, embedAllConceptsRequest, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, onProcessingComplete, processingPage, setError]);

  useEffect((): void => {
    if (
      deduplicateAllConceptsRequest === handledDeduplicateAllConceptsRequestRef.current ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isFixingConcepts ||
      isEmbeddingConcepts ||
      isDeduplicatingConcepts ||
      isSortingConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledDeduplicateAllConceptsRequestRef.current = deduplicateAllConceptsRequest;
    deduplicateAllConcepts(generateAllConceptsModel)
      .catch((deduplicateError) => setError(deduplicateError instanceof Error ? deduplicateError.message : 'Unable to deduplicate concepts.'))
      .finally(onProcessingComplete);
  }, [deduplicateAllConcepts, deduplicateAllConceptsRequest, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, onProcessingComplete, processingPage, setError]);

  useEffect((): void => {
    if (
      sortAllConceptsRequest === handledSortAllConceptsRequestRef.current ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isFixingConcepts ||
      isEmbeddingConcepts ||
      isDeduplicatingConcepts ||
      isSortingConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledSortAllConceptsRequestRef.current = sortAllConceptsRequest;
    sortAllConcepts(generateAllConceptsModel)
      .catch((sortError) => setError(sortError instanceof Error ? sortError.message : 'Unable to sort chapter concepts.'))
      .finally(onProcessingComplete);
  }, [conceptChapterCount, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, onProcessingComplete, processingPage, setError, sortAllConcepts, sortAllConceptsRequest]);

  useEffect((): void => {
    if (
      refineAllChaptersRequest === handledRefineAllChaptersRequestRef.current ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isFixingConcepts ||
      isEmbeddingConcepts ||
      isDeduplicatingConcepts ||
      isSortingConcepts ||
      isRefiningChapters ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledRefineAllChaptersRequestRef.current = refineAllChaptersRequest;
    refineAllChapters(generateAllConceptsModel)
      .catch((refineError) => setError(refineError instanceof Error ? refineError.message : 'Unable to refine chapters.'))
      .finally(onProcessingComplete);
  }, [conceptChapterCount, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isRefiningChapters, isSortingConcepts, onProcessingComplete, processingPage, refineAllChapters, refineAllChaptersRequest, setError]);

  useEffect((): void => {
    if (
      identifyChaptersRequest === handledIdentifyChaptersRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledIdentifyChaptersRequestRef.current = identifyChaptersRequest;
    identifyChapters().catch((chapterError) => {
      setError(chapterError instanceof Error ? chapterError.message : 'Unable to identify chapters.');
      onProcessingComplete();
    });
  }, [identifyChapters, identifyChaptersRequest, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, setError, totalPages]);

  useEffect((): void => {
    if (
      recognizeAllRequest === handledRecognizeAllRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledRecognizeAllRequestRef.current = recognizeAllRequest;
    setActivePane('text');
    recognizeAllPages().catch((recognitionError) => {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
      onProcessingComplete();
    });
  }, [isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, recognizeAllPages, recognizeAllRequest, setActivePane, setError, totalPages]);

  useEffect((): void => {
    if (
      assignAllStandardsRequest === handledAssignAllStandardsRequestRef.current ||
      !conceptChapterCount ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters ||
      isAssigningStandards
    ) {
      return;
    }

    handledAssignAllStandardsRequestRef.current = assignAllStandardsRequest;
    assignStandards(true)
      .catch((assignmentError) => setError(assignmentError instanceof Error ? assignmentError.message : 'Unable to assign chapter standards.'))
      .finally(onProcessingComplete);
  }, [assignAllStandardsRequest, assignStandards, conceptChapterCount, isAssigningStandards, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, setError]);
}
