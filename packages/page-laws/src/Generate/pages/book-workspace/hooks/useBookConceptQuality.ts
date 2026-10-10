// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, BookProcessingStageKey } from '@slonigiraf/db';
import { completeBookProcessingStage, createBookConcept, getBookConceptsForBookPage, getSetting, incrementBookFixConceptsAttempts, isBookProcessingStageComplete, SettingKey, withCompletedBookProcessingStage } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect } from 'react';
import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../../openrouter/concurrency.js';
import type { ConceptChapterNavigationItem } from '../../../book/domain/concepts/conceptRecognition.js';
import { combineDeduplicateConceptPairs, DEDUPLICATE_CONCEPTS_RUNS, deduplicateConceptCandidatesAcrossChapters, deduplicateConceptCandidatesWithinChapters, type DeduplicateConceptInput, type DeduplicateConceptPair } from '../../../book/domain/concepts/deduplicateConcepts.js';
import { chapterLevelMissingConcept, combineFixChapterConceptsResults, FIX_CONCEPTS_RUNS, type FixChapterConceptsResult } from '../../../book/domain/concepts/fixConcepts.js';
import { cachedConceptEmbeddingMap, ensureConceptEmbeddingCache } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
import { fixConceptsChapterKey, loadFixConceptsChapterStatuses, storeFixConceptsChapterStatuses, type FixConceptsChapterStatuses } from '../../../book/infrastructure/storage/fixConceptsProgress.js';
import { conceptGenerationErrorMessage, createOpenRouterClient, requestDeduplicateConceptPairs, requestMissingChapterConcepts } from '../../../book/application/workspace/bookReaderProcessing.js';
import { conceptReferenceKey, conceptsForNavigationChapter, deleteConceptAndDependencies, getBookConceptInventory, sortConceptsForDisplay } from '../../../book/application/workspace/bookReaderWorkspace.js';
import { type DeduplicateConceptsReview, type DeduplicateConceptsReviewPair, type FixConceptsReview, type FixConceptsReviewChapter } from '../BookReaderTypes.js';
import { type ReaderPane } from '../../../shared/types/bookWorkspace.js';

interface DeduplicateInventory {
  conceptsById: Map<number, BookConcept>;
  inputs: DeduplicateConceptInput[];
}

