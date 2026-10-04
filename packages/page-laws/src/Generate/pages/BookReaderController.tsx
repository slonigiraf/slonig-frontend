// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookChapter, BookConcept, BookPage, BookProcessingStageKey, Exercise } from '@slonigiraf/db';
import { completeBookProcessingStage, isBookProcessingStageComplete, withCompletedBookProcessingStage } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { DEFAULT_PROCESSING_MODEL } from '../book/processing/config.js';
import { loadStoredBookStandards, type StandardsCatalog, type StoredBookStandards } from '../book/processing/standards/standards.js';
import { loadFixConceptsChapterStatuses, type FixConceptsChapterStatuses } from '../book/runtime/fixConceptsProgress.js';
import { useBookProcessingRunner } from '../book/runtime/useBookProcessingRunner.js';
import { useTranslation } from '../../common/translate.js';
import { type ProcessingStatus } from '../components/ProcessingPopup.js';
import { type AutoRunProgress } from './Skills.js';
import { getSessionExerciseChapter, getSessionReaderMaximized, getSessionReaderPane, getSessionRecognitionAttempted, storeSessionPage, storeSessionRecognitionAttempted } from './BookReaderUtils.js';
import type { DeduplicateConceptsReview, FixConceptsReview, Props, ReaderEntityCounts, ReaderPane } from './BookReaderUtils.js';
import { useBookChapterActions } from './useBookChapterActions.js';
import { useBookConceptProcessing } from './useBookConceptProcessing.js';
import { useBookExerciseEditor } from './useBookExerciseEditor.js';
import { useBookLearningContentProcessing } from './useBookLearningContentProcessing.js';
import { useBookMetadataController } from './useBookMetadataController.js';
import { useBookReaderCosts } from './useBookReaderCosts.js';
import { useBookReaderDocumentRuntime } from './useBookReaderDocumentRuntime.js';
import { useBookReaderNavigationModel } from './useBookReaderNavigationModel.js';
import { useBookReaderProcessingStatus } from './useBookReaderProcessingStatus.js';
import { useBookRecognitionController } from './useBookRecognitionController.js';
import { useConceptEditor } from './useConceptEditor.js';


