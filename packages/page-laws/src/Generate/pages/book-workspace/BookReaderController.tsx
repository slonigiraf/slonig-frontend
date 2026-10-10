// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookChapter, BookConcept, BookPage, BookProcessingStageKey, Exercise } from '@slonigiraf/db';
import { completeBookProcessingStage, isBookProcessingStageComplete, withCompletedBookProcessingStage } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PROCESSING_MODEL } from '../../book/application/config.js';
import { type StandardsCatalog, type StoredBookStandards } from '../../book/domain/standards/standards.js';
import { loadStoredBookStandards } from '../../book/infrastructure/storage/standardsStorage.js';
import { loadFixConceptsChapterStatuses, type FixConceptsChapterStatuses } from '../../book/infrastructure/storage/fixConceptsProgress.js';
import { useBookProcessingRunner } from '../../book/application/pipeline/useBookProcessingRunner.js';
import { bookProcessingManager } from '../../book/application/pipeline/bookProcessingManager.js';
import { useTranslation } from '../../../common/translate.js';
import type { ProcessingStatus } from '../../shared/types/processing.js';
import type { AutoRunProgress } from '../../shared/types/processing.js';
import { getSessionExerciseChapter, getSessionReaderMaximized, getSessionReaderPane, getSessionRecognitionAttempted, storeSessionPage, storeSessionRecognitionAttempted } from '../../book/infrastructure/storage/bookReaderSession.js';
import type { DeduplicateConceptsReview, FixConceptsReview, Props } from './BookReaderTypes.js';
import type { ReaderEntityCounts, ReaderPane } from '../../shared/types/bookWorkspace.js';
import { useBookChapterActions } from './hooks/useBookChapterActions.js';
import { useBookConceptProcessing } from './hooks/useBookConceptProcessing.js';
import { useBookExerciseEditor } from './hooks/useBookExerciseEditor.js';
import { useBookLearningContentProcessing } from './hooks/useBookLearningContentProcessing.js';
import { useBookMetadataController } from './hooks/useBookMetadataController.js';
import { useBookReaderCosts } from './hooks/useBookReaderCosts.js';
import { useBookReaderDocumentRuntime } from './hooks/useBookReaderDocumentRuntime.js';
import { useBookReaderNavigationModel } from './hooks/useBookReaderNavigationModel.js';
import { useBookReaderProcessingStatus } from './hooks/useBookReaderProcessingStatus.js';
import { useBookRecognitionController } from './hooks/useBookRecognitionController.js';
import { useConceptEditor } from './hooks/useConceptEditor.js';


