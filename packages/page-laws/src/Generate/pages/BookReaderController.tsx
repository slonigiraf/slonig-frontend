// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, BookProcessingStageKey, BookStageSpendKey, Exercise } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { addBookStageSpend, applyBookChapterRefinements, assignBookConceptsToChapters, assignBookPageChapter, completeBookProcessingStage, createBookConcept, deleteAbilities, deleteBookChapters, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, incrementBookFixConceptsAttempts, isBookProcessingStageComplete, mergeBookChapterWithPrevious, putBookPage, reorderBookConcepts, replaceAbilities, replaceBookChapterAssignments, replaceExercisesForBookPage, SettingKey, splitBookChapterAtPage, storeSetting, updateBookChapterTitle, updateBookConcept, updateBookFieldsAndStages, withBookProcessingStagesResetFrom, withCompletedBookProcessingStage } from '@slonigiraf/db';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { estimateAiInput } from '../book/processing/aiEstimate.js';
import { addBookExternalCall, type BookExternalCallProvider } from '../book/runtime/bookExternalCalls.js';
import { getBookAgeSamplePageNumbers, MAX_BOOK_LEARNER_AGE, MIN_BOOK_LEARNER_AGE, normalizeBookAge, parseDetectedBookAge } from '../book/processing/metadata/bookAge.js';
import { bookLanguageLabel, getMiddleBookPageNumbers, normalizeLanguageCode, parseDetectedBookLanguage } from '../book/processing/metadata/bookLanguage.js';
import { automaticBookSubjectForLanguage, normalizeBookSubject, parseDetectedBookSubject } from '../book/processing/metadata/bookSubject.js';
import { areAllBookPagesConceptsProcessed, countUnprocessedBookPages, processExtractedChapterContent } from '../book/processing/bookProcessing.js';
import { mapConcurrent } from '../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY, openRouterRequestGate } from '../../openrouter/concurrency.js';
import { chapterLevelMissingConcept, fixSingleConceptPrompt, parseFixedConcept } from '../book/processing/concepts/fixConcepts.js';
import { clearFixConceptsChapterStatuses, fixConceptsChapterKey, loadFixConceptsChapterStatuses, storeFixConceptsChapterStatuses, type FixConceptsChapterStatuses } from '../book/runtime/fixConceptsProgress.js';
import { assertDisjointSortChapterConcepts, conceptsForSortChapter } from '../book/processing/concepts/sortConcepts.js';
import { conceptBelongsToChapter, conceptsForRefinementChapter, hasPersistedRefinedConceptMembership, REFINE_CHAPTERS_SPEND_STAGE, refinedChapterSplitPages, withRefineChaptersComplete } from '../book/processing/chapters/refineChapters.js';
import { reportOpenRouterCost } from '../../openrouter/cost.js';
import { useBookStageTimer } from '../book/runtime/bookStageTime.js';
import { useBookProcessingRunner } from '../book/runtime/useBookProcessingRunner.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_MODEL, MATHPIX_PDF_PAGE_PRICE_USD } from '../book/processing/config.js';
import { FIX_EXERCISES_REQUEST_PROMPT, REPAIR_SYSTEM_PROMPT } from '../book/prompts/abilities.js';
import { BOOK_AGE_DETECTION_PROMPT, BOOK_LANGUAGE_DETECTION_PROMPT, BOOK_SUBJECT_DETECTION_PROMPT } from '../book/prompts/metadata.js';
import { stripMarkdownImageReferences } from '../book/processing/source/bookImageRefs.js';
import { chapterAssignmentsFromBoundaries, chapterEvidenceWindows, chapterReconciliationPrompt, chapterWindowPrompt, deriveStructuralChapterCandidates, pageChapterEvidence, stabilizeChapterBoundaries } from '../book/processing/chapters/chapterSegmentation.js';
import { getSharedChapterSelection, resolveSharedChapterIndex, storeSharedChapterSelection, subscribeSharedChapterSelection, type SharedChapterSelection } from '../book/runtime/chapterSelection.js';
import { conceptChapterMoveInsertionIndex } from '../book/processing/concepts/conceptChapterMove.js';
import { conceptChaptersFromPages, type ConceptChapterNavigationItem } from '../book/processing/concepts/conceptRecognition.js';
import { conceptDeduplicationInput, deduplicateConceptCandidates, type DeduplicateConceptInput } from '../book/processing/concepts/deduplicateConcepts.js';
import { missingGeneratedExerciseConceptIndexes, parseExerciseRepairResult } from '../book/processing/exercises/exercises.js';
import { loadStandardsCatalogsForBookSubject, loadStoredBookStandards, standardsChapterKey, standardsConceptFingerprint, standardsConceptInputs, standardsPathForBookSubject, storeBookStandards, type StandardsCatalog, type StoredBookStandards } from '../book/processing/standards/standards.js';
import { cachedConceptEmbeddingMap, ensureConceptEmbeddingCache, ensureStandardEmbeddingCache } from '../book/processing/standards/standardsEmbeddings.js';
import { type AutoRunProgress } from './Skills.js';
import { mathpixPdfSlices, recognizePdfWithMathpix } from '../book/processing/source/mathpixPdf.js';
import { extractPdfOutlineChapterBoundaries, loadPdfJs } from '../book/processing/source/pdf.js';
import { type ProcessingStatus } from '../components/ProcessingPopup.js';
import { useTranslation } from '../../common/translate.js';
import { abortError, conceptGenerationErrorMessage, createOpenRouterClient, createPdfPageSliceFactory, generateChapterContentWithEmptyConceptRetry, getChapterConceptInputs, getChapterStandardsConceptRows, mathpixHeadingsForRecognitionPage, requestChapterBoundaries, requestChapterStandards, requestDeduplicateConceptPairs, requestMissingChapterConcepts, requestRefinedChapterGroups, requestSortedChapterConceptIndexes, runConceptRequestWithRetry, storeGeneratedChapterConcepts } from './BookReaderProcessing.js';
import { analysisPageNumbers, conceptEmbeddingDistanceMatrix, conceptInsertionDisplayOrder, conceptReferenceKey, conceptsForExerciseChapter, conceptsForNavigationChapter, deleteConceptAndDependencies, exerciseAbilityModuleId, exerciseChapterNavigationKey, exerciseChapterSessionKey, exerciseForPageReplacement, exercisesForExerciseChapter, getBookConceptInventory, getSessionExerciseChapter, getSessionPage, getSessionReaderMaximized, getSessionReaderPane, getSessionRecognitionAttempted, matchingLiveConcept, readerMaximizedSessionKey, readerPaneSessionKey, singleExerciseRepairInput, sortConceptsForDisplay, storeSessionPage, storeSessionRecognitionAttempted } from './BookReaderUtils.js';
import type { ConceptEmbeddingHeatmapEntry, DeduplicateConceptsReview, DeduplicateConceptsReviewPair, ExerciseChapterNavigationItem, ExerciseEditableFields, FixConceptsReview, FixConceptsReviewChapter, Props, ReaderEntityCounts, ReaderPane, RecognitionTarget } from './BookReaderUtils.js';

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
  const [isAddingConcept, setIsAddingConcept] = useState(false);
  const [isReorderingConcepts, setIsReorderingConcepts] = useState(false);
  const [isSavingNewConcept, setIsSavingNewConcept] = useState(false);
  const [newConceptAfterIndex, setNewConceptAfterIndex] = useState(-1);
  const [newConceptDescription, setNewConceptDescription] = useState('');
  const [newConceptPage, setNewConceptPage] = useState('');
  const [newConceptTitle, setNewConceptTitle] = useState('');
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
  const [isDetectingBookLanguage, setIsDetectingBookLanguage] = useState(false);
  const [isLanguageDetectionConfirmationOpen, setIsLanguageDetectionConfirmationOpen] = useState(false);
  const [confirmedProcessingStage, setConfirmedProcessingStage] = useState<BookStageSpendKey>();
  const [isDetectingBookSubject, setIsDetectingBookSubject] = useState(false);
  const [isDetectingBookAge, setIsDetectingBookAge] = useState(false);
  const [isSubjectDetectionConfirmationOpen, setIsSubjectDetectionConfirmationOpen] = useState(false);
  const [isAgeDetectionConfirmationOpen, setIsAgeDetectionConfirmationOpen] = useState(false);
  const [isGeneratingAllConcepts, setIsGeneratingAllConcepts] = useState(false);
  const [isGeneratingChapterConcepts, setIsGeneratingChapterConcepts] = useState(false);
  const [isMaximized, setIsMaximized] = useState(() => getSessionReaderMaximized(book.id));
  const [isMathpixKeyPromptOpen, setIsMathpixKeyPromptOpen] = useState(false);
  const [isPageGenerationConfirmationOpen, setIsPageGenerationConfirmationOpen] = useState(false);
  const [isGeneratingAllExercises, setIsGeneratingAllExercises] = useState(false);
  const [isRecognizingAll, setIsRecognizingAll] = useState(false);
  const [mathpixApiKey, setMathpixApiKey] = useState('');
  const [openRouterSpent, setOpenRouterSpent] = useState(0);
  const [recognizedPageCount, setRecognizedPageCount] = useState(0);
  const [hasRecognitionBeenAttempted, setHasRecognitionBeenAttempted] = useState(() => getSessionRecognitionAttempted(book.id));
  const [revealedPanes, setRevealedPanes] = useState<Set<ReaderPane>>(new Set());
  const [generatedExercisesPageCount, setGeneratedExercisesPageCount] = useState(0);
  const [recognitionTarget, setRecognitionTarget] = useState<RecognitionTarget>('page');
  const [processingPage, setProcessingPage] = useState<number>();
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [renderedPageHeight, setRenderedPageHeight] = useState<number>();
  const [selectedModel, setSelectedModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [selectedLanguageModel, setSelectedLanguageModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [selectedSubjectModel, setSelectedSubjectModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [selectedAgeModel, setSelectedAgeModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [autoRunProgress, setAutoRunProgress] = useState<AutoRunProgress>();
  const [autoRunProcessing, setAutoRunProcessing] = useState<ProcessingStatus>();
  const [lastReaderProcessing, setLastReaderProcessing] = useState<ProcessingStatus>();
  const readerProcessingAbortControllerRef = useRef<AbortController | null>(null);
  const skillsAutoRunAbortRef = useRef<(() => void) | null>(null);
  const [selectedPipelineKey, setSelectedPipelineKey] = useState('');
  const [ageInput, setAgeInput] = useState(book.age === undefined ? '' : String(book.age));
  const [skillsRefreshToken, setSkillsRefreshToken] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDetectingBookLanguageRef = useRef(false);
  const isDetectingBookSubjectRef = useRef(false);
  const isDetectingBookAgeRef = useRef(false);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const conceptsOutputRef = useRef<HTMLDivElement>(null);
  const exerciseConceptsOutputRef = useRef<HTMLDivElement>(null);
  const standardsChapterOutputRef = useRef<HTMLDivElement>(null);
  const pendingConceptChapterFocusRef = useRef(false);
  const pendingExerciseChapterFocusRef = useRef(false);
  const pendingStandardsChapterFocusRef = useRef(false);
  const draggedConceptIndexRef = useRef<number | undefined>(undefined);
  const conceptDropTargetIndexRef = useRef<number | undefined>(undefined);
  const conceptDragPointerIdRef = useRef<number | undefined>(undefined);
  const conceptDragPointerYRef = useRef<number | undefined>(undefined);
  const conceptAutoScrollFrameRef = useRef<number | undefined>(undefined);
  const reorderedConceptFocusIdRef = useRef<BookConcept['id']>(undefined);

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
    setAgeInput(book.age === undefined ? '' : String(book.age));
  }, [book.age]);

  useEffect((): void => {
    if (pendingProcessingAction !== 'recognize') {
      return;
    }

    setHasRecognitionBeenAttempted(true);
    storeSessionRecognitionAttempted(book.id);
  }, [book.id, pendingProcessingAction]);

  const addStageCost = useCallback((stage: BookStageSpendKey, costUsd: number): void => {
    setOpenRouterSpent((current) => current + costUsd);
    void addBookStageSpend(book.id, stage, costUsd).catch(console.error);
  }, [book.id]);
  const addOpenRouterStageCost = useCallback((stage: BookStageSpendKey, costUsd: number): void => {
    addBookExternalCall(book.id, stage, 'openrouter');
    addStageCost(stage, costUsd);
  }, [addStageCost, book.id]);
  const addRecognizeExternalCall = useCallback((provider: Exclude<BookExternalCallProvider, 'openrouter'>): void => {
    addBookExternalCall(book.id, 'recognize', provider);
  }, [book.id]);
  const addRecognizeCost = useCallback((costUsd: number): void => addStageCost('recognize', costUsd), [addStageCost]);
  const addLanguageCost = useCallback((costUsd: number): void => addOpenRouterStageCost('language', costUsd), [addOpenRouterStageCost]);
  const addSubjectCost = useCallback((costUsd: number): void => addOpenRouterStageCost('subject', costUsd), [addOpenRouterStageCost]);
  const addAgeCost = useCallback((costUsd: number): void => addOpenRouterStageCost('age', costUsd), [addOpenRouterStageCost]);
  const addChaptersCost = useCallback((costUsd: number): void => addOpenRouterStageCost('chapters', costUsd), [addOpenRouterStageCost]);
  const addConceptsCost = useCallback((costUsd: number): void => addOpenRouterStageCost('concepts', costUsd), [addOpenRouterStageCost]);
  const addFixConceptsCost = useCallback((costUsd: number): void => addOpenRouterStageCost('fixConcepts', costUsd), [addOpenRouterStageCost]);
  const addEmbeddingsCost = useCallback((costUsd: number): void => addOpenRouterStageCost('embeddings', costUsd), [addOpenRouterStageCost]);
  const addDeduplicateConceptsCost = useCallback((costUsd: number): void => addOpenRouterStageCost('deduplicateConcepts', costUsd), [addOpenRouterStageCost]);
  const addSortConceptsCost = useCallback((costUsd: number): void => addOpenRouterStageCost('sortConcepts', costUsd), [addOpenRouterStageCost]);
  const addRefineChaptersCost = useCallback((costUsd: number): void => addOpenRouterStageCost(REFINE_CHAPTERS_SPEND_STAGE, costUsd), [addOpenRouterStageCost]);
  const addExercisesCost = useCallback((costUsd: number): void => addOpenRouterStageCost('exercises', costUsd), [addOpenRouterStageCost]);
  const addStandardsCost = useCallback((costUsd: number): void => addOpenRouterStageCost('standards', costUsd), [addOpenRouterStageCost]);
  const conceptChapters = useMemo<ConceptChapterNavigationItem[]>(() => conceptChaptersFromPages(Array.from(pages.values())), [pages]);
  const loadDeduplicateConceptInventory = useCallback(async (): Promise<{ conceptsById: Map<number, BookConcept>; inputs: DeduplicateConceptInput[] }> => {
    const chapterById = new Map(conceptChapters.flatMap((chapter) => chapter.chapterId === undefined ? [] : [[chapter.chapterId, chapter] as const]));
    const chapterByPage = new Map(conceptChapters.flatMap((chapter) => chapter.pageNumbers.map((chapterPageNumber) => [chapterPageNumber, chapter] as const)));
    const pageNumbers = Array.from(new Set(Array.from(pages.keys())));
    const rows = [
      ...(await Promise.all(pageNumbers.map((chapterPageNumber) => getBookConceptsForBookPage(book.id, chapterPageNumber)))).flat(),
      ...await getBookConceptsForBookPage(book.id, 0)
    ];
    const conceptsById = new Map<number, BookConcept>();
    const inputsById = new Map<number, DeduplicateConceptInput>();

    rows.forEach((concept) => {
      const chapter = concept.chapterId === undefined ? chapterByPage.get(concept.bookPage[1]) : chapterById.get(concept.chapterId);
      const input = chapter ? conceptDeduplicationInput(concept, chapter) : undefined;

      if (input && concept.id !== undefined) {
        conceptsById.set(concept.id, concept);
        inputsById.set(input.conceptId, input);
      }
    });

    return {
      conceptsById,
      inputs: Array.from(inputsById.values()).sort((a, b) => a.chapterId - b.chapterId || a.conceptId - b.conceptId)
    };
  }, [book.id, conceptChapters, pages]);
  useEffect(() => {
    if (!isBookProcessingStageComplete(book, 'concepts')) {
      setFixConceptsChapterStatuses(clearFixConceptsChapterStatuses(book.id));
      return;
    }

    // Existing books may already have a completed Fix concepts stage from
    // before per-chapter progress was recorded. Treat that persisted stage as
    // authoritative and backfill chapter checkmarks.
    if (isBookProcessingStageComplete(book, 'fixConcepts') && conceptChapters.length) {
      const completedStatuses = Object.fromEntries(conceptChapters.map((chapter) => [fixConceptsChapterKey(chapter), 'fixed' as const]));

      storeFixConceptsChapterStatuses(book.id, completedStatuses);
      setFixConceptsChapterStatuses(completedStatuses);
    }
  }, [book, conceptChapters]);
  const loadConceptCountsByChapter = useCallback(async (targetChapters: ConceptChapterNavigationItem[]): Promise<Map<string, number>> => {
    const inventory = await getBookConceptInventory(book.id, pages.keys());

    return new Map(targetChapters.map((chapter) => [
      standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers),
      inventory.filter((concept) => conceptBelongsToChapter(concept, chapter)).length
    ] as const));
  }, [book.id, pages]);
  const refreshConceptCounts = useCallback(async (): Promise<void> => {
    setConceptCountsByChapter(await loadConceptCountsByChapter(conceptChapters));
  }, [conceptChapters, loadConceptCountsByChapter]);
  // Keep the selected concept chapter independent from PDF page navigation. A
  // concept may point at a page outside the refined chapter's page boundary,
  // and visiting that page must not silently select another chapter.
  const currentConceptChapter = conceptChapters[conceptChapterIndex];
  useEffect((): void => {
    if (!conceptChapters.length) {
      setConceptChapterIndex(0);

      return;
    }

    setConceptChapterIndex((current) => Math.min(current, conceptChapters.length - 1));
  }, [conceptChapters.length]);
  useEffect(() => {
    refreshConceptCounts().catch(() => setConceptCountsByChapter(new Map()));
  }, [refreshConceptCounts]);
  useEffect(() => {
    setIsAddingConcept(false);
    setNewConceptAfterIndex(-1);
    setNewConceptDescription('');
    setNewConceptPage('');
    setNewConceptTitle('');
  }, [currentConceptChapter?.chapterId, currentConceptChapter?.title]);
  const currentStandardsChapter = conceptChapters[standardsChapterIndex];
  const currentStandardsChapterKey = currentStandardsChapter ? standardsChapterKey(currentStandardsChapter.chapterId, currentStandardsChapter.title, currentStandardsChapter.pageNumbers) : undefined;
  const standardDescriptions = useMemo(() => {
    const descriptions = new Map<string, string>();

    standardsCatalogs.forEach(({ framework, standards }) => {
      standards.forEach(({ code, description }) => descriptions.set(`${framework}:${code}`, description));
    });

    return descriptions;
  }, [standardsCatalogs]);
  const embeddingBookEntries = useMemo<ConceptEmbeddingHeatmapEntry[]>(() => {
    const seen = new Set<number>();
    const orderedConcepts: BookConcept[] = [];

    conceptChapters.forEach((chapter) => {
      conceptsForNavigationChapter(embeddingConceptInventory, chapter).forEach((concept) => {
        if (concept.id !== undefined && !seen.has(concept.id)) {
          seen.add(concept.id);
          orderedConcepts.push(concept);
        }
      });
    });
    embeddingConceptInventory.forEach((concept) => {
      if (concept.id !== undefined && !seen.has(concept.id)) {
        seen.add(concept.id);
        orderedConcepts.push(concept);
      }
    });

    return orderedConcepts.flatMap((concept) => {
      const embedding = concept.id === undefined ? undefined : embeddingByConceptId.get(concept.id);
      const norm = embedding ? Math.sqrt(embedding.reduce((sum, value) => sum + value * value, 0)) : 0;

      return embedding?.length && norm > 0 ? [{ concept, embedding, norm }] : [];
    });
  }, [conceptChapters, embeddingByConceptId, embeddingConceptInventory]);
  const embeddingChapterEntries = useMemo<ConceptEmbeddingHeatmapEntry[]>(() => currentStandardsChapter
    ? embeddingBookEntries.filter(({ concept }) => conceptBelongsToChapter(concept, currentStandardsChapter))
    : [], [currentStandardsChapter, embeddingBookEntries]);
  const embeddingMissingCount = useMemo(() => {
    const persistentIds = new Set(embeddingConceptInventory.flatMap(({ id }) => id === undefined ? [] : [id]));

    return Math.max(0, persistentIds.size - embeddingByConceptId.size);
  }, [embeddingByConceptId, embeddingConceptInventory]);
  const embeddingHeatmapEntries = embeddingHeatmapMode === 'chapter' ? embeddingChapterEntries : embeddingBookEntries;
  const embeddingHeatmapDistances = useMemo(() => conceptEmbeddingDistanceMatrix(embeddingHeatmapEntries), [embeddingHeatmapEntries]);
  const chapterGenerationEstimate = useMemo(() => {
    const chapterText = currentConceptChapter?.pageNumbers.map((chapterPageNumber) => `--- page ${chapterPageNumber} ---\n${pages.get(chapterPageNumber)?.pageMMD ?? ''}`).join('\n\n') ?? '';
    const estimatedRequest = chapterText.padEnd(chapterText.length + 2_000);

    // Empty concept responses can be retried once with the same whole-chapter
    // input, so show the conservative two-request estimate.
    return estimateAiInput(selectedModel, [estimatedRequest, estimatedRequest], 4_800);
  }, [currentConceptChapter, pages, selectedModel]);
  const languageDetectionEstimate = useMemo(() => {
    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = pages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      return 'Recognition text is incomplete; language detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedLanguageModel, [BOOK_LANGUAGE_DETECTION_PROMPT(pageTexts)], 32);
  }, [pages, selectedLanguageModel, totalPages]);
  const subjectDetectionEstimate = useMemo(() => {
    if (automaticBookSubjectForLanguage(book.language)) {
      return 'Non-English books are classified as na automatically. No OpenRouter request or model cost is needed.';
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = pages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      return 'Recognition text is incomplete; subject detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedSubjectModel, [BOOK_SUBJECT_DETECTION_PROMPT(book.language ?? 'unknown', pageTexts)], 64);
  }, [book.language, pages, selectedSubjectModel, totalPages]);
  const ageSamplePageNumbers = useMemo(() => getBookAgeSamplePageNumbers(totalPages, Array.from(pages.values()).flatMap(({ pageMMD, pageNumber }) => pageMMD?.trim() ? [pageNumber] : [])), [pages, totalPages]);
  const ageSamplePageTexts = useMemo(() => ageSamplePageNumbers.flatMap((samplePageNumber) => {
    const text = pages.get(samplePageNumber)?.pageMMD?.trim();

    return text ? [{ pageNumber: samplePageNumber, text }] : [];
  }), [ageSamplePageNumbers, pages]);
  const ageDetectionEstimate = useMemo(() => {
    if (!ageSamplePageNumbers.length || ageSamplePageNumbers.length !== Math.min(3, totalPages) || ageSamplePageTexts.length !== ageSamplePageNumbers.length) {
      return 'Representative recognition text is incomplete; age detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedAgeModel, [BOOK_AGE_DETECTION_PROMPT(book.language ?? 'unknown', book.subject ?? 'unknown', ageSamplePageTexts)], 32);
  }, [ageSamplePageNumbers, ageSamplePageTexts, book.language, book.subject, selectedAgeModel, totalPages]);
  const exerciseChapters = useMemo<ExerciseChapterNavigationItem[]>(() => conceptChapters.flatMap(({ chapterId, pageNumbers, title }) =>
    pageNumbers.some((chapterPageNumber) => pages.get(chapterPageNumber)?.conceptsProcessed)
      ? [{ id: chapterId, pageNumbers, title }]
      : []
  ), [conceptChapters, pages]);
  const currentExerciseChapter = exerciseChapters[exerciseChapterIndex];

  const refreshEntityCounts = useCallback(async (): Promise<void> => {
    const storedPages = await getBookPages(book.id);
    const pageRows = await Promise.all(storedPages.map(async ({ pageNumber }) => {
      const [pageConcepts, pageExercises] = await Promise.all([
        getBookConceptsForBookPage(book.id, pageNumber),
        getExercisesForBookPage([book.id, pageNumber])
      ]);

      return { concepts: pageConcepts, exercises: pageExercises };
    }));
    const allExercises = pageRows.flatMap(({ exercises }) => exercises);
    const abilities = (await Promise.all(allExercises.flatMap(({ id }) => id === undefined ? [] : [getAbilities(exerciseAbilityModuleId(book.id, id))]))).flat();

    setEntityCounts({
      abilities: abilities.length,
      bookExercises: allExercises.filter(({ source }) => source !== 'generated').length,
      concepts: pageRows.reduce((count, { concepts }) => count + concepts.length, 0),
      exercises: allExercises.length
    });
  }, [book.id]);

  const onSkillsEntityCountsChange = useCallback(({ abilities, bookExercises, exercises }: Pick<ReaderEntityCounts, 'abilities' | 'bookExercises' | 'exercises'>): void => {
    setEntityCounts((current) => ({ ...current, abilities, bookExercises, exercises }));
  }, []);
  const onSkillsContentChange = useCallback((): void => {
    setSkillsRefreshToken((value) => value + 1);
    refreshConceptCounts().catch(() => undefined);
  }, [refreshConceptCounts]);
  const changeExerciseChapter = useCallback((index: number): void => {
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, exerciseChapters.length - 1)));
    const chapter = exerciseChapters[nextIndex];
    const conceptChapterIndex = chapter
      ? conceptChapters.findIndex(({ chapterId, title }) => chapter.id !== undefined ? chapterId === chapter.id : title.trim() === chapter.title.trim())
      : -1;
    const conceptChapter = conceptChapterIndex >= 0 ? conceptChapters[conceptChapterIndex] : undefined;

    pendingExerciseChapterFocusRef.current = true;
    setExerciseChapterIndex(nextIndex);

    try {
      sessionStorage.setItem(exerciseChapterSessionKey(book.id), String(nextIndex));
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }

    storeSharedChapterSelection(book.id, {
      chapterId: conceptChapter?.chapterId,
      index: conceptChapterIndex >= 0 ? conceptChapterIndex : nextIndex,
      title: chapter?.title
    });
  }, [book.id, conceptChapters, exerciseChapters]);
  const changeStandardsChapter = useCallback((index: number): void => {
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, conceptChapters.length - 1)));
    const chapter = conceptChapters[nextIndex];

    pendingStandardsChapterFocusRef.current = true;
    setStandardsChapterIndex(nextIndex);
    storeSharedChapterSelection(book.id, { chapterId: chapter?.chapterId, index: nextIndex, title: chapter?.title });
  }, [book.id, conceptChapters]);

  useEffect(() => {
    refreshEntityCounts().catch(() => undefined);
  }, [book.completedStages, refreshEntityCounts]);

  useEffect((): void => {
    if (!exerciseChapters.length) {
      setExerciseChapterIndex(0);

      return;
    }

    if (exerciseChapterIndex >= exerciseChapters.length) {
      const nextIndex = exerciseChapters.length - 1;

      setExerciseChapterIndex(nextIndex);

      try {
        sessionStorage.setItem(exerciseChapterSessionKey(book.id), String(nextIndex));
      } catch {
        // Session storage may be unavailable in privacy-restricted contexts.
      }
    }
  }, [book.id, exerciseChapterIndex, exerciseChapters.length]);

  useEffect((): void => {
    if (!conceptChapters.length) {
      setStandardsChapterIndex(0);

      return;
    }

    if (standardsChapterIndex >= conceptChapters.length) {
      setStandardsChapterIndex(conceptChapters.length - 1);
    }
  }, [conceptChapters.length, standardsChapterIndex]);

  useEffect(() => {
    const applySelection = (selection: SharedChapterSelection): void => {
      if (conceptChapters.length) {
        const nextConceptChapterIndex = resolveSharedChapterIndex(selection, conceptChapters.map(({ chapterId, title }) => ({ id: chapterId, title })));

        setConceptChapterIndex(nextConceptChapterIndex);
        setStandardsChapterIndex(nextConceptChapterIndex);
      }

      if (exerciseChapters.length) {
        const nextExerciseIndex = resolveSharedChapterIndex(selection, exerciseChapters);

        setExerciseChapterIndex(nextExerciseIndex);

        try {
          sessionStorage.setItem(exerciseChapterSessionKey(book.id), String(nextExerciseIndex));
        } catch {
          // Session storage may be unavailable in privacy-restricted contexts.
        }
      }
    };
    const storedSelection = getSharedChapterSelection(book.id);

    if (storedSelection) {
      applySelection(storedSelection);
    }

    return subscribeSharedChapterSelection(book.id, applySelection);
  }, [book.id, conceptChapters, exerciseChapters]);

  useEffect((): void => {
    setStandardsByChapter(loadStoredBookStandards(book.id));
    setStandardsChapterIndex(0);
  }, [book.id]);

  useEffect(() => {
    let cancelled = false;

    setStandardsCatalogs([]);
    loadStandardsCatalogsForBookSubject(book.subject)
      .then((catalogs) => {
        if (!cancelled) {
          setStandardsCatalogs(catalogs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStandardsCatalogs([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [book.subject]);

  useEffect(() => {
    let cancelled = false;

    if (activePane !== 'embeddings') {
      return () => {
        cancelled = true;
      };
    }

    setIsEmbeddingHeatmapLoading(true);
    getBookConceptInventory(book.id, pages.keys())
      .then(async (inventory) => {
        const byId = await cachedConceptEmbeddingMap(embeddingModel, inventory);

        if (!cancelled) {
          setEmbeddingConceptInventory(inventory);
          setEmbeddingByConceptId(byId);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setEmbeddingConceptInventory([]);
          setEmbeddingByConceptId(new Map());
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsEmbeddingHeatmapLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [activePane, book.id, conceptEmbeddingsRefreshToken, embeddingModel, pages]);

  useEffect(() => {
    if (activePane === 'embeddings' && !isBookProcessingStageComplete(book, 'embeddings')) {
      setActivePane(isBookProcessingStageComplete(book, 'concepts') ? 'textConcepts' : 'text');
    }
  }, [activePane, book]);

  useEffect(() => {
    if (activePane === 'standards' && !isBookProcessingStageComplete(book, 'fixImages')) {
      setActivePane(isBookProcessingStageComplete(book, 'fixExercises')
        ? 'preExercisesExercises'
        : isBookProcessingStageComplete(book, 'concepts') ? 'textConcepts' : 'text');
    }
  }, [activePane, book]);

  useEffect(() => {
    try {
      sessionStorage.setItem(readerPaneSessionKey(book.id), activePane);
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }
  }, [activePane, book.id]);

  useEffect(() => {
    try {
      sessionStorage.setItem(readerMaximizedSessionKey(book.id), String(isMaximized));
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }
  }, [book.id, isMaximized]);

  useEffect(() => {
    const recognitionIsComplete = totalPages > 0 && Array.from(
      { length: totalPages },
      (_, index) => pages.get(index + 1)?.pageMMD !== undefined
    ).every(Boolean);

    // Keep the combined PDF/Text pane available from the initial stage so
    // recognition can be watched with the source PDF on the left and OCR text
    // on the right.
    if (!isBookProcessingStageComplete(book, 'recognize') && !recognitionIsComplete && activePane !== 'text') {
      setActivePane('text');
    }
  }, [activePane, book, pages, totalPages]);

  const revealPane = useCallback((pane: ReaderPane): void => {
    setRevealedPanes((current) => {
      if (current.has(pane)) {
        return current;
      }

      const next = new Set(current);

      next.add(pane);
      return next;
    });
    setActivePane(pane);
  }, []);

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
  const completeStageRef = useRef(completeStage);

  completeStageRef.current = completeStage;

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;

    setError('');
    setPdf(undefined);
    setRenderedPageHeight(undefined);
    setTotalPages(0);

    const load = async (): Promise<void> => {
      const data = new Uint8Array(await file.arrayBuffer());

      if (!active) {
        return;
      }

      const { getDocument } = await loadPdfJs();

      if (!active) {
        return;
      }

      loadingTask = getDocument({ data });

      const [document, storedPages, storedChapters] = await Promise.all([
        loadingTask.promise,
        getBookPages(book.id),
        getBookChapters(book.id)
      ]);

      if (!active) {
        void document.destroy();

        return;
      }

      setPdf(document);
      setTotalPages(document.numPages);
      setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
      setChapters(storedChapters);
      const hasEveryPage = storedPages.length === document.numPages;

      if (areAllBookPagesConceptsProcessed(document.numPages, storedPages, analysisPageNumbers(storedPages))) {
        await completeStageRef.current('concepts');
      } else if (hasEveryPage && storedPages.every(({ chapterId, chapter, excludedFromAnalysis }) => excludedFromAnalysis || chapterId !== undefined || Boolean(chapter.trim()))) {
        await completeStageRef.current('chapters');
      } else if (hasEveryPage && storedPages.every(({ pageMMD }) => pageMMD !== undefined)) {
        await completeStageRef.current('recognize');
      }

      const restoredPage = Math.min(document.numPages, getSessionPage(book.id));

      setPageNumber(restoredPage);
      setPageInput(String(restoredPage));
    };

    load().catch(() => active && setError('Unable to open this PDF.'));

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [book.id, file]);

  useLayoutEffect(() => {
    if (!pendingConceptChapterFocusRef.current || !concepts.length) {
      return;
    }

    const first = conceptsOutputRef.current?.querySelector<HTMLElement>('.conceptItem');

    if (first) {
      pendingConceptChapterFocusRef.current = false;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [concepts]);

  useLayoutEffect(() => {
    if (!pendingExerciseChapterFocusRef.current || isExerciseChapterLoading || !exerciseChapterConcepts.length) {
      return;
    }

    const first = exerciseConceptsOutputRef.current?.querySelector<HTMLElement>('.exerciseConceptCard');

    if (first) {
      pendingExerciseChapterFocusRef.current = false;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [exerciseChapterConcepts, isExerciseChapterLoading]);

  useLayoutEffect(() => {
    if (!pendingStandardsChapterFocusRef.current || (activePane === 'embeddings' && embeddingHeatmapMode !== 'chapter')) {
      return;
    }

    const first = standardsChapterOutputRef.current;

    if (first) {
      pendingStandardsChapterFocusRef.current = false;
      first.focus({ preventScroll: true });
      first.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [activePane, embeddingHeatmapMode, standardsChapterIndex]);

  useEffect(() => {
    let active = true;

    const loadChapterConcepts = async (): Promise<void> => {
      if (!currentConceptChapter) {
        if (active) {
          setConcepts([]);
          setConceptFirstPageByKey(new Map());
        }

        return;
      }

      const inventory = await getBookConceptInventory(book.id, pages.keys());

      if (active) {
        const storedConcepts = conceptsForNavigationChapter(inventory, currentConceptChapter);
        const references = new Map<string, number>();

        storedConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), concept.bookPage[1]));
        setConcepts(storedConcepts);
        setConceptFirstPageByKey(references);
      }
    };

    loadChapterConcepts().catch(() => active && setError('Unable to load chapter concepts.'));

    return () => {
      active = false;
    };
  }, [book.id, currentConceptChapter, pages]);

  useEffect(() => {
    if (!autoRunAll && activePane !== 'conceptExercises') {
      return;
    }

    let active = true;

    const loadChapterLearningContent = async (): Promise<void> => {
      if (!currentExerciseChapter) {
        setExerciseChapterConcepts([]);
        setExerciseChapterExercises([]);
        setIsExerciseChapterLoading(false);

        return;
      }

      setExerciseChapterConcepts([]);
      setExerciseChapterExercises([]);
      setIsExerciseChapterLoading(true);
      const pageRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => {
        const [storedConcepts, storedExercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, chapterPageNumber),
          getExercisesForBookPage([book.id, chapterPageNumber])
        ]);

        return { concepts: storedConcepts, exercises: storedExercises, pageNumber: chapterPageNumber };
      }));
      const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
      const chapterConcepts = conceptsForExerciseChapter([...pageRows.flatMap(({ concepts }) => concepts), ...pageLessConcepts], currentExerciseChapter);

      if (active) {
        setExerciseChapterConcepts(chapterConcepts);
        setExerciseChapterExercises(exercisesForExerciseChapter(pageRows, chapterConcepts, currentExerciseChapter));
      }
    };

    loadChapterLearningContent()
      .catch(() => active && setError('Unable to load this chapter’s exercises.'))
      .finally(() => active && setIsExerciseChapterLoading(false));

    return () => {
      active = false;
    };
  }, [activePane, book.id, currentExerciseChapter, pages, skillsRefreshToken]);

  useEffect(() => {
    if (activePane !== 'conceptExercises') {
      return;
    }

    let active = true;

    setExerciseChapterMissingCounts(new Map());

    const loadMissingCounts = async (): Promise<Map<string, number>> => {
      const pageRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => {
        const [storedConcepts, storedExercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, chapterPageNumber),
          getExercisesForBookPage([book.id, chapterPageNumber])
        ]);

        return { concepts: storedConcepts, exercises: storedExercises, pageNumber: chapterPageNumber };
      }));
      const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
      const inventory = [...pageRows.flatMap(({ concepts }) => concepts), ...pageLessConcepts];

      return new Map(exerciseChapters.map((chapter) => {
        const concepts = conceptsForExerciseChapter(inventory, chapter);
        const exercises = exercisesForExerciseChapter(pageRows, concepts, chapter);

        return [exerciseChapterNavigationKey(chapter), missingGeneratedExerciseConceptIndexes(concepts, exercises).length] as const;
      }));
    };

    loadMissingCounts()
      .then((counts) => active && setExerciseChapterMissingCounts(counts))
      .catch(() => active && setExerciseChapterMissingCounts(new Map()));

    return () => {
      active = false;
    };
  }, [activePane, autoRunAll, book.id, exerciseChapters, pages, skillsRefreshToken]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !pageAreaRef.current) {
      return;
    }

    let renderTask: RenderTask | undefined;
    let active = true;
    const canvas = canvasRef.current;
    const pageArea = pageAreaRef.current;

    const render = async (): Promise<void> => {
      const page = await pdf.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(pageArea.clientWidth, 320);
      const scale = availableWidth / initialViewport.width;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');

      if (!active || !context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;

      if (active) {
        setRenderedPageHeight(canvas.getBoundingClientRect().height);
      }
    };

    render().catch((renderError: Error) => {
      if (renderError.name !== 'RenderingCancelledException') {
        setError('Unable to render this page.');
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [activePane, isMaximized, pageNumber, pdf]);

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

  const refreshChapterAssignments = useCallback(async (): Promise<void> => {
    const [storedPages, storedChapters] = await Promise.all([getBookPages(book.id), getBookChapters(book.id)]);

    setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
    setChapters(storedChapters);
  }, [book.id]);
  const openChapterEditor = useCallback((chapterId?: number): void => {
    if (chapterId === undefined) {
      return;
    }

    const chapter = chapters.find(({ id }) => id === chapterId);

    if (chapter) {
      setEditingChapter(chapter);
    }
  }, [chapters]);
  const closeChapterEditor = useCallback((): void => setEditingChapter(undefined), []);
  const refreshAfterChapterRename = useCallback((): void => {
    refreshChapterAssignments()
      .then(() => setSkillsRefreshToken((value) => value + 1))
      .catch((caught) => setError(caught instanceof Error ? caught.message : 'Unable to refresh chapters.'));
  }, [refreshChapterAssignments]);

  useEffect(() => {
    const availableIds = new Set(chapters.flatMap(({ id }) => id === undefined ? [] : [id]));

    setSelectedChapterIds((current) => new Set(Array.from(current).filter((id) => availableIds.has(id))));
  }, [chapters]);

  const toggleChapterSelection = useCallback((chapterId: number): void => {
    setSelectedChapterIds((current) => {
      const next = new Set(current);

      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }

      return next;
    });
  }, []);

  const synchronizeChapterProcessingStage = useCallback(async (): Promise<void> => {
    const storedPages = await getBookPages(book.id);
    const complete = totalPages > 0 && storedPages.length === totalPages && storedPages.every(({ chapterId, chapter, excludedFromAnalysis }) => excludedFromAnalysis || chapterId !== undefined || Boolean(chapter.trim()));
    let updated: Book | undefined;

    if (complete) {
      // Manual chapter edits change the input partition for every downstream
      // artifact. Keep Chapters complete, but invalidate Concepts and all later
      // stages even when every page still has a syntactically valid chapter.
      updated = await updateBookFieldsAndStages(book.id, {}, {
        complete: ['chapters'],
        resetFrom: 'concepts'
      });
    } else {
      updated = await updateBookFieldsAndStages(book.id, {}, { resetFrom: 'chapters' });
    }

    const fallback = complete
      ? withBookProcessingStagesResetFrom(withCompletedBookProcessingStage(book, 'chapters'), 'concepts')
      : withBookProcessingStagesResetFrom(book, 'chapters');

    onBookChange(updated ?? fallback);
  }, [book, onBookChange, totalPages]);

  const deleteSelectedChapters = useCallback(async (): Promise<void> => {
    const chapterIds = Array.from(selectedChapterIds);

    if (!chapterIds.length || isDeletingChapters) {
      return;
    }

    setError('');
    setIsDeletingChapters(true);

    try {
      const selected = new Set(chapterIds);
      const selectedPageNumbers = Array.from(pages.values()).flatMap(({ chapterId, pageNumber }) => chapterId !== undefined && selected.has(chapterId) ? [pageNumber] : []);
      const selectedExercises = (await Promise.all(selectedPageNumbers.map((selectedPageNumber) => getExercisesForBookPage([book.id, selectedPageNumber])))).flat();

      await Promise.all(selectedExercises.flatMap(({ id }) => id === undefined ? [] : [deleteAbilities(exerciseAbilityModuleId(book.id, id))]));
      await deleteBookChapters(book.id, chapterIds);
      setSelectedChapterIds(new Set());
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete the selected chapters.');
    } finally {
      setIsDeletingChapters(false);
    }
  }, [book.id, isDeletingChapters, pages, refreshChapterAssignments, refreshConceptCounts, refreshEntityCounts, selectedChapterIds, synchronizeChapterProcessingStage]);

  const saveCurrentChapterTitle = useCallback(async (): Promise<void> => {
    const title = chapterTitleDraft.trim();

    if (currentChapter?.id === undefined || !title) {
      return;
    }

    setError('');

    try {
      await updateBookChapterTitle(currentChapter.id, title);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rename chapter.');
    }
  }, [chapterTitleDraft, currentChapter?.id, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const assignCurrentPageToChapter = useCallback(async (chapterId: number): Promise<void> => {
    setError('');

    try {
      await assignBookPageChapter(book.id, pageNumber, chapterId);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to assign this page to the chapter.');
    }
  }, [book.id, pageNumber, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const startChapterHere = useCallback(async (): Promise<void> => {
    const title = newChapterTitle.trim();

    if (!title) {
      setError('Enter a chapter title first.');
      return;
    }

    setError('');

    try {
      await splitBookChapterAtPage(book.id, pageNumber, title);
      setNewChapterTitle('');
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start a chapter here.');
    }
  }, [book.id, newChapterTitle, pageNumber, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const mergeCurrentChapterWithPrevious = useCallback(async (): Promise<void> => {
    if (currentChapter?.id === undefined) {
      return;
    }

    setError('');

    try {
      await mergeBookChapterWithPrevious(book.id, currentChapter.id);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to merge this chapter with the previous chapter.');
    }
  }, [book.id, currentChapter?.id, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const identifyChapters = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isGeneratingAllExercises || isIdentifyingChapters) {
      return;
    }

    const recognizedPages = Array.from(pages.values()).sort((a, b) => a.pageNumber - b.pageNumber);

    if (recognizedPages.length !== totalPages || recognizedPages.some(({ pageMMD }) => pageMMD === undefined)) {
      setError('Recognize every page before identifying chapters.');
      onProcessingComplete();
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIdentifiedChapterPageCount(0);
    setChapterIdentificationPhase('bookmarks');
    setIsIdentifyingChapters(true);

    try {
      // The document outline/bookmarks are author-provided PDF metadata, so
      // prefer them over inferred headings and AI reconciliation whenever they
      // contain usable destinations.
      if (!pdf) {
        throw new Error('The PDF is still loading. Try identifying chapters again.');
      }

      const outlineBoundaries = await extractPdfOutlineChapterBoundaries(pdf);

      if (outlineBoundaries.length) {
        const boundaries = chapterAssignmentsFromBoundaries(outlineBoundaries, totalPages);

        setChapterIdentificationPhase('saving');
        await replaceBookChapterAssignments(book.id, boundaries);
        await refreshChapterAssignments();
        await completeStage('chapters');
        revealPane('chapters');
        setIdentifiedChapterPageCount(totalPages);
        return;
      }

      if (!book.language) {
        throw new Error('Set the book language after recognition before identifying chapters without PDF bookmarks.');
      }

      setChapterIdentificationPhase('text');
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const windows = chapterEvidenceWindows(recognizedPages);
      const windowResults = await mapConcurrent(windows, Math.min(3, OPENROUTER_CONCURRENCY), async (window) => {
        const result = await requestChapterBoundaries(client, generateAllConceptsModel, chapterWindowPrompt(window), totalPages, addChaptersCost);
        setIdentifiedChapterPageCount((current) => Math.max(current, window[window.length - 1]?.pageNumber ?? current));

        return result;
      });
      const proposals = windowResults.flat();
      const evidence = recognizedPages.map(pageChapterEvidence);
      const structural = deriveStructuralChapterCandidates(evidence);
      const reconciled = await requestChapterBoundaries(client, generateAllConceptsModel, chapterReconciliationPrompt(proposals, evidence, totalPages, structural), totalPages, addChaptersCost);
      const stable = stabilizeChapterBoundaries(reconciled.length ? reconciled : proposals, structural, totalPages, evidence);
      const boundaries = chapterAssignmentsFromBoundaries(stable, totalPages);

      setChapterIdentificationPhase('saving');
      await replaceBookChapterAssignments(book.id, boundaries);
      await refreshChapterAssignments();
      await completeStage('chapters');
      revealPane('chapters');
      setIdentifiedChapterPageCount(totalPages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to identify chapters.');
    } finally {
      setIsIdentifyingChapters(false);
      onProcessingComplete();
    }
  }, [currentReaderProcessingSignal, addChaptersCost, completeStage, book.id, book.language, generateAllConceptsModel, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, pdf, processingPage, refreshChapterAssignments, revealPane, totalPages]);

  const generateConcepts = useCallback(async (): Promise<void> => {
    const storedPage = pages.get(pageNumber);

    if (!storedPage || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    if (!currentConceptChapter) {
      setError('Assign this page to a chapter before generating concepts.');
      return;
    }

    const chapterPages = currentConceptChapter.pageNumbers.flatMap((chapterPageNumber) => {
      const page = pages.get(chapterPageNumber);

      return page ? [page] : [];
    });

    if (chapterPages.length !== currentConceptChapter.pageNumbers.length) {
      setError('Recognize every page in this chapter before generating concepts.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingChapterConcepts(true);
    setProcessingPage(pageNumber);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const chapterInputs = await getChapterConceptInputs(chapterPages);
      const generatedConcepts = await generateChapterContentWithEmptyConceptRetry(client, selectedModel, currentConceptChapter.title, chapterInputs, chapterInputs.length > 0, addConceptsCost);
      const stored = await storeGeneratedChapterConcepts(book.id, chapterPages, generatedConcepts);
      const updatedPages = new Map(pages);
      const references = new Map<string, number>();
      const storedConcepts: BookConcept[] = [];

      stored.pages.forEach((page) => updatedPages.set(page.pageNumber, page));
      stored.conceptsByPage.forEach((pageConcepts, conceptPageNumber) => pageConcepts.forEach((concept) => {
        storedConcepts.push(concept);
        references.set(conceptReferenceKey(concept), conceptPageNumber);
      }));

      setPages(updatedPages);
      setConcepts(storedConcepts);
      setConceptFirstPageByKey(references);
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);

      if (areAllBookPagesConceptsProcessed(totalPages, Array.from(updatedPages.values()), analysisPageNumbers(Array.from(updatedPages.values())))) {
        await completeStage('concepts');
        revealPane('textConcepts');
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for this chapter.');
    } finally {
      setIsGeneratingChapterConcepts(false);
      setProcessingPage(undefined);
    }
  }, [currentReaderProcessingSignal, addConceptsCost, completeStage, book.id, currentConceptChapter, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, refreshConceptCounts, refreshEntityCounts, revealPane, selectedModel, totalPages]);
  const closePageGenerationConfirmation = useCallback((): void => setIsPageGenerationConfirmationOpen(false), []);
  const confirmPageGeneration = useCallback((): void => {
    setIsPageGenerationConfirmationOpen(false);
    setConfirmedProcessingStage('concepts');
    generateConcepts()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'concepts' ? undefined : current));
  }, [generateConcepts]);

  const generateAllConcepts = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    const orderedPages = Array.from({ length: totalPages }, (_, index) => pages.get(index + 1));

    if (orderedPages.some((page) => !page)) {
      setError('Recognize every page before generating concepts.');
      onProcessingComplete();
      return;
    }

    const bookPages = orderedPages as BookPage[];

    const activePages = bookPages.filter(({ excludedFromAnalysis }) => !excludedFromAnalysis);

    if (activePages.some(({ chapter, chapterId }) => chapterId === undefined && !chapter.trim())) {
      setError('Assign every included page to a chapter before generating concepts. Deleted chapters stay excluded from analysis.');
      onProcessingComplete();
      return;
    }

    const recognitionChapters = conceptChaptersFromPages(bookPages);

    if (!recognitionChapters.length || recognitionChapters.reduce((count, chapter) => count + chapter.pageNumbers.length, 0) !== activePages.length) {
      setError('Every included page must belong to exactly one chapter before generating concepts.');
      onProcessingComplete();
      return;
    }

    // An explicit Concepts action is a regeneration request, not merely a
    // completion check. Re-run every chapter even when its persisted
    // conceptsProcessed flag is already true; otherwise a manual rerun can
    // return immediately without sending any concept request.
    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingAllConcepts(true);
    setGeneratedConceptsChapterCount(0);

    const allChapterTasks = recognitionChapters.map((chapter) => ({
      chapter,
      pages: chapter.pageNumbers.map((chapterPageNumber) => pages.get(chapterPageNumber) as BookPage)
    }));
    let chapterTasks = allChapterTasks;

    if (generateOnlyMissingConcepts) {
      try {
        const conceptCounts = await loadConceptCountsByChapter(recognitionChapters);

        chapterTasks = allChapterTasks.filter(({ chapter }) => (conceptCounts.get(standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers)) ?? 0) === 0);
      } catch {
        setError('Unable to determine which chapters are missing concepts.');
        setIsGeneratingAllConcepts(false);
        onProcessingComplete();

        return;
      }
    }

    if (!chapterTasks.length) {
      await completeStage('concepts');
      revealPane('textConcepts');
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      setError('No OpenRouter token found. Add it in Settings.');
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();

      return;
    }

    const client = createOpenRouterClient(key, currentReaderProcessingSignal());

    try {
      const generationResults = await mapConcurrent(chapterTasks, OPENROUTER_CONCURRENCY, async ({ chapter, pages: chapterPages }) => {
        try {
          const chapterInputs = await getChapterConceptInputs(chapterPages);

          return {
            chapter,
            chapterPages,
            generatedConcepts: await generateChapterContentWithEmptyConceptRetry(client, generateAllConceptsModel, chapter.title, chapterInputs, chapterInputs.length > 0, addConceptsCost),
            status: 'fulfilled' as const
          };
        } catch (reason) {
          return { chapter, chapterPages, reason, status: 'rejected' as const };
        }
      });
      let failedConceptTasks = 0;
      const failedConceptDetails: string[] = [];

      // Persist chapter-by-chapter. A concept is written only to the page where
      // the chapter-wide AI response says it was first introduced.
      for (const result of generationResults) {
        const chapterLabel = result.chapter.title.trim() || `pages ${result.chapter.pageNumbers[0]}-${result.chapter.pageNumbers[result.chapter.pageNumbers.length - 1]}`;

        if (result.status === 'rejected') {
          failedConceptTasks++;
          failedConceptDetails.push(`${chapterLabel}: ${conceptGenerationErrorMessage(result.reason)}`);
          continue;
        }

        try {
          const stored = await storeGeneratedChapterConcepts(book.id, result.chapterPages, result.generatedConcepts);

          setGeneratedConceptsChapterCount((count) => count + 1);

          if (result.chapter.pageNumbers.includes(pageNumber)) {
            const currentConcepts: BookConcept[] = [];
            const references = new Map<string, number>();

            stored.conceptsByPage.forEach((pageConcepts, conceptPageNumber) => pageConcepts.forEach((concept) => {
              currentConcepts.push(concept);
              references.set(conceptReferenceKey(concept), conceptPageNumber);
            }));
            setConcepts(currentConcepts);
            setConceptFirstPageByKey(references);
          }
        } catch (reason) {
          failedConceptTasks++;
          failedConceptDetails.push(`${chapterLabel}: saving generated concepts failed (${conceptGenerationErrorMessage(reason)})`);
        }
      }

      const storedPagesAfterGeneration = await getBookPages(book.id);
      const analyzedPageNumbers = analysisPageNumbers(storedPagesAfterGeneration);
      const conceptsComplete = areAllBookPagesConceptsProcessed(totalPages, storedPagesAfterGeneration, analyzedPageNumbers);

      setPages(new Map(storedPagesAfterGeneration.map((storedPage) => [storedPage.pageNumber, storedPage])));
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);

      // Keep successful chapter results and let the pipeline continue even if
      // individual chapters failed. Chapters with no stored concepts remain
      // eligible for the "missing concepts only" rerun from the Concepts popup.
      const successfulConceptTasks = chapterTasks.length - failedConceptTasks;

      if (successfulConceptTasks > 0) {
        await completeStage('concepts');
        revealPane('textConcepts');
      }

      if (failedConceptTasks > 0 || !conceptsComplete) {
        const unprocessedPages = countUnprocessedBookPages(totalPages, storedPagesAfterGeneration, analyzedPageNumbers);

        const failureDetails = failedConceptDetails.length ? ` ${failedConceptDetails.join(' | ')}` : '';

        setError(successfulConceptTasks > 0
          ? `Concept generation completed with ${failedConceptTasks} of ${chapterTasks.length} attempted chapters failing; ${unprocessedPages} pages remain unprocessed. Successful chapter results were kept. Rerun Concepts to retry, optionally only for chapters missing concepts.${failureDetails}`
          : `Concept generation failed for all ${chapterTasks.length} attempted chapters; ${unprocessedPages} pages remain unprocessed. The Concepts stage remains incomplete. Retry concept generation.${failureDetails}`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
    } finally {
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();
    }
  }, [currentReaderProcessingSignal, addConceptsCost, completeStage, book.id, conceptChapters, generateAllConceptsModel, generateOnlyMissingConcepts, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, loadConceptCountsByChapter, onProcessingComplete, pageNumber, pages, processingPage, refreshConceptCounts, refreshEntityCounts, revealPane, totalPages]);

  const fixAllConcepts = useCallback(async (model = generateAllConceptsModel, onlyFailed = false): Promise<void> => {
    if (!conceptChapters.length || isFixingConcepts || isDeduplicatingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || isGeneratingAllExercises || fixConceptsReview || deduplicateConceptsReview) {
      return;
    }

    const previousStatuses = loadFixConceptsChapterStatuses(book.id);
    const targetChapters = onlyFailed
      ? conceptChapters.filter((chapter) => previousStatuses[fixConceptsChapterKey(chapter)] === 'failed')
      : conceptChapters;

    if (!targetChapters.length) {
      setError(onlyFailed ? 'There are no failed Fix concepts chapters to retry.' : 'No chapters are available for Fix concepts.');
      return;
    }

    if (!book.language || !book.subject || book.age === undefined) {
      setError('Set the book language, subject, and learner age before running Fix concepts.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsFixingConcepts(true);
    setFixedConceptsChapterCount(0);
    setFixConceptsTargetChapterCount(targetChapters.length);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
      const results = await mapConcurrent(targetChapters, OPENROUTER_CONCURRENCY, async (chapter) => {
        try {
          const before = sortConceptsForDisplay([
            ...(await Promise.all(chapter.pageNumbers.map((chapterPageNumber) => getBookConceptsForBookPage(book.id, chapterPageNumber)))).flat(),
            ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.chapterId)
          ]);
          const chapterMmd = chapter.pageNumbers.map((chapterPageNumber) => `--- page ${chapterPageNumber} ---\n${pages.get(chapterPageNumber)?.pageMMD ?? ''}`).join('\n\n');
          const fixes = await requestMissingChapterConcepts(client, model, chapter.title, chapterMmd, before, chapter.pageNumbers, book, addFixConceptsCost);
          const removed = fixes.removeConceptIndexes.flatMap((conceptIndex): BookConcept[] => {
            const concept = before[conceptIndex];

            return concept?.id === undefined ? [] : [concept];
          });

          return { before, chapter, missing: fixes.concepts, removed, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapter, reason, status: 'rejected' as const };
        } finally {
          setFixedConceptsChapterCount((count) => count + 1);
        }
      });
      const successfulChapters = results.flatMap((result): FixConceptsReviewChapter[] => result.status === 'fulfilled'
        ? [{ before: result.before, chapter: result.chapter, missing: result.missing, removed: result.removed }]
        : []);
      const failedChapters = results.flatMap((result): FixConceptsReview['failedChapters'] => result.status === 'rejected'
        ? [{ chapter: result.chapter, reason: conceptGenerationErrorMessage(result.reason) }]
        : []);

      if (!successfulChapters.length) {
        const failureDetails = failedChapters.map(({ chapter, reason }) => `${chapter.title || 'Untitled chapter'}: ${reason}`);

        setError(`Fix concepts could not prepare any changes for review.${failureDetails.length ? ` ${failureDetails.join(' | ')}` : ''}`);
        return;
      }

      setFixConceptsReviewChapterIndex(0);
      setFixConceptsReview({
        baseStatuses: onlyFailed ? previousStatuses : {},
        chapters: successfulChapters,
        failedChapters,
        targetChapterCount: targetChapters.length
      });
      revealPane('textConcepts');
    } finally {
      setIsFixingConcepts(false);
    }
  }, [currentReaderProcessingSignal, addFixConceptsCost, book, conceptChapters, deduplicateConceptsReview, fixConceptsReview, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, pages, revealPane]);

  const discardFixConceptsReview = useCallback((): void => {
    if (isApplyingFixConceptsReview) {
      return;
    }

    setFixConceptsReview(undefined);
    setFixConceptsReviewChapterIndex(0);
  }, [isApplyingFixConceptsReview]);

  const removeFixConceptsReviewConcept = useCallback((chapterIndex: number, missingIndex: number): void => {
    if (isApplyingFixConceptsReview) {
      return;
    }

    setFixConceptsReview((review) => {
      if (!review || !review.chapters[chapterIndex]?.missing[missingIndex]) {
        return review;
      }

      return {
        ...review,
        chapters: review.chapters.map((reviewChapter, reviewChapterIndex) => reviewChapterIndex === chapterIndex
          ? { ...reviewChapter, missing: reviewChapter.missing.filter((_, index) => index !== missingIndex) }
          : reviewChapter)
      };
    });
  }, [isApplyingFixConceptsReview]);

  const toggleFixConceptsReviewRemoval = useCallback((chapterIndex: number, concept: BookConcept): void => {
    if (isApplyingFixConceptsReview || concept.id === undefined) {
      return;
    }

    setFixConceptsReview((review) => {
      const reviewChapter = review?.chapters[chapterIndex];

      if (!review || !reviewChapter) {
        return review;
      }

      const conceptKey = conceptReferenceKey(concept);
      const isRemoved = reviewChapter.removed.some((candidate) => conceptReferenceKey(candidate) === conceptKey);

      return {
        ...review,
        chapters: review.chapters.map((chapter, reviewChapterIndex) => reviewChapterIndex === chapterIndex
          ? {
            ...chapter,
            removed: isRemoved
              ? chapter.removed.filter((candidate) => conceptReferenceKey(candidate) !== conceptKey)
              : [...chapter.removed, concept]
          }
          : chapter)
      };
    });
  }, [isApplyingFixConceptsReview]);

  const applyFixConceptsReview = useCallback(async (): Promise<void> => {
    if (!fixConceptsReview || isApplyingFixConceptsReview) {
      return;
    }

    setIsApplyingFixConceptsReview(true);
    setError('');

    try {
      const attempt = await incrementBookFixConceptsAttempts(book.id);
      const nextStatuses: FixConceptsChapterStatuses = { ...fixConceptsReview.baseStatuses };
      const failureDetails = fixConceptsReview.failedChapters.map(({ chapter, reason }) => {
        nextStatuses[fixConceptsChapterKey(chapter)] = 'failed';
        return `${chapter.title || 'Untitled chapter'}: ${reason}`;
      });
      let added = 0;
      let removed = 0;
      const pageNumbers = Array.from(pages.keys());

      for (const { chapter, missing, removed: conceptsToRemove } of fixConceptsReview.chapters) {
        try {
          for (const concept of conceptsToRemove) {
            await deleteConceptAndDependencies(book.id, concept, pageNumbers);
            removed++;
          }

          for (const concept of missing) {
            await createBookConcept(chapterLevelMissingConcept(book.id, chapter.chapterId, concept, attempt));
            added++;
          }

          nextStatuses[fixConceptsChapterKey(chapter)] = 'fixed';
        } catch (reason) {
          nextStatuses[fixConceptsChapterKey(chapter)] = 'failed';
          failureDetails.push(`${chapter.title || 'Untitled chapter'}: saving reviewed concept changes failed (${conceptGenerationErrorMessage(reason)})`);
        }
      }

      storeFixConceptsChapterStatuses(book.id, nextStatuses);
      setFixConceptsChapterStatuses(nextStatuses);
      // The reviewed proposal has now been consumed. Close it before any
      // post-save refresh work so a refresh failure cannot cause duplicate
      // concept inserts if the user retries the same review.
      setFixConceptsReview(undefined);
      setFixConceptsReviewChapterIndex(0);

      const allChaptersFixed = conceptChapters.every((chapter) => nextStatuses[fixConceptsChapterKey(chapter)] === 'fixed');

      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);

      if (currentConceptChapter) {
        const inventory = await getBookConceptInventory(book.id, pages.keys());
        const chapterConcepts = conceptsForNavigationChapter(inventory, currentConceptChapter);
        const references = new Map<string, number>();

        chapterConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), concept.bookPage[1]));
        setConcepts(chapterConcepts);
        setConceptFirstPageByKey(references);
      }

      if (allChaptersFixed) {
        const completedBook = await completeBookProcessingStage(book.id, 'fixConcepts');

        onBookChange(completedBook ?? withCompletedBookProcessingStage(book, 'fixConcepts'));
        setError('');
      } else {
        const failureCount = conceptChapters.filter((chapter) => nextStatuses[fixConceptsChapterKey(chapter)] === 'failed').length;

        const savedSummary = [added ? `${added} concept${added === 1 ? '' : 's'} added` : '', removed ? `${removed} concept${removed === 1 ? '' : 's'} removed` : ''].filter(Boolean).join(', ');

        setError(`${failureCount} chapter${failureCount === 1 ? '' : 's'} still need Fix concepts attention. Approved changes were saved${savedSummary ? ` (${savedSummary})` : ''}.${failureDetails.length ? ` ${failureDetails.join(' | ')}` : ''}`);
      }

    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Unable to apply the reviewed Fix concepts changes.');
    } finally {
      setIsApplyingFixConceptsReview(false);
      onProcessingComplete();
    }
  }, [book, conceptChapters, currentConceptChapter, fixConceptsReview, isApplyingFixConceptsReview, onBookChange, onProcessingComplete, pages, refreshConceptCounts, refreshEntityCounts]);

  const embedAllConcepts = useCallback(async (): Promise<void> => {
    if (isEmbeddingConcepts || isDeduplicatingConcepts || isFixingConcepts || isSortingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || isGeneratingAllExercises || fixConceptsReview || deduplicateConceptsReview) {
      return;
    }

    if (!isBookProcessingStageComplete(book, 'fixConcepts')) {
      setError('Complete Fix concepts before calculating Embedings.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsEmbeddingConcepts(true);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const inventory = await getBookConceptInventory(book.id, pages.keys());
      const byId = await ensureConceptEmbeddingCache(client, embeddingModel, inventory, addEmbeddingsCost);

      setEmbeddingConceptInventory(inventory);
      setEmbeddingByConceptId(byId);
      setConceptEmbeddingsRefreshToken((token) => token + 1);
      await completeStage('embeddings');
      revealPane('embeddings');
    } finally {
      setIsEmbeddingConcepts(false);
    }
  }, [currentReaderProcessingSignal, addEmbeddingsCost, book, completeStage, deduplicateConceptsReview, embeddingModel, fixConceptsReview, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, pages, revealPane]);

  const deduplicateAllConcepts = useCallback(async (model = generateAllConceptsModel): Promise<void> => {
    if (isDeduplicatingConcepts || isEmbeddingConcepts || isFixingConcepts || isSortingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || isGeneratingAllExercises || fixConceptsReview || deduplicateConceptsReview) {
      return;
    }

    if (!book.language || !book.subject || book.age === undefined) {
      setError('Set the book language, subject, and learner age before running Deduplicate concepts.');
      return;
    }

    if (!isBookProcessingStageComplete(book, 'embeddings')) {
      setError('Run Embedings before Deduplicate concepts.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsDeduplicatingConcepts(true);

    try {
      const { conceptsById, inputs } = await loadDeduplicateConceptInventory();
      if (inputs.length < 2) {
        setDeduplicateConceptsReview({ checkedConceptCount: inputs.length, pairs: [] });
        revealPane('textConcepts');
        return;
      }

      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const embeddings = await cachedConceptEmbeddingMap(embeddingModel, Array.from(conceptsById.values()));
      const missingEmbeddingIds = inputs.filter(({ conceptId }) => !embeddings.has(conceptId)).map(({ conceptId }) => conceptId);

      if (missingEmbeddingIds.length) {
        throw new Error('Concept Embedings are missing or stale. Run Embedings again before deduplication.');
      }

      const candidates = deduplicateConceptCandidates(inputs, embeddings);
      const duplicatePairs = candidates.length
        ? await requestDeduplicateConceptPairs(client, model, inputs, candidates, book, addDeduplicateConceptsCost)
        : [];
      const inputById = new Map(inputs.map((input) => [input.conceptId, input] as const));
      const pairs = duplicatePairs.map(({ deletedConceptId, keptConceptId }): DeduplicateConceptsReviewPair => {
        const deleted = conceptsById.get(deletedConceptId);
        const kept = conceptsById.get(keptConceptId);
        const deletedInput = inputById.get(deletedConceptId);
        const keptInput = inputById.get(keptConceptId);

        if (!deleted || !kept || !deletedInput || !keptInput) {
          throw new Error('A proposed duplicate Concept no longer exists. Run Deduplicate concepts again.');
        }

        return {
          deleted,
          deletedChapterId: deletedInput.chapterId,
          deletedChapterTitle: deletedInput.chapterTitle,
          kept,
          keptChapterId: keptInput.chapterId,
          keptChapterTitle: keptInput.chapterTitle,
          selected: true
        };
      });

      setDeduplicateConceptsReview({ checkedConceptCount: inputs.length, pairs });
      revealPane('textConcepts');
    } finally {
      setIsDeduplicatingConcepts(false);
    }
  }, [currentReaderProcessingSignal, addDeduplicateConceptsCost, book, deduplicateConceptsReview, embeddingModel, fixConceptsReview, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, loadDeduplicateConceptInventory, revealPane]);

  useEffect((): void => {
    if (autoRunAll && fixConceptsReview && !isApplyingFixConceptsReview) {
      void applyFixConceptsReview();
    }
  }, [applyFixConceptsReview, autoRunAll, fixConceptsReview, isApplyingFixConceptsReview]);

  const discardDeduplicateConceptsReview = useCallback((): void => {
    if (!isApplyingDeduplicateConceptsReview) {
      setDeduplicateConceptsReview(undefined);
    }
  }, [isApplyingDeduplicateConceptsReview]);

  const toggleDeduplicateConceptDeletion = useCallback((deletedConceptId: number): void => {
    if (isApplyingDeduplicateConceptsReview) {
      return;
    }

    setDeduplicateConceptsReview((review) => review
      ? {
        ...review,
        pairs: review.pairs.map((pair) => pair.deleted.id === deletedConceptId ? { ...pair, selected: !pair.selected } : pair)
      }
      : review);
  }, [isApplyingDeduplicateConceptsReview]);

  const applyDeduplicateConceptsReview = useCallback(async (): Promise<void> => {
    if (!deduplicateConceptsReview || isApplyingDeduplicateConceptsReview) {
      return;
    }

    setIsApplyingDeduplicateConceptsReview(true);
    setError('');

    try {
      const selectedPairs = deduplicateConceptsReview.pairs.filter(({ selected }) => selected);
      const pageNumbers = Array.from(pages.keys());
      const deletionFailures: string[] = [];
      let deletedCount = 0;

      for (const { deleted, deletedChapterId } of selectedPairs) {
        try {
          await deleteConceptAndDependencies(book.id, deleted, pageNumbers);
          deletedCount++;
        } catch (reason) {
          deletionFailures.push(`${deleted.title || `Concept ${deleted.id ?? ''}`} (chapter ${deletedChapterId}): ${conceptGenerationErrorMessage(reason)}`);
        }
      }

      setDeduplicateConceptsReview(undefined);
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);

      if (currentConceptChapter) {
        const [pageRows, pageLess] = await Promise.all([
          Promise.all(currentConceptChapter.pageNumbers.map(async (chapterPageNumber) => ({
            concepts: await getBookConceptsForBookPage(book.id, chapterPageNumber),
            pageNumber: chapterPageNumber
          }))),
          getBookConceptsForBookPage(book.id, 0)
        ]);
        const rows = [...pageRows, { concepts: pageLess.filter(({ chapterId }) => chapterId === currentConceptChapter.chapterId), pageNumber: 0 }];
        const references = new Map<string, number>();

        rows.forEach(({ concepts: pageConcepts, pageNumber: conceptPageNumber }) => pageConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), conceptPageNumber)));
        setConcepts(sortConceptsForDisplay(rows.flatMap(({ concepts: pageConcepts }) => pageConcepts)));
        setConceptFirstPageByKey(references);
      }

      if (deletionFailures.length) {
        setError(`Deduplicate concepts deleted ${deletedCount} concept${deletedCount === 1 ? '' : 's'}, but ${deletionFailures.length} proposed deletion${deletionFailures.length === 1 ? '' : 's'} failed. The stage remains incomplete; rerun it to retry. ${deletionFailures.join(' | ')}`);
        return;
      }

      const completedBook = await completeBookProcessingStage(book.id, 'deduplicateConcepts');

      onBookChange(completedBook ?? withCompletedBookProcessingStage(book, 'deduplicateConcepts'));
      setError('');
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Unable to apply the reviewed Deduplicate concepts changes.');
    } finally {
      setIsApplyingDeduplicateConceptsReview(false);
      onProcessingComplete();
    }
  }, [book, currentConceptChapter, deduplicateConceptsReview, isApplyingDeduplicateConceptsReview, onBookChange, onProcessingComplete, pages, refreshConceptCounts, refreshEntityCounts]);

  useEffect((): void => {
    if (autoRunAll && deduplicateConceptsReview && !isApplyingDeduplicateConceptsReview) {
      void applyDeduplicateConceptsReview();
    }
  }, [applyDeduplicateConceptsReview, autoRunAll, deduplicateConceptsReview, isApplyingDeduplicateConceptsReview]);

  const sortAllConcepts = useCallback(async (model = generateAllConceptsModel): Promise<void> => {
    if (isSortingConcepts || isDeduplicatingConcepts || isEmbeddingConcepts || isFixingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || isGeneratingAllExercises || fixConceptsReview || deduplicateConceptsReview) {
      return;
    }

    if (!conceptChapters.length) {
      setError('No chapters are available for Sort concepts.');
      return;
    }

    if (!book.language || !book.subject || book.age === undefined) {
      setError('Set the book language, subject, and learner age before running Sort concepts.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsSortingConcepts(true);
    setSortedConceptsChapterCount(0);

    try {
      let clientPromise: Promise<OpenAI> | undefined;
      const getClient = (): Promise<OpenAI> => {
        clientPromise ??= getSetting(SettingKey.OPENROUTER_TOKEN).then((key) => {
          if (!key) {
            throw new Error('No OpenRouter token found. Add it in Settings.');
          }

          return createOpenRouterClient(key, currentReaderProcessingSignal());
        });

        return clientPromise;
      };
      const conceptInventory = await getBookConceptInventory(book.id, pages.keys());
      // Freeze the source chapters and select each chapter's concepts BEFORE any
      // sorting. This makes the chapter boundary an invariant of Sort Concepts.
      const sourceChapters = conceptChapters.map((chapter) => ({ ...chapter, pageNumbers: [...chapter.pageNumbers] }));
      const chapterInputs = sourceChapters.map((chapter) => ({
        chapter,
        concepts: conceptsForSortChapter(conceptInventory, chapter)
      }));

      // A concept must belong to exactly one source chapter for this run. Refuse
      // to sort rather than risk a cross-chapter reorder if chapter metadata is
      // ambiguous or corrupt.
      assertDisjointSortChapterConcepts(chapterInputs);

      // Model requests can run concurrently because each request contains one
      // chapter only. Database reorders are deliberately NOT performed here.
      const proposals = await mapConcurrent(chapterInputs, OPENROUTER_CONCURRENCY, async ({ chapter, concepts: before }) => {
        try {
          const conceptIndexes = before.length > 1
            ? await requestSortedChapterConceptIndexes(await getClient(), model, chapter.title, before, book, addSortConceptsCost)
            : before.map((_, index) => index);
          const sortedIds = conceptIndexes.map((conceptIndex) => before[conceptIndex]?.id).filter((id): id is number => id !== undefined);

          if (sortedIds.length !== before.length) {
            throw new Error('Sort Concepts returned an incomplete chapter order.');
          }

          return { chapter, sortedIds, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapter, reason, status: 'rejected' as const };
        } finally {
          setSortedConceptsChapterCount((count) => count + 1);
        }
      });
      const failures = proposals.flatMap((result) => result.status === 'rejected'
        ? [`${result.chapter.title || 'Untitled chapter'}: ${conceptGenerationErrorMessage(result.reason)}`]
        : []);

      if (failures.length) {
        setError(`Sort concepts stopped before saving because ${failures.length} of ${sourceChapters.length} chapters failed. No chapter orders were changed. ${failures.join(' | ')}`);
        return;
      }

      // Persist only the chapter-local displayOrder values. Do not call the DB
      // multi-concept reorder API here: it performs its own chapter-membership
      // validation against live rows and can reject a valid chapter-local sort
      // when chapter metadata changed between inventory loading and persistence.
      // Updating one concept at a time makes a cross-chapter reorder impossible.
      for (const proposal of proposals) {
        if (proposal.status !== 'fulfilled') {
          continue;
        }

        for (let displayOrder = 0; displayOrder < proposal.sortedIds.length; displayOrder++) {
          await updateBookConcept(proposal.sortedIds[displayOrder], { displayOrder } as Parameters<typeof updateBookConcept>[1]);
        }
      }

      if (currentConceptChapter) {
        const inventory = await getBookConceptInventory(book.id, pages.keys());
        const chapterConcepts = conceptsForNavigationChapter(inventory, currentConceptChapter);
        const references = new Map<string, number>();

        chapterConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), concept.bookPage[1]));
        setConcepts(chapterConcepts);
        setConceptFirstPageByKey(references);
      }

      setSkillsRefreshToken((value) => value + 1);
      await completeStage('sortConcepts');
      revealPane('textConcepts');
    } catch (sortError) {
      setError(sortError instanceof Error ? sortError.message : 'Unable to sort chapter concepts.');
    } finally {
      setIsSortingConcepts(false);
    }
  }, [currentReaderProcessingSignal, addSortConceptsCost, book, completeStage, conceptChapters, currentConceptChapter, deduplicateConceptsReview, fixConceptsReview, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, pages, revealPane]);

  const refineAllChapters = useCallback(async (model = generateAllConceptsModel): Promise<void> => {
    if (isRefiningChapters || isSortingConcepts || isDeduplicatingConcepts || isEmbeddingConcepts || isFixingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || isGeneratingAllExercises || fixConceptsReview || deduplicateConceptsReview) {
      return;
    }

    if (!conceptChapters.length) {
      setError('No chapters are available for Refine chapters.');
      return;
    }

    if (!book.language || !book.subject || book.age === undefined) {
      setError('Set the book language, subject, and learner age before running Refine chapters.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsRefiningChapters(true);
    setRefinedChaptersChapterCount(0);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const conceptInventory = [
        ...(await Promise.all(Array.from(pages.keys()).map((chapterPageNumber) => getBookConceptsForBookPage(book.id, chapterPageNumber)))).flat(),
        ...await getBookConceptsForBookPage(book.id, 0)
      ];
      // Freeze the pre-refinement chapter boundaries for this run. Every model
      // request and every split proposal is scoped to exactly one source chapter.
      const sourceChapters = conceptChapters.map((chapter) => ({ ...chapter, pageNumbers: [...chapter.pageNumbers] }));
      const proposals = await mapConcurrent(sourceChapters, OPENROUTER_CONCURRENCY, async (chapter) => {
        try {
          const concepts = conceptsForRefinementChapter(conceptInventory, chapter);
          const groups = concepts.length
            ? await requestRefinedChapterGroups(client, model, chapter.title, concepts, chapter.pageNumbers.length, book, addRefineChaptersCost)
            : [];
          const splitPages = refinedChapterSplitPages(chapter.pageNumbers, groups.map(({ conceptIndexes }) => conceptIndexes.length));

          if (groups.length > 1 && (chapter.chapterId === undefined || !splitPages)) {
            throw new Error('The proposed thematic split cannot be persisted as real chapters for this chapter.');
          }

          if (groups.length > 1 && concepts.some(({ id }) => id === undefined)) {
            throw new Error('Every concept needs an id before its chapter can be refined.');
          }

          return { chapter, concepts, groups, splitPages: splitPages ?? [], status: 'fulfilled' as const };
        } catch (reason) {
          return { chapter, reason, status: 'rejected' as const };
        } finally {
          setRefinedChaptersChapterCount((count) => count + 1);
        }
      });
      const failures = proposals.flatMap((result) => result.status === 'rejected'
        ? [`${result.chapter.title || 'Untitled chapter'}: ${conceptGenerationErrorMessage(result.reason)}`]
        : []);

      if (failures.length) {
        setError(`Refine chapters stopped before saving because ${failures.length} of ${sourceChapters.length} source chapters failed clustering. ${failures.join(' | ')}`);
        return;
      }

      const splits = proposals.flatMap((proposal) => proposal.status === 'fulfilled' && proposal.groups.length > 1 ? [proposal] : []);
      let stageBook = book;

      if (splits.length) {
        stageBook = withBookProcessingStagesResetFrom(book, 'exercises');
        const expectedMembership = await applyBookChapterRefinements(book.id, splits.map(({ chapter, concepts, groups, splitPages }) => ({
          groups: groups.map(({ conceptIndexes, title }) => ({
            conceptIds: conceptIndexes.map((conceptIndex) => concepts[conceptIndex].id as number),
            title
          })),
          sourceChapterId: chapter.chapterId as number,
          sourcePageNumbers: chapter.pageNumbers,
          splitPages
        })));
        const persistedConcepts = await getBookConceptInventory(book.id, pages.keys());

        if (!hasPersistedRefinedConceptMembership(expectedMembership, persistedConcepts)) {
          throw new Error('Unable to persist the complete thematic chapter refinement plan.');
        }

        await refreshChapterAssignments();
        await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
        setSkillsRefreshToken((value) => value + 1);
      }

      const completedBook = await completeBookProcessingStage(book.id, 'refineChapters') ?? withRefineChaptersComplete(stageBook);

      onBookChange(completedBook);
      revealPane('textConcepts');
      setError('');
    } catch (refineError) {
      setError(refineError instanceof Error ? refineError.message : 'Unable to refine chapters.');
    } finally {
      setIsRefiningChapters(false);
    }
  }, [currentReaderProcessingSignal, addRefineChaptersCost, book, conceptChapters, deduplicateConceptsReview, fixConceptsReview, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, isRefiningChapters, isSortingConcepts, onBookChange, pages, refreshChapterAssignments, refreshConceptCounts, refreshEntityCounts, revealPane]);

  const generateAllExercises = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isGeneratingAllExercises || isIdentifyingChapters || isRefiningChapters) {
      return;
    }

    if (!book.language) {
      setError('Set the book language before generating exercises.');
      onProcessingComplete();
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingAllExercises(true);
    setGeneratedExercisesPageCount(0);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const storedPages = (await getBookPages(book.id))
        .filter(({ chapter, chapterId, conceptsProcessed, excludedFromAnalysis }) => conceptsProcessed && !excludedFromAnalysis && (chapterId !== undefined || Boolean(chapter.trim())))
        .sort((a, b) => a.pageNumber - b.pageNumber);
      const pageRows = await Promise.all(storedPages.map(async (storedPage) => {
        const [concepts, exercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, storedPage.pageNumber),
          getExercisesForBookPage([book.id, storedPage.pageNumber])
        ]);

        return { concepts, exercises, storedPage };
      }));
      const conceptInventory = pageRows.flatMap(({ concepts }) => concepts);
      const exerciseConceptIds = new Set(pageRows.flatMap(({ exercises }) => exercises.flatMap(({ conceptId }) => conceptId === undefined ? [] : [conceptId])));
      const existingExercisesByPage = new Map(pageRows.map(({ exercises, storedPage }) => [storedPage.pageNumber, exercises] as const));
      const chapterInputs = conceptChapters.flatMap((chapter) => {
        const chapterConcepts = conceptsForNavigationChapter(conceptInventory, chapter);
        const targetConcepts = chapterConcepts.filter(({ id }) => !generateOnlyMissingExercises || id === undefined || !exerciseConceptIds.has(id));

        if (targetConcepts.some(({ id }) => id === undefined)) {
          throw new Error(`Every Concept must have an id before Exercises can be generated (${chapter.title || 'untitled chapter'}).`);
        }

        const conceptsByPage = new Map<number, BookConcept[]>();

        targetConcepts.forEach((concept) => {
          const pageConcepts = conceptsByPage.get(concept.bookPage[1]) ?? [];

          pageConcepts.push(concept);
          conceptsByPage.set(concept.bookPage[1], pageConcepts);
        });
        const chapterPages = Array.from(conceptsByPage.entries())
          .sort(([a], [b]) => a - b)
          .map(([conceptPageNumber, concepts]) => ({
            concepts: concepts.map(({ description, id, title }) => ({ description, sourceId: id as number, title })),
            pageNumber: conceptPageNumber
          }));

        return chapterPages.length ? [{ chapter: chapter.title, pages: chapterPages }] : [];
      });
      const generatedExercisesByPage = new Map<number, Array<Omit<Exercise, 'bookPage' | 'id'>>>();

      await mapConcurrent(chapterInputs, OPENROUTER_CONCURRENCY, async (chapterInput) => {
        const bookDetectedLanguage = bookLanguageLabel(book.language);
        const processedChapter = await processExtractedChapterContent(chapterInput, async (prompt) => {
          const response = await openRouterRequestGate.run(() => client.chat.completions.create({
            messages: [{ content: prompt, role: 'user' }],
            model: generateAllConceptsModel,
            response_format: { type: 'json_object' }
          }));

          reportOpenRouterCost(response, addExercisesCost);

          return response.choices[0].message?.content?.trim() ?? '{}';
        }, bookDetectedLanguage, book.age);

        for (const processed of processedChapter.pages) {
          const generatedExercises = processed.exercises.flatMap((exercise): Array<Omit<Exercise, 'bookPage' | 'id'>> => {
            const sourceConcept = exercise.conceptIndex === undefined ? undefined : processed.concepts[exercise.conceptIndex];
            const conceptId = sourceConcept?.sourceId;

            if (conceptId === undefined) {
              return [];
            }

            return [{
              conceptId,
              description: stripMarkdownImageReferences(exercise.description),
              imageDescription: exercise.imageDescription,
              solution: exercise.solution,
              solutionImageDescription: exercise.solutionImageDescription,
              source: exercise.source,
              title: exercise.title
            }];
          });
          const pageExercises = generatedExercisesByPage.get(processed.pageNumber) ?? [];

          pageExercises.push(...generatedExercises);
          generatedExercisesByPage.set(processed.pageNumber, pageExercises);
        }
      });

      for (const { storedPage } of pageRows) {
        const generatedExercises = generatedExercisesByPage.get(storedPage.pageNumber) ?? [];
        const originalExercises = existingExercisesByPage.get(storedPage.pageNumber) ?? [];

        if (generateOnlyMissingExercises && !generatedExercises.length) {
          setGeneratedExercisesPageCount((count) => count + 1);
          continue;
        }

        const abilityContentsByExerciseId = new Map<number, string[]>();

        if (generateOnlyMissingExercises) {
          await Promise.all(originalExercises.map(async ({ id }) => {
            if (id !== undefined) {
              abilityContentsByExerciseId.set(id, (await getAbilities(exerciseAbilityModuleId(book.id, id))).map(({ content }) => content));
            }
          }));
        }

        const replacements = generateOnlyMissingExercises
          ? [...originalExercises.map(exerciseForPageReplacement), ...generatedExercises]
          : generatedExercises;

        await replaceExercisesForBookPage([book.id, storedPage.pageNumber], replacements);

        if (generateOnlyMissingExercises) {
          const storedExercises = await getExercisesForBookPage([book.id, storedPage.pageNumber]);

          if (storedExercises.length !== replacements.length || storedExercises.some(({ id }) => id === undefined)) {
            throw new Error(`Unable to preserve existing Exercises while adding missing Exercises on page ${storedPage.pageNumber}.`);
          }

          for (let index = 0; index < originalExercises.length; index++) {
            const oldId = originalExercises[index].id;
            const newId = storedExercises[index].id as number;

            if (oldId === undefined || oldId === newId) {
              continue;
            }

            const contents = abilityContentsByExerciseId.get(oldId) ?? [];

            if (contents.length) {
              await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
            }

            await deleteAbilities(exerciseAbilityModuleId(book.id, oldId));
          }
        }

        setGeneratedExercisesPageCount((count) => count + 1);
      }

      await refreshEntityCounts();
      setSkillsRefreshToken((value) => value + 1);
      await completeStage('exercises');
      revealPane('conceptExercises');
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
    } finally {
      setIsGeneratingAllExercises(false);
      onProcessingComplete();
    }
  }, [currentReaderProcessingSignal, addExercisesCost, completeStage, book.age, book.id, book.language, conceptChapters, generateAllConceptsModel, generateOnlyMissingExercises, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isRefiningChapters, isGeneratingAllExercises, onProcessingComplete, pages, processingPage, refreshEntityCounts, revealPane, totalPages]);

  const detectAndStoreBookLanguage = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.language) || isDetectingBookLanguageRef.current) {
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = recognizedPages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      if (force) {
        throw new Error('The middle recognized pages do not contain enough text to detect a language. Choose the language manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or choose the language manually.');
      }

      return;
    }

    isDetectingBookLanguageRef.current = true;
    setIsDetectingBookLanguage(true);

    try {
      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_LANGUAGE_DETECTION_PROMPT(pageTexts), role: 'user' }],
        model: autoRunAll ? DEFAULT_PROCESSING_MODEL : selectedLanguageModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addLanguageCost);

      const language = parseDetectedBookLanguage(response.choices[0].message?.content?.trim() ?? '');
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      const changes: Partial<Pick<Book, 'age' | 'language' | 'subject'>> = { language };

      if (languageChanged) {
        changes.age = undefined;
        changes.subject = automaticSubject;
      } else if (automaticSubject) {
        changes.subject = automaticSubject;
      }

      const updatedBook = await updateBookFieldsAndStages(book.id, changes, {
        complete: automaticSubject ? ['language', 'subject'] : ['language'],
        ...(languageChanged ? { resetFrom: 'language' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('language');
    } finally {
      isDetectingBookLanguageRef.current = false;
      setIsDetectingBookLanguage(false);
    }
  }, [currentReaderProcessingSignal, addLanguageCost, autoRunAll, book, onBookChange, revealPane, selectedLanguageModel, totalPages]);

  const saveManualBookLanguage = useCallback(async (languageValue: string): Promise<void> => {
    const language = normalizeLanguageCode(languageValue);

    if (!language) {
      setError('Choose a valid ISO 639-1 book language.');
      return;
    }

    setError('');

    try {
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      const changes: Partial<Pick<Book, 'age' | 'language' | 'subject'>> = { language };

      if (languageChanged) {
        changes.age = undefined;
        changes.subject = automaticSubject;
      } else if (automaticSubject) {
        changes.subject = automaticSubject;
      }

      const updatedBook = await updateBookFieldsAndStages(book.id, changes, {
        complete: automaticSubject ? ['language', 'subject'] : ['language'],
        ...(languageChanged ? { resetFrom: 'language' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('language');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book language.');
    }
  }, [book, onBookChange, revealPane]);

  const isMmdConversionComplete = useMemo((): boolean => {
    if (!totalPages) {
      return false;
    }

    return Array.from({ length: totalPages }, (_, index) => pages.get(index + 1)?.pageMMD !== undefined).every(Boolean);
  }, [pages, totalPages]);

  const redetectBookLanguage = useCallback(async (): Promise<void> => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book language.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookLanguage(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine the book language from MMD text.');
    }
  }, [detectAndStoreBookLanguage, isMmdConversionComplete, pages]);

  const openLanguageDetectionConfirmation = useCallback((): void => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book language.');
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const hasAllMiddleText = middlePageNumbers.length > 0 && middlePageNumbers.every((middlePageNumber) => Boolean(pages.get(middlePageNumber)?.pageMMD?.trim()));

    if (!hasAllMiddleText) {
      setError('The middle recognized pages do not contain enough text to detect a language. Choose the language manually.');
      return;
    }

    setError('');
    setIsLanguageDetectionConfirmationOpen(true);
  }, [isMmdConversionComplete, pages, totalPages]);

  const closeLanguageDetectionConfirmation = useCallback((): void => {
    setIsLanguageDetectionConfirmationOpen(false);
  }, []);

  const confirmLanguageDetection = useCallback((): void => {
    setIsLanguageDetectionConfirmationOpen(false);
    setConfirmedProcessingStage('language');
    redetectBookLanguage()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'language' ? undefined : current));
  }, [redetectBookLanguage]);

  const detectAndStoreBookSubject = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.subject) || isDetectingBookSubjectRef.current) {
      return;
    }

    if (!book.language) {
      if (force) {
        throw new Error('Set the book language before detecting its subject.');
      }

      return;
    }

    const automaticSubject = automaticBookSubjectForLanguage(book.language);

    if (automaticSubject) {
      const subjectChanged = book.subject !== automaticSubject;
      const updatedBook = await updateBookFieldsAndStages(book.id, {
        ...(subjectChanged ? { age: undefined } : {}),
        subject: automaticSubject
      }, {
        complete: ['subject'],
        ...(subjectChanged ? { resetFrom: 'subject' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('subject');
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = recognizedPages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      if (force) {
        throw new Error('The middle recognized pages do not contain enough text to detect a subject. Choose the subject manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or choose the subject manually.');
      }

      return;
    }

    isDetectingBookSubjectRef.current = true;
    setIsDetectingBookSubject(true);

    try {
      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_SUBJECT_DETECTION_PROMPT(book.language ?? 'unknown', pageTexts), role: 'user' }],
        model: autoRunAll ? DEFAULT_PROCESSING_MODEL : selectedSubjectModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addSubjectCost);

      const subject = parseDetectedBookSubject(response.choices[0].message?.content?.trim() ?? '');
      const subjectChanged = book.subject !== subject;
      const updatedBook = await updateBookFieldsAndStages(book.id, {
        ...(subjectChanged ? { age: undefined } : {}),
        subject
      }, {
        complete: ['subject'],
        ...(subjectChanged ? { resetFrom: 'subject' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('subject');
    } finally {
      isDetectingBookSubjectRef.current = false;
      setIsDetectingBookSubject(false);
    }
  }, [currentReaderProcessingSignal, addSubjectCost, autoRunAll, book, onBookChange, revealPane, selectedSubjectModel, totalPages]);

  const saveManualBookSubject = useCallback(async (subjectValue: string): Promise<void> => {
    const subject = normalizeBookSubject(subjectValue);

    if (!subject) {
      setError('Choose a valid book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before setting its subject.');
      return;
    }

    setError('');

    try {
      const subjectChanged = book.subject !== subject;
      const updatedBook = await updateBookFieldsAndStages(book.id, {
        ...(subjectChanged ? { age: undefined } : {}),
        subject
      }, {
        complete: ['subject'],
        ...(subjectChanged ? { resetFrom: 'subject' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('subject');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book subject.');
    }
  }, [book, onBookChange, revealPane]);

  const redetectBookSubject = useCallback(async (): Promise<void> => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before detecting its subject.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookSubject(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine the book subject from MMD text.');
    }
  }, [book.language, detectAndStoreBookSubject, isMmdConversionComplete, pages]);

  const openSubjectDetectionConfirmation = useCallback((): void => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before detecting its subject.');
      return;
    }

    setError('');
    setIsSubjectDetectionConfirmationOpen(true);
  }, [book.language, isMmdConversionComplete]);

  const closeSubjectDetectionConfirmation = useCallback((): void => {
    setIsSubjectDetectionConfirmationOpen(false);
  }, []);

  const confirmSubjectDetection = useCallback((): void => {
    setIsSubjectDetectionConfirmationOpen(false);
    setConfirmedProcessingStage('subject');
    redetectBookSubject()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'subject' ? undefined : current));
  }, [redetectBookSubject]);

  const detectAndStoreBookAge = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.age !== undefined) || isDetectingBookAgeRef.current) {
      return;
    }

    if (!book.language || !book.subject) {
      if (force) {
        throw new Error('Set the book language and subject before detecting learner age.');
      }

      return;
    }

    const samplePageNumbers = getBookAgeSamplePageNumbers(totalPages, Array.from(recognizedPages.values()).flatMap(({ pageMMD, pageNumber }) => pageMMD?.trim() ? [pageNumber] : []));
    const pageTexts = samplePageNumbers.flatMap((samplePageNumber) => {
      const text = recognizedPages.get(samplePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: samplePageNumber, text }] : [];
    });

    if (!samplePageNumbers.length || samplePageNumbers.length !== Math.min(3, totalPages) || pageTexts.length !== samplePageNumbers.length) {
      if (force) {
        throw new Error('The representative recognized pages do not contain enough text to detect learner age. Enter the age manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or enter the learner age manually.');
      }

      return;
    }

    isDetectingBookAgeRef.current = true;
    setIsDetectingBookAge(true);

    try {
      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_AGE_DETECTION_PROMPT(book.language ?? 'unknown', book.subject ?? 'unknown', pageTexts), role: 'user' }],
        model: autoRunAll ? DEFAULT_PROCESSING_MODEL : selectedAgeModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addAgeCost);

      const age = parseDetectedBookAge(response.choices[0].message?.content?.trim() ?? '');
      const ageChanged = book.age !== age;
      const updatedBook = await updateBookFieldsAndStages(book.id, { age }, {
        complete: ['age'],
        ...(ageChanged ? { resetFrom: 'age' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('age');
    } finally {
      isDetectingBookAgeRef.current = false;
      setIsDetectingBookAge(false);
    }
  }, [currentReaderProcessingSignal, addAgeCost, autoRunAll, book, onBookChange, revealPane, selectedAgeModel, totalPages]);

  const saveManualBookAge = useCallback(async (): Promise<void> => {
    const age = normalizeBookAge(ageInput);

    if (age === undefined) {
      setError(`Enter a whole-number learner age from ${MIN_BOOK_LEARNER_AGE} through ${MAX_BOOK_LEARNER_AGE}.`);
      return;
    }

    setError('');

    try {
      const ageChanged = book.age !== age;
      const updatedBook = await updateBookFieldsAndStages(book.id, { age }, {
        complete: ['age'],
        ...(ageChanged ? { resetFrom: 'age' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('age');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the learner age.');
    }
  }, [ageInput, book, onBookChange, revealPane]);

  const redetectBookAge = useCallback(async (): Promise<void> => {
    if (!book.language || !book.subject) {
      setError('Set the book language and subject before detecting learner age.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookAge(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine learner age from the representative text pages.');
    }
  }, [book.language, book.subject, detectAndStoreBookAge, pages]);

  const openAgeDetectionConfirmation = useCallback((): void => {
    if (!book.language || !book.subject) {
      setError('Set the book language and subject before detecting learner age.');
      return;
    }

    const hasAllSampleText = ageSamplePageNumbers.length === Math.min(3, totalPages) && ageSamplePageTexts.length === ageSamplePageNumbers.length;

    if (!hasAllSampleText) {
      setError('Recognize the representative sample pages before detecting learner age. You can still enter the age manually.');
      return;
    }

    setError('');
    setIsAgeDetectionConfirmationOpen(true);
  }, [ageSamplePageNumbers, ageSamplePageTexts, book.language, book.subject, totalPages]);

  const closeAgeDetectionConfirmation = useCallback((): void => {
    setIsAgeDetectionConfirmationOpen(false);
  }, []);

  const confirmAgeDetection = useCallback((): void => {
    setIsAgeDetectionConfirmationOpen(false);
    setConfirmedProcessingStage('age');
    redetectBookAge()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'age' ? undefined : current));
  }, [redetectBookAge]);

  useEffect((): void => {
    if (!autoRunAll) {
      return;
    }

    if (isLanguageDetectionConfirmationOpen) {
      confirmLanguageDetection();
    }

    if (isSubjectDetectionConfirmationOpen) {
      confirmSubjectDetection();
    }

    if (isAgeDetectionConfirmationOpen) {
      confirmAgeDetection();
    }
  }, [autoRunAll, confirmAgeDetection, confirmLanguageDetection, confirmSubjectDetection, isAgeDetectionConfirmationOpen, isLanguageDetectionConfirmationOpen, isSubjectDetectionConfirmationOpen]);

  const recognizePage = useCallback(async (): Promise<void> => {
    if (processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setProcessingPage(pageNumber);

    try {
      const [appId, apiKey] = await Promise.all([
        getSetting(SettingKey.MATHPIX_APP_ID),
        getSetting(SettingKey.MATHPIX_API_KEY)
      ]);

      if (!apiKey) {
        setMathpixApiKey('');
        setRecognitionTarget('page');
        setIsMathpixKeyPromptOpen(true);

        return;
      }

      const slice = mathpixPdfSlices(totalPages).find(({ endPage, startPage }) => pageNumber >= startPage && pageNumber <= endPage);

      if (!slice) {
        throw new Error(`Unable to determine the 40-page PDF slice containing page ${pageNumber}.`);
      }

      const pageCount = slice.endPage - slice.startPage + 1;
      const createPdfPageSlice = await createPdfPageSliceFactory(file);
      const sliceFile = await createPdfPageSlice(slice.startPage, slice.endPage);
      const recognition = await recognizePdfWithMathpix(appId, apiKey, sliceFile, pageCount, undefined, addRecognizeExternalCall, currentReaderProcessingSignal());

      if (recognition.pages.length !== pageCount) {
        throw new Error(`Mathpix returned ${recognition.pages.length} pages for PDF pages ${slice.startPage}-${slice.endPage}.`);
      }

      addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD * pageCount);

      const updatedPages = new Map(pages);

      for (let index = 0; index < pageCount; index++) {
        const currentPageNumber = slice.startPage + index;
        const storedPage = updatedPages.get(currentPageNumber);
        const recognized = recognition.pages[index];
        const recognizedPage: BookPage = {
          ...storedPage,
          bookId: book.id,
          chapter: storedPage?.chapter ?? '',
          conceptsProcessed: storedPage?.conceptsProcessed ?? false,
          mathpixHeadings: mathpixHeadingsForRecognitionPage(recognition, index),
          pageMMD: recognized.pageMMD,
          pageMMDZip: recognized.pageMMDZip,
          pageNumber: currentPageNumber
        };

        await putBookPage(recognizedPage);
        updatedPages.set(currentPageNumber, recognizedPage);
      }

      setPages(updatedPages);

      if (totalPages && Array.from({ length: totalPages }, (_, index) => updatedPages.get(index + 1)).every((page) => page?.pageMMD !== undefined)) {
        await completeStage('recognize');
      }

      setActivePane('text');
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this PDF slice.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [currentReaderProcessingSignal, addRecognizeCost, addRecognizeExternalCall, completeStage, book.id, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, totalPages]);

  const recognizeAllPages = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsRecognizingAll(true);
    setRecognizedPageCount(0);

    const [appId, apiKey] = await Promise.all([
      getSetting(SettingKey.MATHPIX_APP_ID),
      getSetting(SettingKey.MATHPIX_API_KEY)
    ]);

    // Existing installations only stored MATHPIX_API_KEY and previously
    // authenticated Mathpix with the app_key header alone. Keep that path
    // working instead of forcing users through a new App ID migration prompt.
    if (!apiKey) {
      setMathpixApiKey('');
      setRecognitionTarget('all');
      setIsMathpixKeyPromptOpen(true);
      setIsRecognizingAll(false);
      onProcessingComplete();

      return;
    }

    let recognitionCompleted = false;
    const processingSignal = currentReaderProcessingSignal();

    try {
      const createPdfPageSlice = await createPdfPageSliceFactory(file);
      const failedPagesBySlice = await Promise.all(mathpixPdfSlices(totalPages).map(async ({ endPage, startPage }) => {
        const pageCount = endPage - startPage + 1;
        let storedPageCount = 0;

        try {
          if (processingSignal.aborted) {
            const abortError = new Error('The operation was aborted.');

            abortError.name = 'AbortError';
            throw abortError;
          }

          const sliceFile = await createPdfPageSlice(startPage, endPage);
          const recognition = await recognizePdfWithMathpix(appId, apiKey, sliceFile, pageCount, undefined, addRecognizeExternalCall, processingSignal);

          if (recognition.pages.length !== pageCount) {
            throw new Error(`Mathpix returned ${recognition.pages.length} pages for PDF pages ${startPage}-${endPage}.`);
          }

          addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD * pageCount);

          for (let index = 0; index < pageCount; index++) {
            const currentPageNumber = startPage + index;
            const storedPage = pages.get(currentPageNumber);
            const recognized = recognition.pages[index];
            const recognizedPage: BookPage = {
              ...storedPage,
              bookId: book.id,
              chapter: storedPage?.chapter ?? '',
              conceptsProcessed: storedPage?.conceptsProcessed ?? false,
              mathpixHeadings: mathpixHeadingsForRecognitionPage(recognition, index),
              pageMMD: recognized.pageMMD,
              pageMMDZip: recognized.pageMMDZip,
              pageNumber: currentPageNumber
            };

            await putBookPage(recognizedPage);
            storedPageCount++;
            setPages((current) => new Map(current).set(currentPageNumber, recognizedPage));
            setRecognizedPageCount((count) => count + 1);
          }

          return 0;
        } catch (error) {
          if (processingSignal.aborted || (error instanceof Error && error.name === 'AbortError')) {
            throw error;
          }

          return pageCount - storedPageCount;
        }
      }));
      const failedPages = failedPagesBySlice.reduce((total, count) => total + count, 0);

      if (failedPages) {
        setError(`${failedPages} of ${totalPages} pages could not be recognized.`);
      } else {
        await completeStage('recognize');
        recognitionCompleted = true;
      }
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
    } finally {
      setIsRecognizingAll(false);
      onProcessingComplete();

      if (recognitionCompleted) {
        setActivePane('text');
      }
    }
  }, [currentReaderProcessingSignal, addRecognizeCost, addRecognizeExternalCall, completeStage, book.id, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, processingPage, totalPages]);

  const saveMathpixApiKey = useCallback(async (): Promise<void> => {
    const apiKey = mathpixApiKey.trim();

    if (!apiKey) {
      return;
    }

    await storeSetting(SettingKey.MATHPIX_API_KEY, apiKey);
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
    await (recognitionTarget === 'all' ? recognizeAllPages() : recognizePage());
  }, [mathpixApiKey, recognitionTarget, recognizeAllPages, recognizePage]);

  const submitMathpixApiKey = useCallback((): void => {
    saveMathpixApiKey().catch((saveError) => {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the Mathpix API key.');
    });
  }, [saveMathpixApiKey]);

  const closeMathpixKeyPrompt = useCallback((): void => {
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
  }, []);

  const assignStandards = useCallback(async (force = false): Promise<void> => {
    if (!conceptChapters.length || isAssigningStandards) {
      return;
    }

    if (!isBookProcessingStageComplete(book, 'fixImages')) {
      setError('Complete Fix images before identifying Standards.');
      return;
    }

    if (!isBookProcessingStageComplete(book, 'embeddings')) {
      setError('Complete Embedings before identifying Standards.');
      return;
    }

    setError('');
    setIsAssigningStandards(true);
    setStandardsAssignedChapterCount(0);
    setOpenRouterSpent(0);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const catalogs = await loadStandardsCatalogsForBookSubject(book.subject);
      const conceptInventory = await getBookConceptInventory(book.id, pages.keys());
      const conceptEmbeddings = await cachedConceptEmbeddingMap(embeddingModel, conceptInventory);
      const missingConceptEmbeddings = conceptInventory.filter(({ id, title, description }) => (
        id !== undefined && Number.isSafeInteger(id) && id > 0 && (title.trim() || description.trim()) && !conceptEmbeddings.has(id)
      ));

      if (missingConceptEmbeddings.length) {
        throw new Error('Concept Embedings are missing or stale for the selected model. Run Embedings again before Standards.');
      }

      const standardEmbeddings = await ensureStandardEmbeddingCache(client, embeddingModel, catalogs, addStandardsCost);

      setConceptEmbeddingsRefreshToken((token) => token + 1);
      const results = await mapConcurrent(conceptChapters, OPENROUTER_CONCURRENCY, async (chapter: ConceptChapterNavigationItem) => {
        const chapterConceptRows = getChapterStandardsConceptRows(conceptInventory, chapter);
        const concepts = standardsConceptInputs(chapterConceptRows);
        const fingerprint = standardsConceptFingerprint(concepts, standardsPathForBookSubject(book.subject) ?? 'no-standards');
        const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);
        const existing = standardsByChapter[chapterKey];

        if (!force && existing?.conceptFingerprint === fingerprint) {
          setStandardsAssignedChapterCount((count) => count + 1);

          return { chapterKey, entry: existing, status: 'fulfilled' as const };
        }

        try {
          const chapterEmbeddings = chapterConceptRows.flatMap(({ id }) => id === undefined ? [] : (conceptEmbeddings.get(id) ? [conceptEmbeddings.get(id) as number[]] : []));
          const standards = await requestChapterStandards(client, standardsModel || DEFAULT_STANDARDS_MODEL, chapter.title, concepts, chapterEmbeddings, catalogs, standardEmbeddings, addStandardsCost);

          setStandardsAssignedChapterCount((count) => count + 1);

          return { chapterKey, entry: { conceptFingerprint: fingerprint, standards }, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapterKey, reason, status: 'rejected' as const };
        }
      });
      const next = { ...standardsByChapter };
      let failures = 0;

      results.forEach((result) => {
        if (result.status === 'rejected') {
          failures++;
        } else {
          next[result.chapterKey] = result.entry;
        }
      });

      setStandardsByChapter(next);
      storeBookStandards(book.id, next);

      if (failures) {
        setError(`${failures} of ${conceptChapters.length} chapters could not have standards identified. Retry Standards identification.`);
      } else {
        await completeStage('standards');
        revealPane('standards');
      }
    } finally {
      setIsAssigningStandards(false);
    }
  }, [currentReaderProcessingSignal, addStandardsCost, completeStage, book, book.id, book.subject, conceptChapters, embeddingModel, isAssigningStandards, pages, revealPane, standardsByChapter, standardsModel]);

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

  const changeConceptChapter = useCallback((index: number): void => {
    if (!conceptChapters.length) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(index, conceptChapters.length - 1));
    const chapter = conceptChapters[nextIndex];
    const firstPage = chapter?.pageNumbers[0];

    pendingConceptChapterFocusRef.current = true;
    setConceptChapterIndex(nextIndex);
    storeSharedChapterSelection(book.id, { chapterId: chapter?.chapterId, index: nextIndex, title: chapter?.title });

    if (firstPage !== undefined) {
      goToPage(firstPage);
    }
  }, [book.id, conceptChapters, goToPage]);
  const loadCurrentChapterConcepts = useCallback(async (): Promise<{ concepts: BookConcept[]; references: Map<string, number> }> => {
    if (!currentConceptChapter) {
      return { concepts: [], references: new Map() };
    }

    const inventory = await getBookConceptInventory(book.id, pages.keys());
    const chapterConcepts = conceptsForNavigationChapter(inventory, currentConceptChapter);
    const references = new Map<string, number>();

    chapterConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), concept.bookPage[1]));

    return { concepts: chapterConcepts, references };
  }, [book.id, currentConceptChapter, pages]);

  const reloadCurrentChapterConcepts = useCallback(async (): Promise<void> => {
    const loaded = await loadCurrentChapterConcepts();

    setConcepts(loaded.concepts);
    setConceptFirstPageByKey(loaded.references);
  }, [loadCurrentChapterConcepts]);

  const addConcept = useCallback(async (): Promise<void> => {
    const title = newConceptTitle.trim();

    if (!title || !currentConceptChapter || isSavingNewConcept) {
      return;
    }

    const selectedPage = newConceptPage ? Number(newConceptPage) : undefined;

    if (selectedPage !== undefined && !currentConceptChapter.pageNumbers.includes(selectedPage)) {
      setError('Choose a page from the current chapter or leave Page empty.');

      return;
    }

    if (!Number.isInteger(newConceptAfterIndex) || newConceptAfterIndex < -1 || newConceptAfterIndex >= concepts.length) {
      setError('Choose where the new concept should be inserted.');

      return;
    }

    const insertionIndex = newConceptAfterIndex + 1;
    const chapterPage = pages.get(selectedPage ?? currentConceptChapter.pageNumbers[0]);
    const concept: Omit<BookConcept, 'id'> = {
      bookPage: [book.id, selectedPage ?? 0],
      chapterId: chapterPage?.chapterId ?? currentConceptChapter.chapterId,
      description: newConceptDescription.trim(),
      displayOrder: conceptInsertionDisplayOrder(concepts, insertionIndex),
      manuallyAdded: true,
      title
    };
    const existingIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));

    setIsSavingNewConcept(true);

    try {
      await createBookConcept(concept);

      // Normalize displayOrder after insertion so future drag-and-drop operations
      // start from a simple 0..n order. The preliminary fractional order above
      // still puts the new row in the requested position if normalization cannot
      // run for an unexpected row without an id.
      const loaded = await loadCurrentChapterConcepts();
      const created = loaded.concepts.find(({ description, id, manuallyAdded, title: loadedTitle }) =>
        id !== undefined &&
        !existingIds.has(id) &&
        manuallyAdded === true &&
        loadedTitle === title &&
        description === newConceptDescription.trim()
      ) ?? loaded.concepts.find(({ id }) => id !== undefined && !existingIds.has(id));
      const existingConceptIds = concepts.flatMap(({ id }) => id === undefined ? [] : [id]);

      if (created?.id !== undefined && existingConceptIds.length === concepts.length) {
        const orderedIds = [...existingConceptIds];

        orderedIds.splice(insertionIndex, 0, created.id);
        await reorderBookConcepts(orderedIds, currentConceptChapter.chapterId);
      }

      await reloadCurrentChapterConcepts();
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setNewConceptAfterIndex(-1);
      setNewConceptDescription('');
      setNewConceptPage('');
      setNewConceptTitle('');
      setIsAddingConcept(false);
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add the concept.');
      throw caught;
    } finally {
      setIsSavingNewConcept(false);
    }
  }, [book.id, concepts, currentConceptChapter, isSavingNewConcept, loadCurrentChapterConcepts, newConceptAfterIndex, newConceptDescription, newConceptPage, newConceptTitle, pages, refreshConceptCounts, refreshEntityCounts, reloadCurrentChapterConcepts]);

  const reorderConcepts = useCallback(async (fromIndex: number, toIndex: number): Promise<void> => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= concepts.length || toIndex >= concepts.length || isReorderingConcepts || isApplyingFixConceptsReview) {
      return;
    }

    const previous = concepts;
    const displayedMoved = concepts[fromIndex];

    setIsReorderingConcepts(true);

    try {
      // Re-read the chapter at drop time. Fix Concepts can delete/recreate rows,
      // so the rendered list may contain ids that were valid when it was loaded
      // but are no longer the live chapter rows. Rebase the user's move onto the
      // live list before persisting it.
      const loaded = await loadCurrentChapterConcepts();
      const liveConcepts = loaded.concepts;
      const moved = matchingLiveConcept(displayedMoved, liveConcepts);

      if (!moved) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        setError('Concepts were updated by Fix Concepts, so the chapter list was refreshed. Drag the current concept to reorder it.');
        return;
      }

      const liveFromIndex = liveConcepts.findIndex(({ id }) => id !== undefined && id === moved.id);

      if (liveFromIndex < 0) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        return;
      }

      const liveToIndex = Math.min(toIndex, Math.max(0, liveConcepts.length - 1));

      if (liveFromIndex === liveToIndex) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        setError('');
        return;
      }

      const reordered = [...liveConcepts];
      const [liveMoved] = reordered.splice(liveFromIndex, 1);

      reordered.splice(liveToIndex, 0, liveMoved);

      const orderedConcepts = reordered.map((concept, index) => ({ ...concept, displayOrder: index }));
      const sortedIds = orderedConcepts.flatMap(({ id }) => id === undefined ? [] : [id]);

      if (sortedIds.length !== orderedConcepts.length) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        setError('Unable to reorder a concept without an id.');
        return;
      }

      reorderedConceptFocusIdRef.current = liveMoved.id;
      setConcepts(orderedConcepts);
      setConceptFirstPageByKey(loaded.references);

      await reorderBookConcepts(sortedIds, currentConceptChapter?.chapterId);
      // Reordering only changes the learning/display sequence. It must not
      // invalidate processing history: generated/fixed Exercises and later
      // stages remain valid, while DB order propagation updates dependent
      // Exercise/Ability displayOrder values in place.
      await reloadCurrentChapterConcepts();
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      setConcepts(previous);
      setError(caught instanceof Error ? caught.message : 'Unable to reorder concepts.');
    } finally {
      setIsReorderingConcepts(false);
    }
  }, [concepts, currentConceptChapter?.chapterId, isApplyingFixConceptsReview, isReorderingConcepts, loadCurrentChapterConcepts, reloadCurrentChapterConcepts]);

  useLayoutEffect((): void => {
    const conceptId = reorderedConceptFocusIdRef.current;
    const scroller = conceptsOutputRef.current;

    if (conceptId === undefined || !scroller) {
      return;
    }

    const movedRow = Array.from(scroller.querySelectorAll<HTMLElement>('.conceptItem'))
      .find((row) => row.dataset.conceptId === String(conceptId));

    if (!movedRow) {
      return;
    }

    reorderedConceptFocusIdRef.current = undefined;
    movedRow.scrollIntoView({ block: 'nearest' });
    movedRow.focus({ preventScroll: true });
  }, [concepts]);
  const clearConceptDropMarker = useCallback((): void => {
    const scroller = conceptsOutputRef.current;

    scroller?.querySelector('.conceptItem.conceptDropBefore')?.classList.remove('conceptDropBefore');
    scroller?.querySelector('.conceptItem.conceptDropAfter')?.classList.remove('conceptDropAfter');
  }, []);

  const updateConceptDropTarget = useCallback((pointerY: number): void => {
    const scroller = conceptsOutputRef.current;
    const sourceIndex = draggedConceptIndexRef.current;

    if (!scroller || sourceIndex === undefined) {
      return;
    }

    const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.conceptItem'));
    const otherRows = rows.filter((_, index) => index !== sourceIndex);

    clearConceptDropMarker();

    if (!otherRows.length) {
      conceptDropTargetIndexRef.current = sourceIndex;

      return;
    }

    let insertionIndex = otherRows.length;

    for (let index = 0; index < otherRows.length; index++) {
      const bounds = otherRows[index].getBoundingClientRect();

      if (pointerY < bounds.top + (bounds.height / 2)) {
        insertionIndex = index;
        break;
      }
    }

    conceptDropTargetIndexRef.current = insertionIndex;

    if (insertionIndex < otherRows.length) {
      otherRows[insertionIndex].classList.add('conceptDropBefore');
    } else {
      otherRows[otherRows.length - 1].classList.add('conceptDropAfter');
    }
  }, [clearConceptDropMarker]);

  const stopConceptAutoScroll = useCallback((): void => {
    conceptDragPointerYRef.current = undefined;

    if (conceptAutoScrollFrameRef.current !== undefined) {
      window.cancelAnimationFrame(conceptAutoScrollFrameRef.current);
      conceptAutoScrollFrameRef.current = undefined;
    }
  }, []);

  const startConceptAutoScroll = useCallback((): void => {
    if (conceptAutoScrollFrameRef.current !== undefined) {
      return;
    }

    const scroll = (): void => {
      conceptAutoScrollFrameRef.current = undefined;

      const scroller = conceptsOutputRef.current;
      const pointerY = conceptDragPointerYRef.current;

      if (!scroller || pointerY === undefined) {
        return;
      }

      const bounds = scroller.getBoundingClientRect();
      const edgeSize = Math.min(96, Math.max(48, bounds.height * 0.22));
      const topDistance = pointerY - bounds.top;
      const bottomDistance = bounds.bottom - pointerY;
      let scrollAmount = 0;

      if (topDistance < edgeSize && scroller.scrollTop > 0) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, topDistance)) / edgeSize));

        scrollAmount = -(4 + (20 * strength));
      } else if (bottomDistance < edgeSize && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, bottomDistance)) / edgeSize));

        scrollAmount = 4 + (20 * strength);
      }

      if (scrollAmount !== 0) {
        scroller.scrollTop += scrollAmount;
        updateConceptDropTarget(pointerY);
      }

      conceptAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };

    conceptAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
  }, [updateConceptDropTarget]);

  const finishConceptDrag = useCallback((): void => {
    stopConceptAutoScroll();
    draggedConceptIndexRef.current = undefined;
    conceptDropTargetIndexRef.current = undefined;
    conceptDragPointerIdRef.current = undefined;
    clearConceptDropMarker();
    conceptsOutputRef.current?.classList.remove('conceptDragging');
    conceptsOutputRef.current?.querySelector('.conceptItem.dragging')?.classList.remove('dragging');
  }, [clearConceptDropMarker, stopConceptAutoScroll]);

  const beginConceptPointerDrag = useCallback((index: number, event: React.PointerEvent<HTMLLIElement>): void => {
    if (isReorderingConcepts || isApplyingFixConceptsReview || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    const target = event.target as HTMLElement;

    // Only start reordering from the dedicated drag handle. This keeps clicks,
    // text selection, and scrolling on the title/description from starting a drag.
    if (!target.closest('.conceptDragHandle')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }

    draggedConceptIndexRef.current = index;
    conceptDropTargetIndexRef.current = index;
    conceptDragPointerIdRef.current = event.pointerId;
    conceptDragPointerYRef.current = event.clientY;
    event.currentTarget.classList.add('dragging');
    conceptsOutputRef.current?.classList.add('conceptDragging');
    updateConceptDropTarget(event.clientY);
    startConceptAutoScroll();
  }, [isApplyingFixConceptsReview, isReorderingConcepts, startConceptAutoScroll, updateConceptDropTarget]);

  const moveConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId || draggedConceptIndexRef.current === undefined) {
      return;
    }

    event.preventDefault();
    conceptDragPointerYRef.current = event.clientY;
    updateConceptDropTarget(event.clientY);
    startConceptAutoScroll();
  }, [startConceptAutoScroll, updateConceptDropTarget]);

  const cancelConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    finishConceptDrag();
  }, [finishConceptDrag]);

  const endConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const sourceIndex = draggedConceptIndexRef.current;
    const targetIndex = conceptDropTargetIndexRef.current;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore browsers that release capture automatically before pointerup.
    }

    finishConceptDrag();

    if (sourceIndex !== undefined && targetIndex !== undefined && sourceIndex !== targetIndex) {
      void reorderConcepts(sourceIndex, targetIndex);
    }
  }, [finishConceptDrag, reorderConcepts]);

  useEffect(() => finishConceptDrag, [finishConceptDrag]);

  const openConceptInsertion = useCallback((): void => {
    setNewConceptAfterIndex(concepts.length - 1);
    setIsAddingConcept(true);
  }, [concepts.length]);

  const closeConceptInsertion = useCallback((): void => {
    if (isSavingNewConcept) {
      return;
    }

    setIsAddingConcept(false);
    setNewConceptAfterIndex(-1);
    setNewConceptDescription('');
    setNewConceptPage('');
    setNewConceptTitle('');
  }, [isSavingNewConcept]);

  const conceptInsertionOptions = useMemo(() => [
    { text: 'Beginning of chapter', value: -1 },
    ...concepts.map((concept, index) => ({
      text: concept.title || `Concept ${index + 1}`,
      value: index
    }))
  ], [concepts]);

  const saveConcept = useCallback(async (concept: BookConcept, title: string, description: string, targetChapterIndex: number): Promise<void> => {
    if (concept.id === undefined) {
      setError('Unable to edit a concept without an id.');

      return;
    }

    const sourceChapterIndex = conceptChapters.findIndex((chapter) => conceptBelongsToChapter(concept, chapter));
    const resolvedSourceChapterIndex = sourceChapterIndex >= 0 ? sourceChapterIndex : conceptChapterIndex;
    const sourceChapter = conceptChapters[resolvedSourceChapterIndex];
    const targetChapter = conceptChapters[targetChapterIndex];

    if (!sourceChapter || !targetChapter) {
      setError('Unable to resolve the selected concept chapter.');

      return;
    }

    const isMovingChapter = resolvedSourceChapterIndex !== targetChapterIndex;

    if (isMovingChapter && targetChapter.chapterId === undefined) {
      setError('Unable to move the concept to a chapter without an id.');

      return;
    }

    try {
      await updateBookConcept(concept.id, { description, title });

      if (isMovingChapter) {
        const inventory = await getBookConceptInventory(book.id, pages.keys());
        const targetConcepts = conceptsForNavigationChapter(inventory, targetChapter).filter(({ id }) => id !== concept.id);
        // Moving forward puts the concept first in the new chapter; moving
        // backward puts it last. Keep bookPage unchanged as source provenance.
        const insertionIndex = conceptChapterMoveInsertionIndex(resolvedSourceChapterIndex, targetChapterIndex, targetConcepts.length);
        const preliminaryDisplayOrder = conceptInsertionDisplayOrder(targetConcepts, insertionIndex);

        await assignBookConceptsToChapters([{
          chapterId: targetChapter.chapterId as number,
          displayOrder: preliminaryDisplayOrder,
          id: concept.id
        }]);

        const targetIds = targetConcepts.flatMap(({ id }) => id === undefined ? [] : [id]);

        if (targetIds.length === targetConcepts.length) {
          targetIds.splice(insertionIndex, 0, concept.id);
          await reorderBookConcepts(targetIds, targetChapter.chapterId);
        }

        const sourceConcepts = conceptsForNavigationChapter(inventory, sourceChapter).filter(({ id }) => id !== concept.id);
        const sourceIds = sourceConcepts.flatMap(({ id }) => id === undefined ? [] : [id]);

        if (sourceIds.length === sourceConcepts.length && sourceIds.length) {
          await reorderBookConcepts(sourceIds, sourceChapter.chapterId);
        }
      }

      await reloadCurrentChapterConcepts();
      await refreshConceptCounts();
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save the concept.';

      setError(message);
      throw caught;
    }
  }, [book.id, conceptChapterIndex, conceptChapters, pages, refreshConceptCounts, reloadCurrentChapterConcepts]);
  const fixConceptWithAi = useCallback(async (concept: BookConcept): Promise<void> => {
    try {
      if (concept.id === undefined || !currentConceptChapter) {
        throw new Error('Unable to fix a Concept without its chapter context.');
      }

      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('OpenRouter API key is not configured.');
      }

      const chapterMmd = currentConceptChapter.pageNumbers.map((chapterPageNumber) => `--- page ${chapterPageNumber} ---\n${pages.get(chapterPageNumber)?.pageMMD ?? ''}`).join('\n\n');
      const client = createOpenRouterClient(key);
      const response = await runConceptRequestWithRetry(() => client.chat.completions.create({
        messages: [{ content: fixSingleConceptPrompt(currentConceptChapter.title, chapterMmd, concept, book.subject, book.language, book.age), role: 'user' }],
        model: generateAllConceptsModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addFixConceptsCost);
      const content = response.choices[0].message?.content?.trim();

      if (!content) {
        throw new Error('OpenRouter returned no single Concept repair data.');
      }

      const fixed = parseFixedConcept(content);

      if (fixed.title !== concept.title || fixed.description !== concept.description) {
        await saveConcept(concept, fixed.title, fixed.description, conceptChapterIndex);
      }

      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix the Concept with AI.');
      throw caught;
    }
  }, [addFixConceptsCost, book.age, book.language, book.subject, conceptChapterIndex, currentConceptChapter, generateAllConceptsModel, pages, saveConcept]);

  const deleteConcept = useCallback(async (concept: BookConcept): Promise<void> => {
    if (concept.id === undefined) {
      return;
    }

    try {
      await deleteConceptAndDependencies(book.id, concept, Array.from(pages.keys()));
      const referenceKey = conceptReferenceKey(concept);

      setConcepts((current) => current.filter(({ id }) => id !== concept.id));
      setConceptFirstPageByKey((current) => {
        const next = new Map(current);

        next.delete(referenceKey);

        return next;
      });
      setSkillsRefreshToken((value) => value + 1);
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to delete the concept.';

      setError(message);
      throw caught;
    }
  }, [book.id, pages, refreshConceptCounts, refreshEntityCounts]);

  const saveExercise = useCallback(async (exerciseId: number, value: ExerciseEditableFields): Promise<void> => {
    if (!currentExerciseChapter) {
      throw new Error('Unable to find the chapter containing this Exercise.');
    }

    try {
      const pageRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => ({
        exercises: await getExercisesForBookPage([book.id, chapterPageNumber]),
        pageNumber: chapterPageNumber
      })));
      const row = pageRows.find(({ exercises }) => exercises.some(({ id }) => id === exerciseId));

      if (!row) {
        throw new Error('Unable to find the page containing this Exercise.');
      }

      const originalExercises = row.exercises;
      const updatedExercises = originalExercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...value } : exercise);
      const abilityContentsByExerciseId = new Map<number, string[]>();

      await Promise.all(originalExercises.map(async ({ id }) => {
        if (id !== undefined) {
          abilityContentsByExerciseId.set(id, (await getAbilities(exerciseAbilityModuleId(book.id, id))).map(({ content }) => content));
        }
      }));

      await replaceExercisesForBookPage([book.id, row.pageNumber], updatedExercises.map(exerciseForPageReplacement));

      const storedExercises = await getExercisesForBookPage([book.id, row.pageNumber]);

      if (storedExercises.length !== originalExercises.length || storedExercises.some(({ id }) => id === undefined)) {
        throw new Error('Unable to remap Exercises after saving the edit.');
      }

      for (let index = 0; index < originalExercises.length; index++) {
        const oldId = originalExercises[index].id;
        const newId = storedExercises[index].id as number;

        if (oldId === undefined || oldId === newId) {
          continue;
        }

        const contents = abilityContentsByExerciseId.get(oldId) ?? [];

        if (contents.length) {
          await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
        }

        await deleteAbilities(exerciseAbilityModuleId(book.id, oldId));
      }

      const refreshedRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => ({
        exercises: await getExercisesForBookPage([book.id, chapterPageNumber]),
        pageNumber: chapterPageNumber
      })));

      setExerciseChapterExercises(exercisesForExerciseChapter(refreshedRows, exerciseChapterConcepts, currentExerciseChapter));
      setSkillsRefreshToken((token) => token + 1);
      await refreshEntityCounts();
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save the Exercise.';

      setError(message);
      throw caught;
    }
  }, [book.id, currentExerciseChapter, exerciseChapterConcepts, pages, refreshEntityCounts]);

  const fixExerciseWithAi = useCallback(async (exercise: Exercise): Promise<void> => {
    if (exercise.id === undefined || !currentExerciseChapter) {
      throw new Error('Unable to fix an Exercise without its chapter context.');
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('OpenRouter API key is not configured.');
    }

    const language = book.language ?? '';
    const client = createOpenRouterClient(key);
    const response = await openRouterRequestGate.run(() => client.chat.completions.create({
      messages: [
        { content: REPAIR_SYSTEM_PROMPT(language, book.age), role: 'system' },
        { content: FIX_EXERCISES_REQUEST_PROMPT(singleExerciseRepairInput(language, exercise, currentExerciseChapter.title, book.age)), role: 'user' }
      ],
      model: generateAllConceptsModel,
      response_format: { type: 'json_object' }
    }));

    reportOpenRouterCost(response, (costUsd) => addOpenRouterStageCost('fixExercises', costUsd));
    const content = response.choices[0].message?.content?.trim();

    if (!content) {
      throw new Error('OpenRouter returned no single Exercise repair data.');
    }

    const result = parseExerciseRepairResult(content, [exercise], [exercise.id]);
    const review = result.reviews.find(({ index }) => index === 0);

    if (review?.hasErrors && review.exercise) {
      await saveExercise(exercise.id, {
        description: review.exercise.description,
        imageDescription: review.exercise.imageDescription,
        solution: review.exercise.solution,
        solutionImageDescription: review.exercise.solutionImageDescription,
        title: review.exercise.title
      });
    }
  }, [addOpenRouterStageCost, book.age, book.language, currentExerciseChapter, generateAllConceptsModel, saveExercise]);

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

  const processingTotal = isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined || isEmbeddingConcepts || pendingProcessingAction === 'embeddings' || isDeduplicatingConcepts || pendingProcessingAction === 'deduplicateConcepts'
    ? 1
    : isFixingConcepts || pendingProcessingAction === 'fixConcepts'
      ? Math.max(1, fixConceptsTargetChapterCount || conceptChapters.length)
      : isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isSortingConcepts || pendingProcessingAction === 'sortConcepts' || isRefiningChapters || pendingProcessingAction === 'refineChapters' || isAssigningStandards || pendingProcessingAction === 'standards'
        ? Math.max(1, conceptChapters.length)
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
    ? `Processing chapter ${currentConceptChapter?.title || ''}`
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

  useBookStageTimer(book.id, readerProcessingStage);

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
    isAddingConcept,
    setIsAddingConcept,
    isReorderingConcepts,
    setIsReorderingConcepts,
    isSavingNewConcept,
    setIsSavingNewConcept,
    newConceptAfterIndex,
    setNewConceptAfterIndex,
    newConceptDescription,
    setNewConceptDescription,
    newConceptPage,
    setNewConceptPage,
    newConceptTitle,
    setNewConceptTitle,
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
    isDetectingBookLanguage,
    setIsDetectingBookLanguage,
    isLanguageDetectionConfirmationOpen,
    setIsLanguageDetectionConfirmationOpen,
    confirmedProcessingStage,
    setConfirmedProcessingStage,
    isDetectingBookSubject,
    setIsDetectingBookSubject,
    isDetectingBookAge,
    setIsDetectingBookAge,
    isSubjectDetectionConfirmationOpen,
    setIsSubjectDetectionConfirmationOpen,
    isAgeDetectionConfirmationOpen,
    setIsAgeDetectionConfirmationOpen,
    isGeneratingAllConcepts,
    setIsGeneratingAllConcepts,
    isGeneratingChapterConcepts,
    setIsGeneratingChapterConcepts,
    isMaximized,
    setIsMaximized,
    isMathpixKeyPromptOpen,
    setIsMathpixKeyPromptOpen,
    isPageGenerationConfirmationOpen,
    setIsPageGenerationConfirmationOpen,
    isGeneratingAllExercises,
    setIsGeneratingAllExercises,
    isRecognizingAll,
    setIsRecognizingAll,
    mathpixApiKey,
    setMathpixApiKey,
    openRouterSpent,
    setOpenRouterSpent,
    recognizedPageCount,
    setRecognizedPageCount,
    hasRecognitionBeenAttempted,
    setHasRecognitionBeenAttempted,
    revealedPanes,
    setRevealedPanes,
    generatedExercisesPageCount,
    setGeneratedExercisesPageCount,
    recognitionTarget,
    setRecognitionTarget,
    processingPage,
    setProcessingPage,
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
    selectedLanguageModel,
    setSelectedLanguageModel,
    selectedSubjectModel,
    setSelectedSubjectModel,
    selectedAgeModel,
    setSelectedAgeModel,
    autoRunProgress,
    setAutoRunProgress,
    autoRunProcessing,
    setAutoRunProcessing,
    lastReaderProcessing,
    setLastReaderProcessing,
    readerProcessingAbortControllerRef,
    skillsAutoRunAbortRef,
    selectedPipelineKey,
    setSelectedPipelineKey,
    ageInput,
    setAgeInput,
    skillsRefreshToken,
    setSkillsRefreshToken,
    totalPages,
    setTotalPages,
    canvasRef,
    isDetectingBookLanguageRef,
    isDetectingBookSubjectRef,
    isDetectingBookAgeRef,
    pageAreaRef,
    conceptsOutputRef,
    exerciseConceptsOutputRef,
    standardsChapterOutputRef,
    pendingConceptChapterFocusRef,
    pendingExerciseChapterFocusRef,
    pendingStandardsChapterFocusRef,
    draggedConceptIndexRef,
    conceptDropTargetIndexRef,
    conceptDragPointerIdRef,
    conceptDragPointerYRef,
    conceptAutoScrollFrameRef,
    reorderedConceptFocusIdRef,
    currentReaderProcessingSignal,
    addStageCost,
    addOpenRouterStageCost,
    addRecognizeExternalCall,
    addRecognizeCost,
    addLanguageCost,
    addSubjectCost,
    addAgeCost,
    addChaptersCost,
    addConceptsCost,
    addFixConceptsCost,
    addEmbeddingsCost,
    addDeduplicateConceptsCost,
    addSortConceptsCost,
    addRefineChaptersCost,
    addExercisesCost,
    addStandardsCost,
    conceptChapters,
    loadDeduplicateConceptInventory,
    loadConceptCountsByChapter,
    refreshConceptCounts,
    currentConceptChapter,
    currentStandardsChapter,
    currentStandardsChapterKey,
    standardDescriptions,
    embeddingBookEntries,
    embeddingChapterEntries,
    embeddingMissingCount,
    embeddingHeatmapEntries,
    embeddingHeatmapDistances,
    chapterGenerationEstimate,
    languageDetectionEstimate,
    subjectDetectionEstimate,
    ageSamplePageNumbers,
    ageSamplePageTexts,
    ageDetectionEstimate,
    exerciseChapters,
    currentExerciseChapter,
    refreshEntityCounts,
    onSkillsEntityCountsChange,
    onSkillsContentChange,
    changeExerciseChapter,
    changeStandardsChapter,
    revealPane,
    completeStage,
    completeStageRef,
    currentBookPage,
    currentChapter,
    refreshChapterAssignments,
    openChapterEditor,
    closeChapterEditor,
    refreshAfterChapterRename,
    toggleChapterSelection,
    synchronizeChapterProcessingStage,
    deleteSelectedChapters,
    saveCurrentChapterTitle,
    assignCurrentPageToChapter,
    startChapterHere,
    mergeCurrentChapterWithPrevious,
    identifyChapters,
    generateConcepts,
    closePageGenerationConfirmation,
    confirmPageGeneration,
    generateAllConcepts,
    fixAllConcepts,
    discardFixConceptsReview,
    removeFixConceptsReviewConcept,
    toggleFixConceptsReviewRemoval,
    applyFixConceptsReview,
    embedAllConcepts,
    deduplicateAllConcepts,
    discardDeduplicateConceptsReview,
    toggleDeduplicateConceptDeletion,
    applyDeduplicateConceptsReview,
    sortAllConcepts,
    refineAllChapters,
    generateAllExercises,
    detectAndStoreBookLanguage,
    saveManualBookLanguage,
    isMmdConversionComplete,
    redetectBookLanguage,
    openLanguageDetectionConfirmation,
    closeLanguageDetectionConfirmation,
    confirmLanguageDetection,
    detectAndStoreBookSubject,
    saveManualBookSubject,
    redetectBookSubject,
    openSubjectDetectionConfirmation,
    closeSubjectDetectionConfirmation,
    confirmSubjectDetection,
    detectAndStoreBookAge,
    saveManualBookAge,
    redetectBookAge,
    openAgeDetectionConfirmation,
    closeAgeDetectionConfirmation,
    confirmAgeDetection,
    recognizePage,
    recognizeAllPages,
    saveMathpixApiKey,
    submitMathpixApiKey,
    closeMathpixKeyPrompt,
    assignStandards,
    goToPage,
    changeConceptChapter,
    loadCurrentChapterConcepts,
    reloadCurrentChapterConcepts,
    addConcept,
    reorderConcepts,
    clearConceptDropMarker,
    updateConceptDropTarget,
    stopConceptAutoScroll,
    startConceptAutoScroll,
    finishConceptDrag,
    beginConceptPointerDrag,
    moveConceptPointerDrag,
    cancelConceptPointerDrag,
    endConceptPointerDrag,
    openConceptInsertion,
    closeConceptInsertion,
    conceptInsertionOptions,
    saveConcept,
    fixConceptWithAi,
    deleteConcept,
    saveExercise,
    fixExerciseWithAi,
    submitPageInput,
    unrecognizedPageNumbers,
    isCurrentPageUnrecognized,
    showUnrecognizedPages,
    rerecognizePage,
    processingTotal,
    processingValue,
    processingLabel,
    readerProcessingStage,
    hasReaderProcessing,
    readerProcessing,
    processingPopupStatus,
    onAutoRunAbortReady,
    abortProcessing,
  } as const;
}

export type { Props } from './BookReaderUtils.js';
export type BookReaderController = ReturnType<typeof useBookReaderController>;