export function useBookReaderController (props: Props) {
  const {
    ageTabRequest,
    assignAllStandardsRequest,
    autoRunAll = false,
    autoRunStartKey,
    book,
    deduplicateAllConceptsRequest,
    embedAllConceptsRequest,
    embeddingModel,
    file,
    fixAllConceptsRequest,
    fixOnlyFailedConcepts,
    sortAllConceptsRequest,
    refineAllChaptersRequest,
    generateAllConceptsModel,
    generateAllConceptsRequest,
    generateAllExercisesRequest,
    generateOnlyMissingConcepts,
    generateOnlyMissingExercises,
    identifyChaptersRequest,
    isPriceDisabled = false,
    languageTabRequest,
    subjectTabRequest,
    onAbortFastForward,
    onAutoRunComplete,
    onBookChange,
    onFastForward,
    onPrice,
    onProcessingComplete,
    pendingProcessingAction,
    processingToolbar,
    processingToolbarAfterFixImages,
    recognizeAllRequest,
    standardsModel,
  } = props;
  const { t } = useTranslation();
  const [activePane, setActivePane] = useState<ReaderPane>(() => {
    const storedPane = getSessionReaderPane(book.id);

    if (!isBookProcessingStageComplete(book, 'recognize')) {
      return 'text';
    }

    if (storedPane === 'standards' && !isBookProcessingStageComplete(book, 'fixImages')) {
      return isBookProcessingStageComplete(book, 'fixExercises')
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
  const [isGeneratingAllExercises, setIsGeneratingAllExercises] = useState(false);
  const [openRouterSpent, setOpenRouterSpent] = useState(0);
  const [hasRecognitionBeenAttempted, setHasRecognitionBeenAttempted] = useState(() => getSessionRecognitionAttempted(book.id));
  const [revealedPanes, setRevealedPanes] = useState<Set<ReaderPane>>(new Set());
  const [generatedExercisesPageCount, setGeneratedExercisesPageCount] = useState(0);
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [renderedPageHeight, setRenderedPageHeight] = useState<number>();
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [autoRunProgress, setAutoRunProgress] = useState<AutoRunProgress>();
  const [autoRunProcessing, setAutoRunProcessing] = useState<ProcessingStatus>();
  const readerProcessingAbortControllerRef = useRef<AbortController | null>(null);
  const skillsAutoRunAbortRef = useRef<(() => void) | null>(null);
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

  const currentReaderProcessingSignal = useCallback((): AbortSignal => {
    if (!readerProcessingAbortControllerRef.current || readerProcessingAbortControllerRef.current.signal.aborted) {
      readerProcessingAbortControllerRef.current = new AbortController();
    }

    return readerProcessingAbortControllerRef.current.signal;
  }, []);

  useEffect(() => () => readerProcessingAbortControllerRef.current?.abort(), []);

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
    addExercisesCost,
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
    isGeneratingAllExercises,
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
    isGeneratingAllExercises,
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
    addExercisesCost,
    addStandardsCost,
    book,
    completeStage,
    conceptChapters,
    currentReaderProcessingSignal,
    embeddingModel,
    generateAllConceptsModel,
    generateOnlyMissingExercises,
    isAssigningStandards,
    isGeneratingAllConcepts,
    isGeneratingAllExercises,
    isIdentifyingChapters,
    isRecognizingAll,
    isRefiningChapters,
    onProcessingComplete,
    pages,
    processingPage,
    refreshEntityCounts,
    revealPane,
    setConceptEmbeddingsRefreshToken,
    setError,
    setGeneratedExercisesPageCount,
    setIsAssigningStandards,
    setIsGeneratingAllExercises,
    setOpenRouterSpent,
    setSkillsRefreshToken,
    setStandardsAssignedChapterCount,
    setStandardsByChapter,
    standardsByChapter,
    standardsModel,
    totalPages
  });
  const { assignStandards, generateAllExercises } = learningContentProcessing;

  useBookProcessingRunner({
    ageSamplePageCount: ageSamplePageNumbers.length,
    ageSampleTextCount: ageSamplePageTexts.length,
    ageTabRequest,
    assignAllStandardsRequest,
    assignStandards,
    conceptChapterCount: conceptChapters.length,
    deduplicateAllConcepts,
    deduplicateAllConceptsRequest,
    embedAllConcepts,
    embedAllConceptsRequest,
    fixAllConcepts,
    fixAllConceptsRequest,
    fixOnlyFailedConcepts,
    generateAllConcepts,
    generateAllConceptsModel,
    generateAllConceptsRequest,
    generateAllExercises,
    generateAllExercisesRequest,
    identifyChapters,
    identifyChaptersRequest,
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
    languageTabRequest,
    onProcessingComplete,
    openAgeDetectionConfirmation,
    openLanguageDetectionConfirmation,
    openSubjectDetectionConfirmation,
    processingPage,
    recognizeAllPages,
    recognizeAllRequest,
    refineAllChapters,
    refineAllChaptersRequest,
    setActivePane,
    setError,
    sortAllConcepts,
    sortAllConceptsRequest,
    subjectTabRequest,
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
    setSkillsRefreshToken
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
  });
  const { setLastReaderProcessing } = processingStatus;

  const onAutoRunAbortReady = useCallback((abort?: () => void): void => {
    skillsAutoRunAbortRef.current = abort ?? null;
  }, []);

  const abortProcessing = (): void => {
    readerProcessingAbortControllerRef.current?.abort();
    readerProcessingAbortControllerRef.current = null;
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
    setIsGeneratingAllExercises(false);
    setConfirmedProcessingStage(undefined);
    setAutoRunProcessing(undefined);
    setLastReaderProcessing(undefined);

    if (autoRunAll && skillsAutoRunAbortRef.current) {
      skillsAutoRunAbortRef.current();
    } else {
      onAbortFastForward();
    }

    onProcessingComplete();
  };

  return {
    ageTabRequest,
    assignAllStandardsRequest,
    autoRunAll,
    autoRunStartKey,
    book,
    deduplicateAllConceptsRequest,
    embedAllConceptsRequest,
    embeddingModel,
    file,
    fixAllConceptsRequest,
    fixOnlyFailedConcepts,
    sortAllConceptsRequest,
    refineAllChaptersRequest,
    generateAllConceptsModel,
    generateAllConceptsRequest,
    generateAllExercisesRequest,
    generateOnlyMissingConcepts,
    generateOnlyMissingExercises,
    identifyChaptersRequest,
    isPriceDisabled,
    languageTabRequest,
    subjectTabRequest,
    onAbortFastForward,
    onAutoRunComplete,
    onBookChange,
    onFastForward,
    onPrice,
    onProcessingComplete,
    pendingProcessingAction,
    processingToolbar,
    processingToolbarAfterFixImages,
    recognizeAllRequest,
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
    isGeneratingAllExercises,
    setIsGeneratingAllExercises,
    openRouterSpent,
    setOpenRouterSpent,
    hasRecognitionBeenAttempted,
    setHasRecognitionBeenAttempted,
    revealedPanes,
    setRevealedPanes,
    generatedExercisesPageCount,
    setGeneratedExercisesPageCount,
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
    readerProcessingAbortControllerRef,
    skillsAutoRunAbortRef,
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
    onAutoRunAbortReady,
    abortProcessing,
  } as const;
}

export type { Props } from './BookReaderUtils.js';
export type BookReaderController = ReturnType<typeof useBookReaderController>;
