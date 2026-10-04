// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage } from '@slonigiraf/db';
import { getAbilities, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, isBookProcessingStageComplete } from '@slonigiraf/db';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo } from 'react';
import { estimateAiInput } from '../../../book/application/pricing/aiEstimate.js';
import { conceptBelongsToChapter } from '../../../book/domain/chapters/refineChapters.js';
import { conceptChaptersFromPages, type ConceptChapterNavigationItem } from '../../../book/domain/concepts/conceptRecognition.js';
import { conceptDeduplicationInput, type DeduplicateConceptInput } from '../../../book/domain/concepts/deduplicateConcepts.js';
import { cachedConceptEmbeddingMap } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
import { standardsChapterKey, type StandardsCatalog, type StoredBookStandards } from '../../../book/domain/standards/standards.js';
import { loadStandardsCatalogsForBookSubject } from '../../../book/infrastructure/standards/standardsCatalog.js';
import { loadStoredBookStandards } from '../../../book/infrastructure/storage/standardsStorage.js';
import { resolveSharedChapterIndex, type SharedChapterSelection } from '../../../book/domain/chapters/chapterSelection.js';
import { getSharedChapterSelection, storeSharedChapterSelection, subscribeSharedChapterSelection } from '../../../book/infrastructure/storage/chapterSelectionStorage.js';
import { clearFixConceptsChapterStatuses, fixConceptsChapterKey, storeFixConceptsChapterStatuses, type FixConceptsChapterStatuses } from '../../../book/infrastructure/storage/fixConceptsProgress.js';
import { conceptEmbeddingDistanceMatrix, conceptsForNavigationChapter, exerciseAbilityModuleId, getBookConceptInventory } from '../../../book/application/workspace/bookReaderWorkspace.js';
import { exerciseChapterSessionKey, readerMaximizedSessionKey, readerPaneSessionKey } from '../../../book/infrastructure/storage/bookReaderSession.js';
import { type ConceptEmbeddingHeatmapEntry, type ExerciseChapterNavigationItem, type ReaderEntityCounts, type ReaderPane } from '../../../shared/types/bookWorkspace.js';
interface UseBookReaderNavigationModelOptions {
  activePane: ReaderPane;
  book: Book;
  conceptChapterIndex: number;
  conceptEmbeddingsRefreshToken: number;
  embeddingByConceptId: Map<number, number[]>;
  embeddingConceptInventory: BookConcept[];
  embeddingHeatmapMode: 'book' | 'chapter';
  embeddingModel: string;
  exerciseChapterIndex: number;
  isMaximized: boolean;
  pages: Map<number, BookPage>;
  pendingExerciseChapterFocusRef: MutableRefObject<boolean>;
  pendingStandardsChapterFocusRef: MutableRefObject<boolean>;
  selectedModel: string;
  setActivePane: Dispatch<SetStateAction<ReaderPane>>;
  setConceptChapterIndex: Dispatch<SetStateAction<number>>;
  setConceptCountsByChapter: Dispatch<SetStateAction<Map<string, number>>>;
  setEmbeddingByConceptId: Dispatch<SetStateAction<Map<number, number[]>>>;
  setEmbeddingConceptInventory: Dispatch<SetStateAction<BookConcept[]>>;
  setEntityCounts: Dispatch<SetStateAction<ReaderEntityCounts>>;
  setExerciseChapterIndex: Dispatch<SetStateAction<number>>;
  setFixConceptsChapterStatuses: Dispatch<SetStateAction<FixConceptsChapterStatuses>>;
  setIsEmbeddingHeatmapLoading: Dispatch<SetStateAction<boolean>>;
  setRevealedPanes: Dispatch<SetStateAction<Set<ReaderPane>>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
  setStandardsByChapter: Dispatch<SetStateAction<StoredBookStandards>>;
  setStandardsCatalogs: Dispatch<SetStateAction<StandardsCatalog[]>>;
  setStandardsChapterIndex: Dispatch<SetStateAction<number>>;
  standardsCatalogs: StandardsCatalog[];
  standardsChapterIndex: number;
  totalPages: number;
}

export function useBookReaderNavigationModel ({
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
}: UseBookReaderNavigationModelOptions) {
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


  return {
    changeExerciseChapter,
    changeStandardsChapter,
    chapterGenerationEstimate,
    conceptChapters,
    currentConceptChapter,
    currentExerciseChapter,
    currentStandardsChapter,
    currentStandardsChapterKey,
    embeddingBookEntries,
    embeddingChapterEntries,
    embeddingHeatmapDistances,
    embeddingHeatmapEntries,
    embeddingMissingCount,
    exerciseChapters,
    loadConceptCountsByChapter,
    loadDeduplicateConceptInventory,
    onSkillsContentChange,
    onSkillsEntityCountsChange,
    refreshConceptCounts,
    refreshEntityCounts,
    revealPane,
    standardDescriptions
  } as const;
}
