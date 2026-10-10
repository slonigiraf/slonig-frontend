// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from 'react';

import type { BookProcessingRunnerState } from './bookProcessingCommand.js';
import type { BookReaderCommandAction } from './bookPipeline.js';

import { bookProcessingManager } from './bookProcessingManager.js';

interface UseBookProcessingRunnerOptions extends BookProcessingRunnerState {
  bookId: number;
  assignStandards: (force?: boolean) => Promise<void>;
  deduplicateAllConcepts: (model: string) => Promise<void>;
  embedAllConcepts: () => Promise<void>;
  fixAllConcepts: (model: string, onlyFailed: boolean) => Promise<void>;
  fixOnlyFailedConcepts: boolean;
  generateAllConcepts: () => Promise<void>;
  generateAllConceptsModel: string;
  generateOnlyMissingStandards: boolean;
  identifyChapters: () => Promise<void>;
  onProcessingComplete: () => void;
  openAgeDetectionConfirmation: () => void;
  openLanguageDetectionConfirmation: () => void;
  openSubjectDetectionConfirmation: () => void;
  recognizeAllPages: () => Promise<void>;
  refineAllChapters: (model: string) => Promise<void>;
  setActivePane: (pane: 'text') => void;
  setError: (message: string) => void;
  sortAllConcepts: (model: string) => Promise<void>;
}

export function useBookProcessingRunner (options: UseBookProcessingRunnerOptions): void {
  // Fresh UI callbacks are adapters only; the queue, run and abort signal have
  // module lifetime. An executing promise captures its adapter across unmount.
  const latest = useRef(options);

  latest.current = options;
  const { bookId } = options;

  useEffect(() => bookProcessingManager.registerReader(bookId, () => {
    const current = latest.current;
    const state: BookProcessingRunnerState = {
      ageSamplePageCount: current.ageSamplePageCount,
      ageSampleTextCount: current.ageSampleTextCount,
      conceptChapterCount: current.conceptChapterCount,
      isAssigningStandards: current.isAssigningStandards,
      isDeduplicatingConcepts: current.isDeduplicatingConcepts,
      isEmbeddingConcepts: current.isEmbeddingConcepts,
      isFixingConcepts: current.isFixingConcepts,
      isGeneratingAllConcepts: current.isGeneratingAllConcepts,
      isIdentifyingChapters: current.isIdentifyingChapters,
      isMmdConversionComplete: current.isMmdConversionComplete,
      isRecognizingAll: current.isRecognizingAll,
      isRefiningChapters: current.isRefiningChapters,
      isSortingConcepts: current.isSortingConcepts,
      processingPage: current.processingPage,
      totalPages: current.totalPages
    };

    const execute = async (action: BookReaderCommandAction): Promise<void> => {
      const o = latest.current;

      try {
        switch (action) {
          case 'language': o.openLanguageDetectionConfirmation(); return;
          case 'subject': o.openSubjectDetectionConfirmation(); return;
          case 'age': o.openAgeDetectionConfirmation(); return;
          case 'concepts': await o.generateAllConcepts(); return;
          case 'fixConcepts': await o.fixAllConcepts(o.generateAllConceptsModel, o.fixOnlyFailedConcepts); break;
          case 'embeddings': await o.embedAllConcepts(); break;
          case 'deduplicateConcepts': await o.deduplicateAllConcepts(o.generateAllConceptsModel); break;
          case 'sortConcepts': await o.sortAllConcepts(o.generateAllConceptsModel); break;
          case 'refineChapters': await o.refineAllChapters(o.generateAllConceptsModel); break;
          case 'chapters': await o.identifyChapters(); return;
          case 'recognize': o.setActivePane('text'); await o.recognizeAllPages(); return;
          case 'standards': await o.assignStandards(!o.generateOnlyMissingStandards); break;
        }
      } catch (error) {
        o.setError(error instanceof Error ? error.message : `Unable to process ${action}.`);
        if (['concepts', 'chapters', 'recognize'].includes(action)) {
          o.onProcessingComplete();
        }
        if (bookProcessingManager.getSnapshot(bookId)?.status === 'running') {
          bookProcessingManager.fail(bookId, error instanceof Error ? error.message : `Unable to process ${action}.`);
        }
      } finally {
        // Recognition, chapter identification and concept generation already
        // notify their callers from their respective controllers.
        if (!['language', 'subject', 'age', 'concepts', 'chapters', 'recognize'].includes(action)) {
          o.onProcessingComplete();
        }
      }
    };

    return { execute, state };
  }), [bookId]);

  // Commands can arrive before PDF/page/metadata hydration is ready. The
  // manager retains them until a subsequent render makes the stage executable.
  useEffect(() => bookProcessingManager.pulse(bookId));
}