export function useBookReaderController (props: Props) {
  const {
    autoRunAll = false,
    autoRunStartKey,
    autoRunSkipRefineChapters,
    book,
    embeddingModel,
    file,
    fixOnlyFailedConcepts,
    generateAllConceptsModel,
    generateOnlyMissingConcepts,
    generateOnlyMissingStandards,
    isPriceDisabled = false,
    onAbortFastForward,
    onAutoRunComplete,
    onBookChange,
    onFastForward,
    onPrice,
    onProcessingComplete,
    pendingProcessingAction,
    processingToolbar,
    processingToolbarAfterFixImages,
    standardsModel,
  } = props;
  const { t } = useTranslation();
  const [activePane, setActivePane] = useState<ReaderPane>(() => {
    const storedPane = getSessionReaderPane(book.id);

    if (!isBookProcessingStageComplete(book, 'recognize')) {
      return 'text';
    }

    if (storedPane === 'standards' && !isBookProcessingStageComplete(book, 'fixImages')) {
      return isBookProcessingStageComplete(book, 'abilities')
        ? 'preExercisesExercises'
        : isBookProcessingStageComplete(book, 'concepts') ? 'textConcepts' : 'text';
    }

    if (storedPane === 'embeddings' && !isBookProcessingStageComplete(book, 'embeddings')) {
      return isBookProcessingStageComplete(book, 'concepts') ? 'textConcepts' : 'text';
    }

    return storedPane;
  });
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<number>>(new Set());
  const [isDeletingChapters, setIsDeletingChapters] = useState(false);
  const [isDeleteChaptersConfirmationOpen, setIsDeleteChaptersConfirmationOpen] = useState(false);
  const [editingChapter, setEditingChapter] = useState<BookChapter>();
  const [chapterTitleDraft, setChapterTitleDraft] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [concepts, setConcepts] = useState<BookConcept[]>([]);
  const [conceptCountsByChapter, setConceptCountsByChapter] = useState<Map<string, number>>(new Map());
  const [standardsByChapter, setStandardsByChapter] = useState<StoredBookStandards>(() => loadStoredBookStandards(book.id));
  const [fixConceptsChapterStatuses, setFixConceptsChapterStatuses] = useState<FixConceptsChapterStatuses>(() => loadFixConceptsChapterStatuses(book.id));
  const [fixConceptsReview, setFixConceptsReview] = useState<FixConceptsReview>();
  const [fixConceptsReviewChapterIndex, setFixConceptsReviewChapterIndex] = useState(0);
  const [isApplyingFixConceptsReview, setIsApplyingFixConceptsReview] = useState(false);
  const [deduplicateConceptsReview, setDeduplicateConceptsReview] = useState<DeduplicateConceptsReview>();
  const [isApplyingDeduplicateConceptsReview, setIsApplyingDeduplicateConceptsReview] = useState(false);
  const [standardsCatalogs, setStandardsCatalogs] = useState<StandardsCatalog[]>([]);
  const [standardsChapterIndex, setStandardsChapterIndex] = useState(0);
  const [embeddingHeatmapMode, setEmbeddingHeatmapMode] = useState<'book' | 'chapter'>('chapter');
  const [embeddingConceptInventory, setEmbeddingConceptInventory] = useState<BookConcept[]>([]);
  const [embeddingByConceptId, setEmbeddingByConceptId] = useState<Map<number, number[]>>(new Map());
  const [isEmbeddingHeatmapLoading, setIsEmbeddingHeatmapLoading] = useState(false);
  const [conceptEmbeddingsRefreshToken, setConceptEmbeddingsRefreshToken] = useState(0);
  const [conceptChapterIndex, setConceptChapterIndex] = useState(0);
  const [standardsAssignedChapterCount, setStandardsAssignedChapterCount] = useState(0);
  const [standardsTargetChapterCount, setStandardsTargetChapterCount] = useState(0);
  const [fixConceptsTargetChapterCount, setFixConceptsTargetChapterCount] = useState(0);
  const [isAssigningStandards, setIsAssigningStandards] = useState(false);
  const [conceptFirstPageByKey, setConceptFirstPageByKey] = useState<Map<string, number>>(new Map());
  const [exerciseChapterConcepts, setExerciseChapterConcepts] = useState<BookConcept[]>([]);
  const [exerciseChapterExercises, setExerciseChapterExercises] = useState<Exercise[]>([]);
  const [exerciseChapterMissingCounts, setExerciseChapterMissingCounts] = useState<Map<string, number>>(new Map());
  const [exerciseChapterIndex, setExerciseChapterIndex] = useState(() => getSessionExerciseChapter(book.id));
  const [isExerciseChapterLoading, setIsExerciseChapterLoading] = useState(false);
  const [error, setError] = useState('');
  const [entityCounts, setEntityCounts] = useState<ReaderEntityCounts>({ abilities: 0, bookExercises: 0, concepts: 0, exercises: 0 });
  const [generatedConceptsChapterCount, setGeneratedConceptsChapterCount] = useState(0);
  const [fixedConceptsChapterCount, setFixedConceptsChapterCount] = useState(0);
  const [sortedConceptsChapterCount, setSortedConceptsChapterCount] = useState(0);
  const [refinedChaptersChapterCount, setRefinedChaptersChapterCount] = useState(0);
  const [isEmbeddingConcepts, setIsEmbeddingConcepts] = useState(false);
  const [isDeduplicatingConcepts, setIsDeduplicatingConcepts] = useState(false);
  const [isFixingConcepts, setIsFixingConcepts] = useState(false);
  const [isSortingConcepts, setIsSortingConcepts] = useState(false);
  const [isRefiningChapters, setIsRefiningChapters] = useState(false);
  const [identifiedChapterPageCount, setIdentifiedChapterPageCount] = useState(0);
  const [chapterIdentificationPhase, setChapterIdentificationPhase] = useState<'bookmarks' | 'saving' | 'text'>('bookmarks');
  const [isIdentifyingChapters, setIsIdentifyingChapters] = useState(false);
  const chapterIdentificationLabel = chapterIdentificationPhase === 'bookmarks'
    ? 'Reading PDF bookmarks'
    : chapterIdentificationPhase === 'saving'
      ? 'Saving chapter assignments'
      : 'Identifying chapters from page text';
  const [isGeneratingAllConcepts, setIsGeneratingAllConcepts] = useState(false);
  const [isGeneratingChapterConcepts, setIsGeneratingChapterConcepts] = useState(false);
  const [isMaximized, setIsMaximized] = useState(() => getSessionReaderMaximized(book.id));
  const [isPageGenerationConfirmationOpen, setIsPageGenerationConfirmationOpen] = useState(false);
  const [openRouterSpent, setOpenRouterSpent] = useState(0);
  const [hasRecognitionBeenAttempted, setHasRecognitionBeenAttempted] = useState(() => getSessionRecognitionAttempted(book.id));
  const [revealedPanes, setRevealedPanes] = useState<Set<ReaderPane>>(new Set());
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [renderedPageHeight, setRenderedPageHeight] = useState<number>();
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [autoRunProgress, setAutoRunProgress] = useState<AutoRunProgress>();
  const [autoRunProcessing, setAutoRunProcessing] = useState<ProcessingStatus>();
  const [selectedPipelineKey, setSelectedPipelineKey] = useState('');
  const [skillsRefreshToken, setSkillsRefreshToken] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const conceptsOutputRef = useRef<HTMLDivElement>(null);
  const exerciseConceptsOutputRef = useRef<HTMLDivElement>(null);
  const standardsChapterOutputRef = useRef<HTMLDivElement>(null);
  const pendingConceptChapterFocusRef = useRef(false);
  const pendingExerciseChapterFocusRef = useRef(false);
  const pendingStandardsChapterFocusRef = useRef(false);

  const currentReaderProcessingSignal = useCallback((): AbortSignal => bookProcessingManager.signal(book.id), [book.id]);

  useEffect((): void => {
    setHasRecognitionBeenAttempted(getSessionRecognitionAttempted(book.id));
  }, [book.id]);

  useEffect((): void => {
    if (pendingProcessingAction !== 'recognize') {
      return;
    }

    setHasRecognitionBeenAttempted(true);
    storeSessionRecognitionAttempted(book.id);
  }, [book.id, pendingProcessingAction]);

  const costs = useBookReaderCosts({ bookId: book.id, setOpenRouterSpent });
  const {
    addAgeCost,
    addChaptersCost,
    addConceptsCost,
    addDeduplicateConceptsCost,
    addEmbeddingsCost,
    addFixConceptsCost,
    addLanguageCost,
    addOpenRouterStageCost,
    addRecognizeCost,
    addRecognizeExternalCall,
    addRefineChaptersCost,
    addSortConceptsCost,
    addStandardsCost,
    addSubjectCost
  } = costs;
  const navigationModel = useBookReaderNavigationModel({
    activePane,
    book,
    conceptChapterIndex,
    conceptEmbeddingsRefreshToken,
    embeddingByConceptId,
    embeddingConceptInventory,
    embeddingHeatmapMode,
    embeddingModel,
    exerciseChapterIndex,
    isMaximized,
    pages,
    pendingExerciseChapterFocusRef,
    pendingStandardsChapterFocusRef,
    selectedModel,
    setActivePane,
    setConceptChapterIndex,
    setConceptCountsByChapter,
    setEmbeddingByConceptId,
    setEmbeddingConceptInventory,
    setEntityCounts,
    setExerciseChapterIndex,
    setFixConceptsChapterStatuses,
    setIsEmbeddingHeatmapLoading,
    setRevealedPanes,
    setSkillsRefreshToken,
    setStandardsByChapter,
    setStandardsCatalogs,
    setStandardsChapterIndex,
    standardsCatalogs,
    standardsChapterIndex,
    totalPages
  });
  const {
    conceptChapters,
    currentConceptChapter,
    currentExerciseChapter,
    exerciseChapters,
    loadConceptCountsByChapter,
    loadDeduplicateConceptInventory,
    refreshConceptCounts,
    refreshEntityCounts,
    revealPane
  } = navigationModel;

  const metadata = useBookMetadataController({
    addAgeCost,
    addLanguageCost,
    addSubjectCost,
    autoRunAll,
    book,
    currentReaderProcessingSignal,
    onBookChange,
    pages,
    revealPane,
    setError,
    setOpenRouterSpent,
    totalPages
  });
  const {
    ageSamplePageNumbers,
    ageSamplePageTexts,
    confirmedProcessingStage,
    isDetectingBookAge,
    isDetectingBookLanguage,
    isDetectingBookSubject,
    isMmdConversionComplete,
    openAgeDetectionConfirmation,
    openLanguageDetectionConfirmation,
    openSubjectDetectionConfirmation,
    setConfirmedProcessingStage,
    setIsDetectingBookAge,
    setIsDetectingBookLanguage,
    setIsDetectingBookSubject
  } = metadata;

  useEffect(() => {
    if (pendingProcessingAction) {
      setOpenRouterSpent(0);
    }

    if (pendingProcessingAction === 'recognize') {
      // Recognition resets the conversion pipeline, so no downstream result
      // tab should remain exposed from an earlier run.
      setRevealedPanes(new Set());
      setActivePane('text');
    }
  }, [pendingProcessingAction]);

  const completeStage = useCallback(async (stage: BookProcessingStageKey): Promise<void> => {
    if (isBookProcessingStageComplete(book, stage)) {
      return;
    }

    const updatedBook = await completeBookProcessingStage(book.id, stage);

    onBookChange(updatedBook ?? withCompletedBookProcessingStage(book, stage));
  }, [book, onBookChange]);
  const recognition = useBookRecognitionController({
    addRecognizeCost,
    addRecognizeExternalCall,
    bookId: book.id,
    completeStage,
    currentReaderProcessingSignal,
    file,
    isGeneratingAllConcepts,
    isIdentifyingChapters,
    onProcessingComplete,
    pageNumber,
    pages,
    setActivePane,
    setError,
    setOpenRouterSpent,
    setPages,
    totalPages
  });
  const {
    isRecognizingAll,
    processingPage,
    recognizedPageCount,
    recognizeAllPages,
    recognizePage,
    setIsRecognizingAll,
    setProcessingPage
  } = recognition;
  const completeStageRef = useRef(completeStage);

  completeStageRef.current = completeStage;

  useBookReaderDocumentRuntime({
    activePane,
    autoRunAll,
    book,
    canvasRef,
    completeStageRef,
    concepts,
    conceptsOutputRef,
    currentConceptChapter,
    currentExerciseChapter,
    embeddingHeatmapMode,
    exerciseChapterConcepts,
    exerciseChapters,
    exerciseConceptsOutputRef,
    file,
    isExerciseChapterLoading,
    isMaximized,
    pageAreaRef,
    pageNumber,
    pages,
    pdf,
    pendingConceptChapterFocusRef,
    pendingExerciseChapterFocusRef,
    pendingStandardsChapterFocusRef,
    setChapters,
    setConceptFirstPageByKey,
    setConcepts,
    setError,
    setExerciseChapterConcepts,
    setExerciseChapterExercises,
    setExerciseChapterMissingCounts,
    setIsExerciseChapterLoading,
    setPageInput,
    setPageNumber,
    setPages,
    setPdf,
    setRenderedPageHeight,
    setTotalPages,
    skillsRefreshToken,
    standardsChapterIndex,
    standardsChapterOutputRef
  });

  const currentBookPage = pages.get(pageNumber);
  const currentChapter = useMemo(() => {
    if (!currentBookPage) {
      return undefined;
    }

    return chapters.find(({ id }) => id !== undefined && id === currentBookPage.chapterId) ?? chapters.find(({ title }) => title === currentBookPage.chapter);
  }, [chapters, currentBookPage]);

  useEffect(() => {
    setChapterTitleDraft(currentChapter?.title ?? '');
  }, [currentChapter?.id, currentChapter?.title]);

  const chapterActions = useBookChapterActions({
    addChaptersCost,
    book,
    chapterTitleDraft,
    chapters,
    completeStage,
    currentChapter,
    currentReaderProcessingSignal,
    generateAllConceptsModel,
    isDeletingChapters,
    isGeneratingAllConcepts,
    isIdentifyingChapters,
    isRecognizingAll,
    newChapterTitle,
    onBookChange,
    onProcessingComplete,
    pageNumber,
    pages,
    pdf,
    processingPage,
    refreshConceptCounts,
    refreshEntityCounts,
    revealPane,
    selectedChapterIds,
    setChapterIdentificationPhase,
    setChapters,
    setEditingChapter,
    setError,
    setIdentifiedChapterPageCount,
    setIsDeletingChapters,
    setIsIdentifyingChapters,
    setNewChapterTitle,
    setOpenRouterSpent,
    setPages,
    setSelectedChapterIds,
    setSkillsRefreshToken,
    totalPages
  });
  const { identifyChapters, refreshChapterAssignments } = chapterActions;
  const conceptProcessing = useBookConceptProcessing({
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
  });
  const {
    deduplicateAllConcepts,
    embedAllConcepts,
    fixAllConcepts,
    generateAllConcepts,
    refineAllChapters,
    sortAllConcepts
  } = conceptProcessing;
  const learningContentProcessing = useBookLearningContentProcessing({
    addStandardsCost,
    book,
    completeStage,
    conceptChapters,
    currentReaderProcessingSignal,
    embeddingModel,
    isAssigningStandards,
    pages,
    revealPane,
    setConceptEmbeddingsRefreshToken,
    setError,
    setIsAssigningStandards,
    setOpenRouterSpent,
    setStandardsAssignedChapterCount,
    setStandardsTargetChapterCount,
    setStandardsByChapter,
    standardsByChapter,
    standardsModel
  });
  const { assignStandards } = learningContentProcessing;

  useBookProcessingRunner({
    bookId: book.id,
    ageSamplePageCount: ageSamplePageNumbers.length,
    ageSampleTextCount: ageSamplePageTexts.length,
    assignStandards,
    conceptChapterCount: conceptChapters.length,
    deduplicateAllConcepts,
    embedAllConcepts,
    fixAllConcepts,
    fixOnlyFailedConcepts,
    generateAllConcepts,
    generateAllConceptsModel,
    generateOnlyMissingStandards,
    identifyChapters,
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
    onProcessingComplete,
    openAgeDetectionConfirmation,
    openLanguageDetectionConfirmation,
    openSubjectDetectionConfirmation,
    processingPage,
    recognizeAllPages,
    refineAllChapters,
    setActivePane,
    setError,
    sortAllConcepts,
    totalPages
  });


  useEffect(() => {
    if (!isMaximized) {
      return;
    }

    const closeOnEscape = ({ key }: KeyboardEvent): void => {
      if (key === 'Escape') {
        setIsMaximized(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape);

    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMaximized]);

  const goToPage = useCallback((requestedPage: number): void => {
    if (!totalPages) {
      return;
    }

    const nextPage = Math.min(totalPages, Math.max(1, requestedPage));

    setPageNumber(nextPage);
    setPageInput(String(nextPage));
    storeSessionPage(book.id, nextPage);
  }, [book.id, totalPages]);

  const conceptEditor = useConceptEditor({
    addFixConceptsCost,
    book,
    conceptChapterIndex,
    conceptChapters,
    concepts,
    conceptsOutputRef,
    currentConceptChapter,
    generateAllConceptsModel,
    goToPage,
    isApplyingFixConceptsReview,
    pages,
    pendingConceptChapterFocusRef,
    refreshConceptCounts,
    refreshEntityCounts,
    setConceptChapterIndex,
    setConceptFirstPageByKey,
    setConcepts,
    setError,
    setSkillsRefreshToken,
    setStandardsByChapter
  });


  const exerciseEditor = useBookExerciseEditor({
    addOpenRouterStageCost,
    book,
    currentExerciseChapter,
    exerciseChapterConcepts,
    generateAllConceptsModel,
    pages,
    refreshEntityCounts,
    setError,
    setExerciseChapterExercises,
    setSkillsRefreshToken
  });

  const submitPageInput = useCallback((): void => {
    const requestedPage = Number(pageInput);

    if (Number.isInteger(requestedPage)) {
      goToPage(requestedPage);
    } else {
      setPageInput(String(pageNumber));
    }
  }, [goToPage, pageInput, pageNumber]);

  const unrecognizedPageNumbers = useMemo(() => Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter((candidatePageNumber) => pages.get(candidatePageNumber)?.pageMMD === undefined), [pages, totalPages]);
  const isCurrentPageUnrecognized = unrecognizedPageNumbers.includes(pageNumber);
  const showUnrecognizedPages = hasRecognitionBeenAttempted && unrecognizedPageNumbers.length > 0;
  const rerecognizePage = useCallback((): void => {
    recognizePage().catch(console.error);
  }, [recognizePage]);

  const processingStatus = useBookReaderProcessingStatus({
    autoRunAll,
    autoRunProcessing,
    bookId: book.id,
    chapterIdentificationLabel,
    conceptChapterCount: conceptChapters.length,
    confirmedProcessingStage,
    currentConceptChapterTitle: currentConceptChapter?.title,
    fixConceptsTargetChapterCount,
    fixedConceptsChapterCount,
    generatedConceptsChapterCount,
    identifiedChapterPageCount,
    isAssigningStandards,
    isDeduplicatingConcepts,
    isDetectingBookAge,
    isDetectingBookLanguage,
    isDetectingBookSubject,
    isEmbeddingConcepts,
    isFixingConcepts,
    isGeneratingAllConcepts,
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
    totalPages,
  });
  const { setLastReaderProcessing } = processingStatus;

  const abortProcessing = (): void => {
    bookProcessingManager.cancel(book.id);
    setProcessingPage(undefined);
    setIsDetectingBookLanguage(false);
    setIsDetectingBookSubject(false);
    setIsDetectingBookAge(false);
    setIsRecognizingAll(false);
    setIsIdentifyingChapters(false);
    setIsGeneratingAllConcepts(false);
    setIsGeneratingChapterConcepts(false);
    setIsFixingConcepts(false);
    setIsDeduplicatingConcepts(false);
    setIsSortingConcepts(false);
    setIsRefiningChapters(false);
    setIsAssigningStandards(false);
    setConfirmedProcessingStage(undefined);
    setAutoRunProcessing(undefined);
    setLastReaderProcessing(undefined);

    onProcessingComplete();
  };

  return {
    autoRunAll,
    autoRunStartKey,
    autoRunSkipRefineChapters,
    book,
    embeddingModel,
    file,
    fixOnlyFailedConcepts,
    generateAllConceptsModel,
    generateOnlyMissingConcepts,
    isPriceDisabled,
    onAbortFastForward,
    onAutoRunComplete,
    onBookChange,
    onFastForward,
    onPrice,
    onProcessingComplete,
    processingToolbar,
    processingToolbarAfterFixImages,
    standardsModel,
    t,
    ...costs,
    ...metadata,
    ...recognition,
    ...conceptEditor,
    ...exerciseEditor,
    ...processingStatus,
    activePane,
    setActivePane,
    chapters,
    setChapters,
    selectedChapterIds,
    setSelectedChapterIds,
    isDeletingChapters,
    setIsDeletingChapters,
    isDeleteChaptersConfirmationOpen,
    setIsDeleteChaptersConfirmationOpen,
    editingChapter,
    setEditingChapter,
    chapterTitleDraft,
    setChapterTitleDraft,
    newChapterTitle,
    setNewChapterTitle,
    concepts,
    setConcepts,
    conceptCountsByChapter,
    setConceptCountsByChapter,
    standardsByChapter,
    setStandardsByChapter,
    fixConceptsChapterStatuses,
    setFixConceptsChapterStatuses,
    fixConceptsReview,
    setFixConceptsReview,
    fixConceptsReviewChapterIndex,
    setFixConceptsReviewChapterIndex,
    isApplyingFixConceptsReview,
    setIsApplyingFixConceptsReview,
    deduplicateConceptsReview,
    setDeduplicateConceptsReview,
    isApplyingDeduplicateConceptsReview,
    setIsApplyingDeduplicateConceptsReview,
    standardsCatalogs,
    setStandardsCatalogs,
    standardsChapterIndex,
    setStandardsChapterIndex,
    embeddingHeatmapMode,
    setEmbeddingHeatmapMode,
    embeddingConceptInventory,
    setEmbeddingConceptInventory,
    embeddingByConceptId,
    setEmbeddingByConceptId,
    isEmbeddingHeatmapLoading,
    setIsEmbeddingHeatmapLoading,
    conceptEmbeddingsRefreshToken,
    setConceptEmbeddingsRefreshToken,
    conceptChapterIndex,
    setConceptChapterIndex,
    standardsAssignedChapterCount,
    setStandardsAssignedChapterCount,
    standardsTargetChapterCount,
    setStandardsTargetChapterCount,
    fixConceptsTargetChapterCount,
    setFixConceptsTargetChapterCount,
    isAssigningStandards,
    setIsAssigningStandards,
    conceptFirstPageByKey,
    setConceptFirstPageByKey,
    exerciseChapterConcepts,
    setExerciseChapterConcepts,
    exerciseChapterExercises,
    setExerciseChapterExercises,
    exerciseChapterMissingCounts,
    setExerciseChapterMissingCounts,
    exerciseChapterIndex,
    setExerciseChapterIndex,
    isExerciseChapterLoading,
    setIsExerciseChapterLoading,
    error,
    setError,
    entityCounts,
    setEntityCounts,
    generatedConceptsChapterCount,
    setGeneratedConceptsChapterCount,
    fixedConceptsChapterCount,
    setFixedConceptsChapterCount,
    sortedConceptsChapterCount,
    setSortedConceptsChapterCount,
    refinedChaptersChapterCount,
    setRefinedChaptersChapterCount,
    isEmbeddingConcepts,
    setIsEmbeddingConcepts,
    isDeduplicatingConcepts,
    setIsDeduplicatingConcepts,
    isFixingConcepts,
    setIsFixingConcepts,
    isSortingConcepts,
    setIsSortingConcepts,
    isRefiningChapters,
    setIsRefiningChapters,
    identifiedChapterPageCount,
    setIdentifiedChapterPageCount,
    chapterIdentificationPhase,
    setChapterIdentificationPhase,
    isIdentifyingChapters,
    setIsIdentifyingChapters,
    chapterIdentificationLabel,
    isGeneratingAllConcepts,
    setIsGeneratingAllConcepts,
    isGeneratingChapterConcepts,
    setIsGeneratingChapterConcepts,
    isMaximized,
    setIsMaximized,
    isPageGenerationConfirmationOpen,
    setIsPageGenerationConfirmationOpen,
    openRouterSpent,
    setOpenRouterSpent,
    hasRecognitionBeenAttempted,
    setHasRecognitionBeenAttempted,
    revealedPanes,
    setRevealedPanes,
    pageInput,
    setPageInput,
    pageNumber,
    setPageNumber,
    pages,
    setPages,
    pdf,
    setPdf,
    renderedPageHeight,
    setRenderedPageHeight,
    selectedModel,
    setSelectedModel,
    autoRunProgress,
    setAutoRunProgress,
    autoRunProcessing,
    setAutoRunProcessing,
    selectedPipelineKey,
    setSelectedPipelineKey,
    skillsRefreshToken,
    setSkillsRefreshToken,
    totalPages,
    setTotalPages,
    canvasRef,
    pageAreaRef,
    conceptsOutputRef,
    exerciseConceptsOutputRef,
    standardsChapterOutputRef,
    pendingConceptChapterFocusRef,
    pendingExerciseChapterFocusRef,
    pendingStandardsChapterFocusRef,
    currentReaderProcessingSignal,
    ...navigationModel,
    completeStage,
    completeStageRef,
    currentBookPage,
    currentChapter,
    ...chapterActions,
    ...conceptProcessing,
    ...learningContentProcessing,
    goToPage,
    submitPageInput,
    unrecognizedPageNumbers,
    isCurrentPageUnrecognized,
    showUnrecognizedPages,
    rerecognizePage,
    abortProcessing,
  } as const;
}

export type { Props } from './BookReaderTypes.js';
export type BookReaderController = ReturnType<typeof useBookReaderController>;
