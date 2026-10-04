// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookStageSpendKey } from '@slonigiraf/db';
import { addBookStageSpend } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { addBookExternalCall, type BookExternalCallProvider } from '../../../book/infrastructure/storage/bookExternalCalls.js';
import { REFINE_CHAPTERS_SPEND_STAGE } from '../../../book/domain/chapters/refineChapters.js';

interface UseBookReaderCostsOptions {
  bookId: number;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
}

export function useBookReaderCosts ({ bookId, setOpenRouterSpent }: UseBookReaderCostsOptions) {
  const addStageCost = useCallback((stage: BookStageSpendKey, costUsd: number): void => {
    setOpenRouterSpent((current) => current + costUsd);
    void addBookStageSpend(bookId, stage, costUsd).catch(console.error);
  }, [bookId, setOpenRouterSpent]);
  const addOpenRouterStageCost = useCallback((stage: BookStageSpendKey, costUsd: number): void => {
    addBookExternalCall(bookId, stage, 'openrouter');
    addStageCost(stage, costUsd);
  }, [addStageCost, bookId]);
  const addRecognizeExternalCall = useCallback((provider: Exclude<BookExternalCallProvider, 'openrouter'>): void => {
    addBookExternalCall(bookId, 'recognize', provider);
  }, [bookId]);
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

  return {
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
    addStageCost,
    addStandardsCost,
    addSubjectCost
  } as const;
}
