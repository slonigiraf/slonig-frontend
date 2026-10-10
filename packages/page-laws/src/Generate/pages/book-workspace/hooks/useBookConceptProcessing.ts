// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, BookProcessingStageKey, BookStageSpendKey } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import type { ConceptChapterNavigationItem } from '../../../book/domain/concepts/conceptRecognition.js';
import type { DeduplicateConceptInput } from '../../../book/domain/concepts/deduplicateConcepts.js';
import type { FixConceptsChapterStatuses } from '../../../book/infrastructure/storage/fixConceptsProgress.js';
import type { DeduplicateConceptsReview, FixConceptsReview } from '../BookReaderTypes.js';
import type { ReaderPane } from '../../../shared/types/bookWorkspace.js';
import { useBookConceptGeneration } from './useBookConceptGeneration.js';
import { useBookConceptOrganization } from './useBookConceptOrganization.js';
import { useBookConceptQuality } from './useBookConceptQuality.js';

interface DeduplicateInventory {
  conceptsById: Map<number, BookConcept>;
  inputs: DeduplicateConceptInput[];
}

interface UseBookConceptProcessingOptions {
  addConceptsCost: (costUsd: number) => void;
  addDeduplicateConceptsCost: (costUsd: number) => void;
  addEmbeddingsCost: (costUsd: number) => void;
  addFixConceptsCost: (costUsd: number) => void;
  addRefineChaptersCost: (costUsd: number) => void;
  addSortConceptsCost: (costUsd: number) => void;
  autoRunAll: boolean;
  book: Book;
  completeStage: (stage: BookProcessingStageKey) => Promise<void>;
  conceptChapters: ConceptChapterNavigationItem[];
  currentConceptChapter?: ConceptChapterNavigationItem;
  currentReaderProcessingSignal: () => AbortSignal;
  deduplicateConceptsReview?: DeduplicateConceptsReview;
  embeddingModel: string;
  fixConceptsReview?: FixConceptsReview;
  generateAllConceptsModel: string;
  generateOnlyMissingConcepts: boolean;
  isApplyingDeduplicateConceptsReview: boolean;
  isApplyingFixConceptsReview: boolean;
  isDeduplicatingConcepts: boolean;
  isEmbeddingConcepts: boolean;
  isFixingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isIdentifyingChapters: boolean;
  isRecognizingAll: boolean;
  isRefiningChapters: boolean;
  isSortingConcepts: boolean;
  loadConceptCountsByChapter: (targetChapters: ConceptChapterNavigationItem[]) => Promise<Map<string, number>>;
  loadDeduplicateConceptInventory: () => Promise<DeduplicateInventory>;
  onBookChange: (book: Book) => void;
  onProcessingComplete: () => void;
  pageNumber: number;
  pages: Map<number, BookPage>;
  processingPage?: number;
  refreshChapterAssignments: () => Promise<void>;
  refreshConceptCounts: () => Promise<void>;
  refreshEntityCounts: () => Promise<void>;
  revealPane: (pane: ReaderPane) => void;
  selectedModel: string;
  setConceptEmbeddingsRefreshToken: Dispatch<SetStateAction<number>>;
  setConceptFirstPageByKey: Dispatch<SetStateAction<Map<string, number>>>;
  setConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setConfirmedProcessingStage: Dispatch<SetStateAction<BookStageSpendKey | undefined>>;
  setDeduplicateConceptsReview: Dispatch<SetStateAction<DeduplicateConceptsReview | undefined>>;
  setEmbeddingByConceptId: Dispatch<SetStateAction<Map<number, number[]>>>;
  setEmbeddingConceptInventory: Dispatch<SetStateAction<BookConcept[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setFixedConceptsChapterCount: Dispatch<SetStateAction<number>>;
  setFixConceptsChapterStatuses: Dispatch<SetStateAction<FixConceptsChapterStatuses>>;
  setFixConceptsReview: Dispatch<SetStateAction<FixConceptsReview | undefined>>;
  setFixConceptsReviewChapterIndex: Dispatch<SetStateAction<number>>;
  setFixConceptsTargetChapterCount: Dispatch<SetStateAction<number>>;
  setGeneratedConceptsChapterCount: Dispatch<SetStateAction<number>>;
  setIsApplyingDeduplicateConceptsReview: Dispatch<SetStateAction<boolean>>;
  setIsApplyingFixConceptsReview: Dispatch<SetStateAction<boolean>>;
  setIsDeduplicatingConcepts: Dispatch<SetStateAction<boolean>>;
  setIsEmbeddingConcepts: Dispatch<SetStateAction<boolean>>;
  setIsFixingConcepts: Dispatch<SetStateAction<boolean>>;
  setIsGeneratingAllConcepts: Dispatch<SetStateAction<boolean>>;
  setIsGeneratingChapterConcepts: Dispatch<SetStateAction<boolean>>;
  setIsPageGenerationConfirmationOpen: Dispatch<SetStateAction<boolean>>;
  setIsRefiningChapters: Dispatch<SetStateAction<boolean>>;
  setIsSortingConcepts: Dispatch<SetStateAction<boolean>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setPages: Dispatch<SetStateAction<Map<number, BookPage>>>;
  setProcessingPage: Dispatch<SetStateAction<number | undefined>>;
  setRefinedChaptersChapterCount: Dispatch<SetStateAction<number>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
  setSortedConceptsChapterCount: Dispatch<SetStateAction<number>>;
  totalPages: number;
}

export function useBookConceptProcessing ({
  addConceptsCost,
  addDeduplicateConceptsCost,
  addEmbeddingsCost,
  addFixConceptsCost,
  addRefineChaptersCost,
  addSortConceptsCost,
  autoRunAll,
  book,
  completeStage,
  conceptChapters,
  currentConceptChapter,
  currentReaderProcessingSignal,
  deduplicateConceptsReview,
  embeddingModel,
  fixConceptsReview,
  generateAllConceptsModel,
  generateOnlyMissingConcepts,
  isApplyingDeduplicateConceptsReview,
  isApplyingFixConceptsReview,
  isDeduplicatingConcepts,
  isEmbeddingConcepts,
  isFixingConcepts,
  isGeneratingAllConcepts,
  isIdentifyingChapters,
  isRecognizingAll,
  isRefiningChapters,
  isSortingConcepts,
  loadConceptCountsByChapter,
  loadDeduplicateConceptInventory,
  onBookChange,
  onProcessingComplete,
  pageNumber,
  pages,
  processingPage,
  refreshChapterAssignments,
  refreshConceptCounts,
  refreshEntityCounts,
  revealPane,
  selectedModel,
  setConceptEmbeddingsRefreshToken,
  setConceptFirstPageByKey,
  setConcepts,
  setConfirmedProcessingStage,
  setDeduplicateConceptsReview,
  setEmbeddingByConceptId,
  setEmbeddingConceptInventory,
  setError,
  setFixedConceptsChapterCount,
  setFixConceptsChapterStatuses,
  setFixConceptsReview,
  setFixConceptsReviewChapterIndex,
  setFixConceptsTargetChapterCount,
  setGeneratedConceptsChapterCount,
  setIsApplyingDeduplicateConceptsReview,
  setIsApplyingFixConceptsReview,
  setIsDeduplicatingConcepts,
  setIsEmbeddingConcepts,
  setIsFixingConcepts,
  setIsGeneratingAllConcepts,
  setIsGeneratingChapterConcepts,
  setIsPageGenerationConfirmationOpen,
  setIsRefiningChapters,
  setIsSortingConcepts,
  setOpenRouterSpent,
  setPages,
  setProcessingPage,
  setRefinedChaptersChapterCount,
  setSkillsRefreshToken,
  setSortedConceptsChapterCount,
  totalPages
}: UseBookConceptProcessingOptions) {
  const generation = useBookConceptGeneration({
    addConceptsCost,
    book,
    completeStage,
    conceptChapters,
    currentConceptChapter,
    currentReaderProcessingSignal,
    generateAllConceptsModel,
    generateOnlyMissingConcepts,
    isGeneratingAllConcepts,
    isIdentifyingChapters,
    isRecognizingAll,
    loadConceptCountsByChapter,
    onProcessingComplete,
    pageNumber,
    pages,
    processingPage,
    refreshConceptCounts,
    refreshEntityCounts,
    revealPane,
    selectedModel,
    setConceptFirstPageByKey,
    setConcepts,
    setConfirmedProcessingStage,
    setError,
    setGeneratedConceptsChapterCount,
    setIsGeneratingAllConcepts,
    setIsGeneratingChapterConcepts,
    setIsPageGenerationConfirmationOpen,
    setOpenRouterSpent,
    setPages,
    setProcessingPage,
    setSkillsRefreshToken,
    totalPages
  });

  const quality = useBookConceptQuality({
    addDeduplicateConceptsCost,
    addEmbeddingsCost,
    addFixConceptsCost,
    autoRunAll,
    book,
    completeStage,
    conceptChapters,
    currentConceptChapter,
    currentReaderProcessingSignal,
    deduplicateConceptsReview,
    embeddingModel,
    fixConceptsReview,
    generateAllConceptsModel,
    isApplyingDeduplicateConceptsReview,
    isApplyingFixConceptsReview,
    isDeduplicatingConcepts,
    isEmbeddingConcepts,
    isFixingConcepts,
    isGeneratingAllConcepts,
    isIdentifyingChapters,
    isRecognizingAll,
    isSortingConcepts,
    loadDeduplicateConceptInventory,
    onBookChange,
    onProcessingComplete,
    pages,
    refreshConceptCounts,
    refreshEntityCounts,
    revealPane,
    setConceptEmbeddingsRefreshToken,
    setConceptFirstPageByKey,
    setConcepts,
    setDeduplicateConceptsReview,
    setEmbeddingByConceptId,
    setEmbeddingConceptInventory,
    setError,
    setFixedConceptsChapterCount,
    setFixConceptsChapterStatuses,
    setFixConceptsReview,
    setFixConceptsReviewChapterIndex,
    setFixConceptsTargetChapterCount,
    setIsApplyingDeduplicateConceptsReview,
    setIsApplyingFixConceptsReview,
    setIsDeduplicatingConcepts,
    setIsEmbeddingConcepts,
    setIsFixingConcepts,
    setOpenRouterSpent,
    setSkillsRefreshToken
  });

  const organization = useBookConceptOrganization({
    addRefineChaptersCost,
    addSortConceptsCost,
    book,
    completeStage,
    conceptChapters,
    currentConceptChapter,
    currentReaderProcessingSignal,
    deduplicateConceptsReview,
    fixConceptsReview,
    generateAllConceptsModel,
    isDeduplicatingConcepts,
    isEmbeddingConcepts,
    isFixingConcepts,
    isGeneratingAllConcepts,
    isIdentifyingChapters,
    isRecognizingAll,
    isRefiningChapters,
    isSortingConcepts,
    onBookChange,
    pages,
    refreshChapterAssignments,
    refreshConceptCounts,
    refreshEntityCounts,
    revealPane,
    setConceptFirstPageByKey,
    setConcepts,
    setError,
    setIsRefiningChapters,
    setIsSortingConcepts,
    setOpenRouterSpent,
    setRefinedChaptersChapterCount,
    setSkillsRefreshToken,
    setSortedConceptsChapterCount
  });

  return {
    ...generation,
    ...quality,
    ...organization
  };
}
