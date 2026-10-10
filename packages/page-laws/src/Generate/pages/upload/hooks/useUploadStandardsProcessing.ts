// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import { getBookConceptsForBookPage, getBookPages, getConceptEmbeddings, getStandardEmbeddings, isBookProcessingStageComplete, resetBookProcessingStagesFrom } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { AiInputEstimate } from '../../../book/application/pricing/aiEstimate.js';
import type { BookReaderCommandAction, PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';

import { estimateAiInput } from '../../../book/application/pricing/aiEstimate.js';
import { conceptBelongsToChapter } from '../../../book/domain/chapters/refineChapters.js';
import { conceptChaptersFromPages } from '../../../book/domain/concepts/conceptRecognition.js';
import { needsChapterStandardsIdentification, STANDARDS_MATCH_RUNS, standardsCandidatesFromEmbeddings, standardsChapterKey, standardsConceptFingerprint, standardsConceptInputs, standardsMatchingPrompt, standardsPathForBookSubject, standardEmbeddingInput } from '../../../book/domain/standards/standards.js';
import { loadStandardsCatalogsForBookSubject } from '../../../book/infrastructure/standards/standardsCatalog.js';
import { conceptEmbeddingInput } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
import { loadStoredBookStandards } from '../../../book/infrastructure/storage/standardsStorage.js';
import { useTranslation } from '../../../../common/translate.js';

function combineAiEstimates (...estimates: AiInputEstimate[]): AiInputEstimate {
  return estimates.reduce<AiInputEstimate>((total, estimate) => ({
    inputPriceUsd: total.inputPriceUsd + estimate.inputPriceUsd,
    inputTokens: total.inputTokens + estimate.inputTokens,
    outputPriceUsd: total.outputPriceUsd + estimate.outputPriceUsd,
    outputTokens: total.outputTokens + estimate.outputTokens,
    requests: total.requests + estimate.requests,
    totalPriceUsd: total.totalPriceUsd + estimate.totalPriceUsd
  }), { inputPriceUsd: 0, inputTokens: 0, outputPriceUsd: 0, outputTokens: 0, requests: 0, totalPriceUsd: 0 });
}

interface UploadStandardsProcessingParams {
  embeddingModel: string;
  requestProcessing: (action: BookReaderCommandAction) => void;
  selectedBook?: Book;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setPendingProcessingAction: Dispatch<SetStateAction<PendingBookProcessingAction | undefined>>;
  standardsModel: string;
}

export function useUploadStandardsProcessing ({ embeddingModel, requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction, standardsModel }: UploadStandardsProcessingParams) {
  const { t } = useTranslation();
  const [isStandardsConfirmationOpen, setIsStandardsConfirmationOpen] = useState(false);
  const [generateOnlyMissingStandards, setGenerateOnlyMissingStandards] = useState(true);
  const [standardsChapterCounts, setStandardsChapterCounts] = useState<{ missing: number; total: number }>();
  const [standardsEstimate, setStandardsEstimate] = useState<AiInputEstimate | string>();
  const onAssignStandards = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!selectedBook.language) {
      setError(t('Book language has not been set yet. Open the Language step, then detect it from text or choose it manually.'));
      return;
    }

    if (!selectedBook.subject) {
      setError(t('Book subject has not been set yet. Open the Subject step, then detect it from text or choose it manually.'));
      return;
    }

    if (!isBookProcessingStageComplete(selectedBook, 'embeddings')) {
      setError(t('Complete Embedings before identifying Standards.'));
      return;
    }

    setStandardsEstimate(undefined);
    setStandardsChapterCounts(undefined);
    setGenerateOnlyMissingStandards(true);
    setIsStandardsConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isStandardsConfirmationOpen || !selectedBook) {
      return;
    }

    let isCurrent = true;

    setStandardsEstimate(undefined);

    getBookPages(selectedBook.id).then(async (pages) => {
      const embeddingRequests: string[] = [];
      const aiRequests: string[] = [];
      const catalogs = (await loadStandardsCatalogsForBookSubject(selectedBook.subject)).filter(({ standards }) => standards.length);
      const conceptRows = [
        ...(await Promise.all(pages.map(({ pageNumber }) => getBookConceptsForBookPage(selectedBook.id, pageNumber)))).flat(),
        ...await getBookConceptsForBookPage(selectedBook.id, 0)
      ];
      const conceptsById = new Map(conceptRows.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]));
      const cachedConceptRows = await getConceptEmbeddings(Array.from(conceptsById.keys()));
      const currentConceptEmbeddings = new Map<number, number[]>(cachedConceptRows.flatMap(({ embedding, id, input, model }) => {
        const concept = conceptsById.get(id);

        return concept && model === embeddingModel && input === conceptEmbeddingInput(concept) && Array.isArray(embedding) && embedding.length
          ? [[id, embedding] as const]
          : [];
      }));
      const chapters = conceptChaptersFromPages(pages);
      const storedStandards = loadStoredBookStandards(selectedBook.id);
      const chapterRequests = chapters.map((chapter) => {
        const seen = new Set<string>();
        const chapterRows = conceptRows.filter((concept) => {
          if (!conceptBelongsToChapter(concept, chapter)) {
            return false;
          }

          const title = concept.title.trim();
          const description = concept.description.trim();
          const key = `${title}\u001f${description}`;

          if (!title || seen.has(key)) {
            return false;
          }

          seen.add(key);

          return true;
        });
        const concepts = standardsConceptInputs(chapterRows);
        const fingerprint = standardsConceptFingerprint(concepts, standardsPathForBookSubject(selectedBook.subject) ?? 'no-standards');
        const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);

        return {
          chapter,
          chapterRows,
          concepts,
          isMissing: needsChapterStandardsIdentification(storedStandards[chapterKey], fingerprint)
        };
      });
      const missingCount = chapterRequests.filter(({ isMissing }) => isMissing).length;

      if (isCurrent) {
        setStandardsChapterCounts({ missing: missingCount, total: chapters.length });
      }

      const targetedChapters = chapterRequests.filter(({ isMissing }) => !generateOnlyMissingStandards || isMissing);

      // No chapter needs processing: skip embeddings cost as well as AI matching cost.
      if (!targetedChapters.length) {
        if (isCurrent) {
          setStandardsEstimate(t('No chapters need standards identification. Uncheck the option above to re-identify all chapters.'));
        }
        return;
      }

      const missingConceptEmbeddingCount = Array.from(conceptsById.values()).filter((concept) => (
        conceptEmbeddingInput(concept) && !currentConceptEmbeddings.has(concept.id as number)
      )).length;

      if (missingConceptEmbeddingCount) {
        if (isCurrent) {
          setStandardsEstimate(t('Run Embedings again with the selected embedding model before identifying Standards.'));
        }
        return;
      }

      const allStandards = catalogs.flatMap(({ standards }) => standards);
      const cachedStandardRows = await getStandardEmbeddings(allStandards.map(({ code }) => code));
      const standardEmbeddings = new Map<string, number[]>(cachedStandardRows.flatMap(({ embedding, id, model }) => model === embeddingModel && Array.isArray(embedding) && embedding.length ? [[id, embedding] as const] : []));
      const missingStandardInputs = allStandards.filter(({ code }) => !standardEmbeddings.has(code)).map(standardEmbeddingInput);

      for (let index = 0; index < missingStandardInputs.length; index += 100) {
        embeddingRequests.push(missingStandardInputs.slice(index, index + 100).join('\n\n'));
      }

      for (const { chapter, chapterRows, concepts } of targetedChapters) {
        if (!concepts.length) {
          continue;
        }

        const chapterEmbeddings = chapterRows.flatMap(({ id }) => id === undefined ? [] : (currentConceptEmbeddings.get(id) ? [currentConceptEmbeddings.get(id) as number[]] : []));

        catalogs.forEach((catalog) => {
          let candidateCatalog = catalog;

          if (chapterEmbeddings.length && catalog.standards.every(({ code }) => standardEmbeddings.has(code))) {
            candidateCatalog = standardsCandidatesFromEmbeddings(chapterEmbeddings, catalog, standardEmbeddings).catalog;
          } else {
            // Before missing standard embeddings are generated we cannot know the
            // exact nearest standards. Use the same upper bound on candidate count
            // (one nearest standard per concept) for a useful pre-run token estimate.
            candidateCatalog = {
              ...catalog,
              standards: catalog.standards.slice(0, Math.min(catalog.standards.length, Math.max(1, concepts.length)))
            };
          }

          if (!candidateCatalog.standards.length) {
            return;
          }

          const prompt = standardsMatchingPrompt(chapter.title, concepts, candidateCatalog);

          for (let run = 0; run < STANDARDS_MATCH_RUNS; run++) {
            aiRequests.push(prompt);
          }
        });
      }

      if (!catalogs.length) {
        if (isCurrent) {
          setStandardsEstimate(t('No standards catalogs are available for this book subject.'));
        }
        return;
      }

      if (!conceptsById.size) {
        if (isCurrent) {
          setStandardsEstimate(t('No extracted chapter concepts are available for standards matching.'));
        }
        return;
      }

      const estimates = [
        ...(embeddingRequests.length ? [estimateAiInput(embeddingModel, embeddingRequests, 0)] : []),
        ...(aiRequests.length ? [estimateAiInput(standardsModel, aiRequests, 300)] : [])
      ];

      if (isCurrent) {
        setStandardsEstimate(estimates.length
          ? combineAiEstimates(...estimates)
          : t('No OpenRouter cost is expected.'));
      }
    }).catch(() => {
      if (isCurrent) {
        setError(t('Unable to estimate standards assignment cost.'));
      }
    });

    return () => { isCurrent = false; };
  }, [embeddingModel, generateOnlyMissingStandards, isStandardsConfirmationOpen, selectedBook, standardsModel, t, setError]);

  const closeStandardsConfirmation = useCallback((): void => {
    setIsStandardsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const confirmAssignStandards = useCallback((): void => {
    setIsStandardsConfirmationOpen(false);

    if (generateOnlyMissingStandards && standardsChapterCounts?.missing === 0) {
      return;
    }

    if (!selectedBook) {
      setPendingProcessingAction(undefined);
      return;
    }

    setPendingProcessingAction('standards');

    resetBookProcessingStagesFrom(selectedBook.id, 'standards').then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      requestProcessing('standards');
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [generateOnlyMissingStandards, standardsChapterCounts, requestProcessing, selectedBook, t, setBooks, setError, setPendingProcessingAction]);

  return {
    closeStandardsConfirmation,
    confirmAssignStandards,
    generateOnlyMissingStandards,
    isStandardsConfirmationOpen,
    onAssignStandards,
    setGenerateOnlyMissingStandards,
    standardsChapterCounts,
    standardsEstimate
  };
}
