// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import { getBookConceptsForBookPage, getBookPages, getConceptEmbeddings, getExercisesForBookPage, getStandardEmbeddings, isBookProcessingStageComplete, resetBookProcessingStagesFrom } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { AiInputEstimate } from '../../../book/application/pricing/aiEstimate.js';
import type { BookReaderCommandAction, PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';

import { estimateAiInput, estimateAiRequests } from '../../../book/application/pricing/aiEstimate.js';
import { conceptBelongsToChapter, sortConceptsByDisplayOrder } from '../../../book/domain/chapters/refineChapters.js';
import { exerciseGenerationRequestEstimate } from '../../../book/application/processing/bookProcessing.js';
import { conceptChaptersFromPages } from '../../../book/domain/concepts/conceptRecognition.js';
import { bookLanguageLabel } from '../../../book/domain/metadata/bookLanguage.js';
import { STANDARDS_MATCH_RUNS, standardsCandidatesFromEmbeddings, standardsConceptInputs, standardsMatchingPrompt, standardEmbeddingInput } from '../../../book/domain/standards/standards.js';
import { loadStandardsCatalogsForBookSubject } from '../../../book/infrastructure/standards/standardsCatalog.js';
import { conceptEmbeddingInput } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
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

interface UploadStandardsExercisesProcessingParams {
  embeddingModel: string;
  generateAllConceptsModel: string;
  requestProcessing: (action: BookReaderCommandAction) => void;
  selectedBook?: Book;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setPendingProcessingAction: Dispatch<SetStateAction<PendingBookProcessingAction | undefined>>;
  standardsModel: string;
}

export function useUploadStandardsExercisesProcessing ({ embeddingModel, generateAllConceptsModel, requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction, standardsModel }: UploadStandardsExercisesProcessingParams) {
  const { t } = useTranslation();
  const [generateExercisesEstimate, setGenerateExercisesEstimate] = useState<AiInputEstimate>();
  const [generateOnlyMissingExercises, setGenerateOnlyMissingExercises] = useState(false);
  const [hasConceptsMissingExercise, setHasConceptsMissingExercise] = useState(false);
  const [isGenerateExercisesConfirmationOpen, setIsGenerateExercisesConfirmationOpen] = useState(false);
  const [isStandardsConfirmationOpen, setIsStandardsConfirmationOpen] = useState(false);
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
    setIsStandardsConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isStandardsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const embeddingRequests: string[] = [];
      const aiRequests: string[] = [];
      const catalogs = (await loadStandardsCatalogsForBookSubject(selectedBook.subject)).filter(({ standards }) => standards.length);
      const allStandards = catalogs.flatMap(({ standards }) => standards);
      const cachedStandardRows = await getStandardEmbeddings(allStandards.map(({ code }) => code));
      const standardEmbeddings = new Map<string, number[]>(cachedStandardRows.flatMap(({ embedding, id, model }) => model === embeddingModel && Array.isArray(embedding) && embedding.length ? [[id, embedding] as const] : []));
      const missingStandardInputs = allStandards.filter(({ code }) => !standardEmbeddings.has(code)).map(standardEmbeddingInput);

      for (let index = 0; index < missingStandardInputs.length; index += 100) {
        embeddingRequests.push(missingStandardInputs.slice(index, index + 100).join('\n\n'));
      }

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
      const missingConceptEmbeddingCount = Array.from(conceptsById.values()).filter((concept) => (
        conceptEmbeddingInput(concept) && !currentConceptEmbeddings.has(concept.id as number)
      )).length;

      if (missingConceptEmbeddingCount) {
        setStandardsEstimate(t('Run Embedings again with the selected embedding model before identifying Standards.'));
        return;
      }

      for (const chapter of conceptChaptersFromPages(pages)) {
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
        setStandardsEstimate(t('No standards catalogs are available for this book subject.'));
        return;
      }

      if (!conceptsById.size) {
        setStandardsEstimate(t('No extracted chapter concepts are available for standards matching.'));
        return;
      }

      const estimates = [
        ...(embeddingRequests.length ? [estimateAiInput(embeddingModel, embeddingRequests, 0)] : []),
        ...(aiRequests.length ? [estimateAiInput(standardsModel, aiRequests, 300)] : [])
      ];

      setStandardsEstimate(estimates.length
        ? combineAiEstimates(...estimates)
        : t('No OpenRouter cost is expected.'));
    }).catch(() => setError(t('Unable to estimate standards assignment cost.')));
  }, [embeddingModel, isStandardsConfirmationOpen, selectedBook, standardsModel, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const closeStandardsConfirmation = useCallback((): void => {
    setIsStandardsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const confirmAssignStandards = useCallback((): void => {
    setIsStandardsConfirmationOpen(false);

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
  }, [requestProcessing, selectedBook, t, setBooks, setError, setPendingProcessingAction]);

  const onGenerateExercises = useCallback((): void => {
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

    setGenerateExercisesEstimate(undefined);
    setGenerateOnlyMissingExercises(false);
    setHasConceptsMissingExercise(false);
    setIsGenerateExercisesConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const onRetryMissingExercises = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setGenerateExercisesEstimate(undefined);
    setGenerateOnlyMissingExercises(true);
    setHasConceptsMissingExercise(true);
    setIsGenerateExercisesConfirmationOpen(true);
  }, [selectedBook, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isGenerateExercisesConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const storedPages = pages
        .filter(({ chapter, chapterId, conceptsProcessed, excludedFromAnalysis }) => conceptsProcessed && !excludedFromAnalysis && (chapterId !== undefined || Boolean(chapter.trim())))
        .sort((a, b) => a.pageNumber - b.pageNumber);
      const pageRows = await Promise.all(storedPages.map(async (storedPage) => ({
        concepts: await getBookConceptsForBookPage(selectedBook.id, storedPage.pageNumber),
        exercises: await getExercisesForBookPage([selectedBook.id, storedPage.pageNumber]),
        storedPage
      })));
      const exerciseConceptIds = new Set(pageRows.flatMap(({ exercises }) => exercises.flatMap(({ conceptId }) => conceptId === undefined ? [] : [conceptId])));
      const hasMissingExercise = pageRows.some(({ concepts }) => concepts.some(({ id }) => id === undefined || !exerciseConceptIds.has(id)));

      const hasCoveredConcept = exerciseConceptIds.size > 0;

      setHasConceptsMissingExercise(hasMissingExercise);
      if (hasMissingExercise && hasCoveredConcept && !generateOnlyMissingExercises) {
        setGenerateOnlyMissingExercises(true);
      } else if (!hasMissingExercise && generateOnlyMissingExercises) {
        setGenerateOnlyMissingExercises(false);
      }

      const conceptInventory = pageRows.flatMap(({ concepts }) => concepts);
      const chapterInputs = conceptChaptersFromPages(pages).flatMap((chapter) => {
        const targetConcepts = sortConceptsByDisplayOrder(conceptInventory.filter((concept) => conceptBelongsToChapter(concept, chapter)))
          .filter(({ id }) => !generateOnlyMissingExercises || id === undefined || !exerciseConceptIds.has(id));
        const conceptsByPage = new Map<number, typeof targetConcepts>();

        targetConcepts.forEach((concept) => {
          const pageConcepts = conceptsByPage.get(concept.bookPage[1]) ?? [];

          pageConcepts.push(concept);
          conceptsByPage.set(concept.bookPage[1], pageConcepts);
        });
        const chapterPages = Array.from(conceptsByPage.entries())
          .sort(([a], [b]) => a - b)
          .map(([pageNumber, concepts]) => ({
            concepts: concepts.map(({ description, id, title }) => ({ description, sourceId: id, title })),
            pageNumber
          }));

        return chapterPages.length ? [{ chapter: chapter.title, pages: chapterPages }] : [];
      });
      const bookDetectedLanguage = bookLanguageLabel(selectedBook.language);
      const requests = chapterInputs
        .map((chapterInput) => exerciseGenerationRequestEstimate(chapterInput, bookDetectedLanguage, selectedBook.age))
        .flatMap((request) => request ? [request] : []);

      setGenerateExercisesEstimate(estimateAiRequests(generateAllConceptsModel, requests));
    }).catch(() => setError(t('Unable to estimate exercise generation cost.')));
  }, [generateAllConceptsModel, generateOnlyMissingExercises, isGenerateExercisesConfirmationOpen, selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const closeGenerateExercisesConfirmation = useCallback((): void => {
    setIsGenerateExercisesConfirmationOpen(false);
    setGenerateOnlyMissingExercises(false);
    setHasConceptsMissingExercise(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const confirmGenerateExercises = useCallback((): void => {
    setIsGenerateExercisesConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('abilities');

    resetBookProcessingStagesFrom(selectedBook.id, 'abilities').then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      requestProcessing('abilities');
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [generateOnlyMissingExercises, requestProcessing, selectedBook, t, setBooks, setError, setPendingProcessingAction]);


  return {
    closeGenerateExercisesConfirmation,
    closeStandardsConfirmation,
    confirmAssignStandards,
    confirmGenerateExercises,
    generateExercisesEstimate,
    generateOnlyMissingExercises,
    hasConceptsMissingExercise,
    isGenerateExercisesConfirmationOpen,
    isStandardsConfirmationOpen,
    onAssignStandards,
    onGenerateExercises,
    onRetryMissingExercises,
    setGenerateOnlyMissingExercises,
    standardsEstimate
  };
}