interface UseBookConceptQualityOptions {
  addDeduplicateConceptsCost: (costUsd: number) => void;
  addEmbeddingsCost: (costUsd: number) => void;
  addFixConceptsCost: (costUsd: number) => void;
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
  isApplyingDeduplicateConceptsReview: boolean;
  isApplyingFixConceptsReview: boolean;
  isDeduplicatingConcepts: boolean;
  isEmbeddingConcepts: boolean;
  isFixingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isIdentifyingChapters: boolean;
  isRecognizingAll: boolean;
  isSortingConcepts: boolean;
  loadDeduplicateConceptInventory: () => Promise<DeduplicateInventory>;
  onBookChange: (book: Book) => void;
  onProcessingComplete: () => void;
  pages: Map<number, BookPage>;
  refreshConceptCounts: () => Promise<void>;
  refreshEntityCounts: () => Promise<void>;
  revealPane: (pane: ReaderPane) => void;
  setConceptEmbeddingsRefreshToken: Dispatch<SetStateAction<number>>;
  setConceptFirstPageByKey: Dispatch<SetStateAction<Map<string, number>>>;
  setConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setDeduplicateConceptsReview: Dispatch<SetStateAction<DeduplicateConceptsReview | undefined>>;
  setEmbeddingByConceptId: Dispatch<SetStateAction<Map<number, number[]>>>;
  setEmbeddingConceptInventory: Dispatch<SetStateAction<BookConcept[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setFixedConceptsChapterCount: Dispatch<SetStateAction<number>>;
  setFixConceptsChapterStatuses: Dispatch<SetStateAction<FixConceptsChapterStatuses>>;
  setFixConceptsReview: Dispatch<SetStateAction<FixConceptsReview | undefined>>;
  setFixConceptsReviewChapterIndex: Dispatch<SetStateAction<number>>;
  setFixConceptsTargetChapterCount: Dispatch<SetStateAction<number>>;
  setIsApplyingDeduplicateConceptsReview: Dispatch<SetStateAction<boolean>>;
  setIsApplyingFixConceptsReview: Dispatch<SetStateAction<boolean>>;
  setIsDeduplicatingConcepts: Dispatch<SetStateAction<boolean>>;
  setIsEmbeddingConcepts: Dispatch<SetStateAction<boolean>>;
  setIsFixingConcepts: Dispatch<SetStateAction<boolean>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
}

export function useBookConceptQuality ({
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
}: UseBookConceptQualityOptions) {
  const fixAllConcepts = useCallback(async (model = generateAllConceptsModel, onlyFailed = false): Promise<void> => {
    if (!conceptChapters.length || isFixingConcepts || isDeduplicatingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || fixConceptsReview || deduplicateConceptsReview) {
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
    setFixConceptsTargetChapterCount(targetChapters.length * FIX_CONCEPTS_RUNS);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
      const results = await mapConcurrent(targetChapters, OPENROUTER_CONCURRENCY, async (chapter) => {
        const before = sortConceptsForDisplay([
          ...(await Promise.all(chapter.pageNumbers.map((chapterPageNumber) => getBookConceptsForBookPage(book.id, chapterPageNumber)))).flat(),
          ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.chapterId)
        ]);
        const chapterMmd = chapter.pageNumbers.map((chapterPageNumber) => `--- page ${chapterPageNumber} ---\n${pages.get(chapterPageNumber)?.pageMMD ?? ''}`).join('\n\n');
        const fixesByPass: FixChapterConceptsResult[] = [];
        const passFailures: string[] = [];

        // Run independent passes against the same unsaved inventory for higher recall.
        for (let passIndex = 0; passIndex < FIX_CONCEPTS_RUNS; passIndex++) {
          try {
            fixesByPass.push(await requestMissingChapterConcepts(client, model, chapter.title, chapterMmd, before, chapter.pageNumbers, book, addFixConceptsCost));
          } catch (reason) {
            passFailures.push(`Pass ${passIndex + 1}: ${conceptGenerationErrorMessage(reason)}`);
          } finally {
            setFixedConceptsChapterCount((count) => count + 1);
          }
        }

        if (!fixesByPass.length) {
          return { chapter, reason: passFailures.join(' | '), status: 'rejected' as const };
        }

        const fixes = combineFixChapterConceptsResults(fixesByPass);
        const removed = fixes.removeConceptIndexes.flatMap((conceptIndex): BookConcept[] => {
          const concept = before[conceptIndex];

          return concept?.id === undefined ? [] : [concept];
        });

        return { before, chapter, missing: fixes.concepts, removed, status: 'fulfilled' as const };
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
  }, [currentReaderProcessingSignal, addFixConceptsCost, book, conceptChapters, deduplicateConceptsReview, fixConceptsReview, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pages, revealPane]);

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
            await createBookConcept(chapterLevelMissingConcept(book.id, chapter.chapterId, concept, attempt, book.language));
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
    if (isEmbeddingConcepts || isDeduplicatingConcepts || isFixingConcepts || isSortingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || fixConceptsReview || deduplicateConceptsReview) {
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
  }, [currentReaderProcessingSignal, addEmbeddingsCost, book, completeStage, deduplicateConceptsReview, embeddingModel, fixConceptsReview, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, pages, revealPane]);

  const deduplicateAllConcepts = useCallback(async (model = generateAllConceptsModel): Promise<void> => {
    if (isDeduplicatingConcepts || isEmbeddingConcepts || isFixingConcepts || isSortingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || fixConceptsReview || deduplicateConceptsReview) {
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

      const inputsByChapter = new Map<number, DeduplicateConceptInput[]>();

      inputs.forEach((input) => inputsByChapter.set(input.chapterId, [...(inputsByChapter.get(input.chapterId) ?? []), input]));

      const runDeduplicateReview = async (): Promise<DeduplicateConceptPair[]> => {
        // Phase 1: confirm duplicate candidates independently inside each
        // chapter. This removes local repetition before the cross-book search.
        const withinChapterPairs = (await mapConcurrent(Array.from(inputsByChapter.values()), OPENROUTER_CONCURRENCY, async (chapterInputs): Promise<DeduplicateConceptPair[]> => {
          if (chapterInputs.length < 2) {
            return [];
          }

          const candidates = deduplicateConceptCandidatesWithinChapters(chapterInputs, embeddings);

          return candidates.length
            ? requestDeduplicateConceptPairs(client, model, chapterInputs, candidates, book, addDeduplicateConceptsCost)
            : [];
        })).flat();
        const deletedWithinChapterIds = new Set(withinChapterPairs.map(({ deletedConceptId }) => deletedConceptId));
        const survivingInputs = inputs.filter(({ conceptId }) => !deletedWithinChapterIds.has(conceptId));

        // Phase 2: compare only local survivors across different chapters.
        const crossChapterCandidates = deduplicateConceptCandidatesAcrossChapters(survivingInputs, embeddings);
        const crossChapterPairs = crossChapterCandidates.length
          ? await requestDeduplicateConceptPairs(client, model, survivingInputs, crossChapterCandidates, book, addDeduplicateConceptsCost)
          : [];

        return [...withinChapterPairs, ...crossChapterPairs];
      };
      const reviewRuns: DeduplicateConceptPair[][] = [];

      // Run the complete duplicate review twice against the same unsaved
      // inventory, then merge both result graphs before showing one popup.
      for (let runIndex = 0; runIndex < DEDUPLICATE_CONCEPTS_RUNS; runIndex++) {
        reviewRuns.push(await runDeduplicateReview());
      }

      const duplicatePairs = combineDeduplicateConceptPairs(reviewRuns, inputs);
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
  }, [currentReaderProcessingSignal, addDeduplicateConceptsCost, book, deduplicateConceptsReview, embeddingModel, fixConceptsReview, generateAllConceptsModel, isDeduplicatingConcepts, isEmbeddingConcepts, isFixingConcepts, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isSortingConcepts, loadDeduplicateConceptInventory, revealPane]);

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


  return {
    fixAllConcepts,
    discardFixConceptsReview,
    removeFixConceptsReviewConcept,
    toggleFixConceptsReviewRemoval,
    applyFixConceptsReview,
    embedAllConcepts,
    deduplicateAllConcepts,
    discardDeduplicateConceptsReview,
    toggleDeduplicateConceptDeletion,
    applyDeduplicateConceptsReview
  };
}
