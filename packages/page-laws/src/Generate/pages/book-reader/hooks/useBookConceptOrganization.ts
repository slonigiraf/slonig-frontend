// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, BookProcessingStageKey } from '@slonigiraf/db';
import { applyBookChapterRefinements, completeBookProcessingStage, getBookConceptsForBookPage, getSetting, SettingKey, updateBookConcept, withBookProcessingStagesResetFrom } from '@slonigiraf/db';
import OpenAI from 'openai';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../../openrouter/concurrency.js';
import { conceptsForRefinementChapter, hasPersistedRefinedConceptMembership, refinedChapterSplitPages, withRefineChaptersComplete } from '../../../book/processing/chapters/refineChapters.js';
import type { ConceptChapterNavigationItem } from '../../../book/processing/concepts/conceptRecognition.js';
import { assertDisjointSortChapterConcepts, conceptsForSortChapter } from '../../../book/processing/concepts/sortConcepts.js';
import { conceptGenerationErrorMessage, createOpenRouterClient, requestRefinedChapterGroups, requestSortedChapterConceptIndexes } from '../BookReaderProcessing.js';
import { conceptReferenceKey, conceptsForNavigationChapter, getBookConceptInventory, type DeduplicateConceptsReview, type FixConceptsReview, type ReaderPane } from '../BookReaderUtils.js';

interface UseBookConceptOrganizationOptions {
  addRefineChaptersCost: (costUsd: number) => void;
  addSortConceptsCost: (costUsd: number) => void;
  book: Book;
  completeStage: (stage: BookProcessingStageKey) => Promise<void>;
  conceptChapters: ConceptChapterNavigationItem[];
  currentConceptChapter?: ConceptChapterNavigationItem;
  currentReaderProcessingSignal: () => AbortSignal;
  deduplicateConceptsReview?: DeduplicateConceptsReview;
  fixConceptsReview?: FixConceptsReview;
  generateAllConceptsModel: string;
  isDeduplicatingConcepts: boolean;
  isEmbeddingConcepts: boolean;
  isFixingConcepts: boolean;
  isGeneratingAllConcepts: boolean;
  isGeneratingAllExercises: boolean;
  isIdentifyingChapters: boolean;
  isRecognizingAll: boolean;
  isRefiningChapters: boolean;
  isSortingConcepts: boolean;
  onBookChange: (book: Book) => void;
  pages: Map<number, BookPage>;
  refreshChapterAssignments: () => Promise<void>;
  refreshConceptCounts: () => Promise<void>;
  refreshEntityCounts: () => Promise<void>;
  revealPane: (pane: ReaderPane) => void;
  setConceptFirstPageByKey: Dispatch<SetStateAction<Map<string, number>>>;
  setConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setIsRefiningChapters: Dispatch<SetStateAction<boolean>>;
  setIsSortingConcepts: Dispatch<SetStateAction<boolean>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setRefinedChaptersChapterCount: Dispatch<SetStateAction<number>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
  setSortedConceptsChapterCount: Dispatch<SetStateAction<number>>;
}

export function useBookConceptOrganization ({
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
  isGeneratingAllExercises,
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
}: UseBookConceptOrganizationOptions) {
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


  return {
    sortAllConcepts,
    refineAllChapters
  };
}
