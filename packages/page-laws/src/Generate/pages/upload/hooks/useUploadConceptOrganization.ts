// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage } from '@slonigiraf/db';
import { getBookConceptsForBookPage, getBookPages, getConceptEmbeddings, getSetting, isBookProcessingStageComplete, SettingKey, uncompleteBookProcessingStage } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { AiInputEstimate } from '../../../book/application/pricing/aiEstimate.js';
import type { DeduplicateConceptInput } from '../../../book/domain/concepts/deduplicateConcepts.js';
import type { BookReaderCommandAction, PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';

import { estimateAiInput } from '../../../book/application/pricing/aiEstimate.js';
import { conceptsForRefinementChapter, refineChapterPrompt, withRefineChaptersIncomplete } from '../../../book/domain/chapters/refineChapters.js';
import { conceptChaptersFromPages } from '../../../book/domain/concepts/conceptRecognition.js';
import { conceptDeduplicationInput, deduplicateConceptCandidates, deduplicateConceptsPrompt } from '../../../book/domain/concepts/deduplicateConcepts.js';
import { conceptsForSortChapter, sortChapterConceptsPrompt } from '../../../book/domain/concepts/sortConcepts.js';
import { conceptEmbeddingInput } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
import { useTranslation } from '../../../../common/translate.js';

async function loadDeduplicateConceptInputs (bookId: number, pages: BookPage[]): Promise<DeduplicateConceptInput[]> {
  const chapters = conceptChaptersFromPages(pages);
  const chapterById = new Map(chapters.flatMap((chapter) => chapter.chapterId === undefined ? [] : [[chapter.chapterId, chapter] as const]));
  const chapterByPage = new Map(chapters.flatMap((chapter) => chapter.pageNumbers.map((pageNumber) => [pageNumber, chapter] as const)));
  const pageNumbers = Array.from(new Set(pages.map(({ pageNumber }) => pageNumber)));
  const rows = [
    ...(await Promise.all(pageNumbers.map((pageNumber) => getBookConceptsForBookPage(bookId, pageNumber)))).flat(),
    ...await getBookConceptsForBookPage(bookId, 0)
  ];
  const byId = new Map<number, DeduplicateConceptInput>();

  rows.forEach((concept) => {
    const chapter = concept.chapterId === undefined ? chapterByPage.get(concept.bookPage[1]) : chapterById.get(concept.chapterId);
    const input = chapter ? conceptDeduplicationInput(concept, chapter) : undefined;

    if (input) {
      byId.set(input.conceptId, input);
    }
  });

  return Array.from(byId.values()).sort((a, b) => a.chapterId - b.chapterId || a.conceptId - b.conceptId);
}

interface UploadConceptOrganizationParams {
  embeddingModel: string;
  generateAllConceptsModel: string;
  requestProcessing: (action: BookReaderCommandAction) => void;
  selectedBook?: Book;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setPendingProcessingAction: Dispatch<SetStateAction<PendingBookProcessingAction | undefined>>;
}

export function useUploadConceptOrganization ({ embeddingModel, generateAllConceptsModel, requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction }: UploadConceptOrganizationParams) {
  const { t } = useTranslation();
  const [deduplicateConceptsEstimate, setDeduplicateConceptsEstimate] = useState<AiInputEstimate | string>();
  const [sortConceptsEstimate, setSortConceptsEstimate] = useState<AiInputEstimate | string>();
  const [refineChaptersEstimate, setRefineChaptersEstimate] = useState<AiInputEstimate | string>();
  const [isDeduplicateConceptsConfirmationOpen, setIsDeduplicateConceptsConfirmationOpen] = useState(false);
  const [isSortConceptsConfirmationOpen, setIsSortConceptsConfirmationOpen] = useState(false);
  const [isRefineChaptersConfirmationOpen, setIsRefineChaptersConfirmationOpen] = useState(false);
  const onDeduplicateConcepts = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!selectedBook.language || !selectedBook.subject || selectedBook.age === undefined) {
      setError(t('Set the book language, subject, and learner age before running Deduplicate concepts.'));
      return;
    }

    if (!isBookProcessingStageComplete(selectedBook, 'embeddings')) {
      setError(t('Run Embedings before Deduplicate concepts.'));
      return;
    }

    setDeduplicateConceptsEstimate(undefined);
    setIsDeduplicateConceptsConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isDeduplicateConceptsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const concepts = await loadDeduplicateConceptInputs(selectedBook.id, pages);

      if (concepts.length < 2) {
        setDeduplicateConceptsEstimate(t('At least two concepts are required for deduplication.'));
        return;
      }

      const configuredModel = await getSetting(SettingKey.CONCEPTS_EMBEDDER);

      if (configuredModel !== embeddingModel) {
        setDeduplicateConceptsEstimate(t('Run Embedings with the selected embedding model before deduplication.'));
        return;
      }

      const cachedRows = await getConceptEmbeddings(concepts.map(({ conceptId }) => conceptId));
      const embeddings = new Map<number, number[]>(cachedRows.flatMap(({ embedding, id, input }) => {
        const concept = concepts.find(({ conceptId }) => conceptId === id);

        return concept && input === conceptEmbeddingInput(concept) && Array.isArray(embedding) && embedding.length
          ? [[id, embedding] as const]
          : [];
      }));

      if (concepts.some(({ conceptId }) => !embeddings.has(conceptId))) {
        setDeduplicateConceptsEstimate(t('Run Embedings again because one or more concept embeddings are missing or stale.'));
        return;
      }

      const candidates = deduplicateConceptCandidates(concepts, embeddings);

      setDeduplicateConceptsEstimate(candidates.length
        ? estimateAiInput(generateAllConceptsModel, [deduplicateConceptsPrompt(concepts, candidates, selectedBook.subject, selectedBook.language, selectedBook.age)], Math.max(300, candidates.length * 30))
        : t('No close embedding candidates require AI confirmation.'));
    }).catch(() => setError(t('Unable to estimate Deduplicate concepts cost.')));
  }, [embeddingModel, generateAllConceptsModel, isDeduplicateConceptsConfirmationOpen, selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const closeDeduplicateConceptsConfirmation = useCallback((): void => {
    setIsDeduplicateConceptsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const confirmDeduplicateConcepts = useCallback((): void => {
    setIsDeduplicateConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('deduplicateConcepts');
    requestProcessing('deduplicateConcepts');
  }, [requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction]);

  const onSortConcepts = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!selectedBook.language || !selectedBook.subject || selectedBook.age === undefined) {
      setError(t('Set the book language, subject, and learner age before running Sort concepts.'));
      return;
    }

    setSortConceptsEstimate(undefined);
    setIsSortConceptsConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isSortConceptsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const chapters = conceptChaptersFromPages(pages);
      const inventory = [
        ...(await Promise.all(pages.map(({ pageNumber }) => getBookConceptsForBookPage(selectedBook.id, pageNumber)))).flat(),
        ...await getBookConceptsForBookPage(selectedBook.id, 0)
      ];
      const requests: string[] = [];

      for (const chapter of chapters) {
        // Match execution semantics exactly: isolate one source chapter first,
        // then build the sorting request from that chapter only.
        const concepts = conceptsForSortChapter(inventory, chapter);

        if (concepts.length > 1) {
          requests.push(sortChapterConceptsPrompt(chapter.title, concepts, selectedBook.subject, selectedBook.language, selectedBook.age));
        }
      }

      setSortConceptsEstimate(requests.length
        ? estimateAiInput(generateAllConceptsModel, requests, 800)
        : t('No chapters contain multiple concepts that need ZPD sorting.'));
    }).catch(() => setError(t('Unable to estimate Sort concepts cost.')));
  }, [generateAllConceptsModel, isSortConceptsConfirmationOpen, selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const closeSortConceptsConfirmation = useCallback((): void => {
    setIsSortConceptsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const confirmSortConcepts = useCallback((): void => {
    setIsSortConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    // Sort Concepts changes only display/learning order, but Refine Chapters
    // depends on that exact order. A rerun therefore invalidates only the
    // refinement marker; downstream data is left intact until Refine Chapters
    // actually changes chapter membership.
    const invalidatedBook = withRefineChaptersIncomplete(selectedBook);

    setBooks((current) => current.map((book) => book.id === invalidatedBook.id ? invalidatedBook : book));
    setPendingProcessingAction('sortConcepts');
    uncompleteBookProcessingStage(selectedBook.id, 'refineChapters')
      .then((storedBook) => {
        if (storedBook) {
          setBooks((current) => current.map((book) => book.id === storedBook.id ? storedBook : book));
        }
        requestProcessing('sortConcepts');
      })
      .catch(() => {
        setPendingProcessingAction(undefined);
        setError(t('Unable to invalidate the Refine chapters stage before sorting.'));
      });
  }, [requestProcessing, selectedBook, t, setBooks, setError, setPendingProcessingAction]);

  const onRefineChapters = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!selectedBook.language || !selectedBook.subject || selectedBook.age === undefined) {
      setError(t('Set the book language, subject, and learner age before running Refine chapters.'));
      return;
    }

    setRefineChaptersEstimate(undefined);
    setIsRefineChaptersConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isRefineChaptersConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const chapters = conceptChaptersFromPages(pages);
      const inventory = [
        ...(await Promise.all(pages.map(({ pageNumber }) => getBookConceptsForBookPage(selectedBook.id, pageNumber)))).flat(),
        ...await getBookConceptsForBookPage(selectedBook.id, 0)
      ];
      const requests = chapters.flatMap((chapter) => {
        const concepts = conceptsForRefinementChapter(inventory, chapter);

        return concepts.length
          ? [refineChapterPrompt(chapter.title, concepts, chapter.pageNumbers.length, selectedBook.subject, selectedBook.language, selectedBook.age)]
          : [];
      });

      setRefineChaptersEstimate(requests.length
        ? estimateAiInput(generateAllConceptsModel, requests, 700)
        : t('No chapters contain concepts that can be refined.'));
    }).catch(() => setError(t('Unable to estimate Refine chapters cost.')));
  }, [generateAllConceptsModel, isRefineChaptersConfirmationOpen, selectedBook, t, requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const closeRefineChaptersConfirmation = useCallback((): void => {
    setIsRefineChaptersConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setError, setPendingProcessingAction]);

  const confirmRefineChapters = useCallback((): void => {
    setIsRefineChaptersConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('refineChapters');
    requestProcessing('refineChapters');
  }, [requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction]);

  return {
    closeDeduplicateConceptsConfirmation,
    closeRefineChaptersConfirmation,
    closeSortConceptsConfirmation,
    confirmDeduplicateConcepts,
    confirmRefineChapters,
    confirmSortConcepts,
    deduplicateConceptsEstimate,
    isDeduplicateConceptsConfirmationOpen,
    isRefineChaptersConfirmationOpen,
    isSortConceptsConfirmationOpen,
    onDeduplicateConcepts,
    onRefineChapters,
    onSortConcepts,
    refineChaptersEstimate,
    sortConceptsEstimate
  };
}
