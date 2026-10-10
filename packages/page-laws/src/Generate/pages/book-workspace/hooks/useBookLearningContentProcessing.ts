// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage, BookProcessingStageKey } from '@slonigiraf/db';
import { getSetting, isBookProcessingStageComplete, SettingKey } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../../openrouter/concurrency.js';
import { DEFAULT_STANDARDS_MODEL } from '../../../book/application/config.js';
import { type ConceptChapterNavigationItem } from '../../../book/domain/concepts/conceptRecognition.js';
import { hasChapterStandards, needsChapterStandardsIdentification, standardsChapterKey, standardsConceptFingerprint, standardsConceptInputs, standardsPathForBookSubject, type StoredBookStandards } from '../../../book/domain/standards/standards.js';
import { loadStandardsCatalogsForBookSubject } from '../../../book/infrastructure/standards/standardsCatalog.js';
import { cachedConceptEmbeddingMap, ensureStandardEmbeddingCache } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
import { createOpenRouterClient, getChapterStandardsConceptRows, requestChapterStandards } from '../../../book/application/workspace/bookReaderProcessing.js';
import { getBookConceptInventory } from '../../../book/application/workspace/bookReaderWorkspace.js';
import { storeBookStandards } from '../../../book/infrastructure/storage/standardsStorage.js';
import { type ReaderPane } from '../../../shared/types/bookWorkspace.js';

interface UseBookLearningContentProcessingOptions {
  addStandardsCost: (costUsd: number) => void;
  book: Book;
  completeStage: (stage: BookProcessingStageKey) => Promise<void>;
  conceptChapters: ConceptChapterNavigationItem[];
  currentReaderProcessingSignal: () => AbortSignal;
  embeddingModel: string;
  isAssigningStandards: boolean;
  pages: Map<number, BookPage>;
  revealPane: (pane: ReaderPane) => void;
  setConceptEmbeddingsRefreshToken: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
  setIsAssigningStandards: Dispatch<SetStateAction<boolean>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setStandardsAssignedChapterCount: Dispatch<SetStateAction<number>>;
  setStandardsTargetChapterCount: Dispatch<SetStateAction<number>>;
  setStandardsByChapter: Dispatch<SetStateAction<StoredBookStandards>>;
  standardsByChapter: StoredBookStandards;
  standardsModel: string;
}

export function useBookLearningContentProcessing ({
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
}: UseBookLearningContentProcessingOptions) {
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
    setStandardsTargetChapterCount(0);
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

      // Determine the chapters to retry before making expensive OpenRouter calls.
      // Preserve successful chapter mappings, even on a partial run.
      const requests = conceptChapters.map((chapter) => {
        const rows = getChapterStandardsConceptRows(conceptInventory, chapter);
        const concepts = standardsConceptInputs(rows);
        const fingerprint = standardsConceptFingerprint(concepts, standardsPathForBookSubject(book.subject) ?? 'no-standards');
        const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);

        return { chapter, chapterKey, concepts, fingerprint, rows };
      }).filter(({ chapterKey, fingerprint }) => needsChapterStandardsIdentification(standardsByChapter[chapterKey], fingerprint, force));

      setStandardsTargetChapterCount(requests.length);

      if (!requests.length) {
        await completeStage('standards');
        revealPane('standards');
        return;
      }

      const standardEmbeddings = await ensureStandardEmbeddingCache(client, embeddingModel, catalogs, addStandardsCost);

      setConceptEmbeddingsRefreshToken((token) => token + 1);
      const results = await mapConcurrent(requests, OPENROUTER_CONCURRENCY, async ({ chapter, chapterKey, concepts, fingerprint, rows }) => {
        try {
          const chapterEmbeddings = rows.flatMap(({ id }) => id === undefined ? [] : (conceptEmbeddings.get(id) ? [conceptEmbeddings.get(id) as number[]] : []));
          const standards = await requestChapterStandards(client, standardsModel || DEFAULT_STANDARDS_MODEL, chapter.title, concepts, chapterEmbeddings, catalogs, standardEmbeddings, addStandardsCost);

          return { chapterKey, entry: { conceptFingerprint: fingerprint, standards }, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapterKey, reason, status: 'rejected' as const };
        } finally {
          setStandardsAssignedChapterCount((count) => count + 1);
        }
      });
      const next = { ...standardsByChapter };
      let failures = 0;
      let succeeded = 0;

      results.forEach((result) => {
        if (result.status === 'rejected') {
          failures++;
        } else {
          succeeded++;
          next[result.chapterKey] = result.entry;
        }
      });

      setStandardsByChapter(next);
      storeBookStandards(book.id, next);
      revealPane('standards');

      // A partial run is successful: available mappings remain usable, and
      // missing chapters are clearly marked for a targeted retry.
      if (succeeded || conceptChapters.some((chapter) => hasChapterStandards(next[standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers)]))) {
        await completeStage('standards');
      }

      if (failures) {
        setError(`${failures} of ${requests.length} chapter${requests.length === 1 ? '' : 's'} could not have standards identified. Successful chapters were saved. Retry only chapters missing standards.`);
      }
    } finally {
      setIsAssigningStandards(false);
    }
  }, [currentReaderProcessingSignal, addStandardsCost, completeStage, book, book.id, book.subject, conceptChapters, embeddingModel, isAssigningStandards, pages, revealPane, standardsByChapter, standardsModel]);


  return { assignStandards } as const;
}
