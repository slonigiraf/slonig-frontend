// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import { getBookConceptsForBookPage, getBookPages, getConceptEmbeddings, getSetting, isBookProcessingStageComplete, resetBookProcessingStagesFrom, SettingKey } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { AiInputEstimate } from '../../../book/application/pricing/aiEstimate.js';
import type { BookReaderCommandAction, PendingBookProcessingAction } from '../../../book/application/pipeline/bookPipeline.js';

import { estimateAiInput } from '../../../book/application/pricing/aiEstimate.js';
import { DEFAULT_STANDARDS_EMBEDDER } from '../../../book/application/config.js';
import { conceptChaptersFromPages } from '../../../book/domain/concepts/conceptRecognition.js';
import { fixChapterConceptsPrompt } from '../../../book/application/concepts/conceptPrompts.js';
import { conceptEmbeddingInput } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
import { standardsChapterKey } from '../../../book/domain/standards/standards.js';
import { clearFixConceptsChapterStatuses, failedFixConceptChapterKeys, fixConceptsChapterKey } from '../../../book/infrastructure/storage/fixConceptsProgress.js';
import { useTranslation } from '../../../../common/translate.js';

interface UploadConceptGenerationParams {
  embeddingModel: string;
  generateAllConceptsModel: string;
  requestProcessing: (action: BookReaderCommandAction) => void;
  selectedBook?: Book;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setEmbeddingModel: Dispatch<SetStateAction<string>>;
  setError: Dispatch<SetStateAction<string>>;
  setPendingProcessingAction: Dispatch<SetStateAction<PendingBookProcessingAction | undefined>>;
}

export function useUploadConceptGeneration ({ embeddingModel, generateAllConceptsModel, requestProcessing, selectedBook, setBooks, setEmbeddingModel, setError, setPendingProcessingAction }: UploadConceptGenerationParams) {
  const { t } = useTranslation();
  const [generateConceptsEstimate, setGenerateConceptsEstimate] = useState<AiInputEstimate | string>();
  const [generateOnlyMissingConcepts, setGenerateOnlyMissingConcepts] = useState(false);
  const [hasChaptersMissingConcepts, setHasChaptersMissingConcepts] = useState(false);
  const [fixConceptsEstimate, setFixConceptsEstimate] = useState<AiInputEstimate | string>();
  const [embeddingsEstimate, setEmbeddingsEstimate] = useState<AiInputEstimate | string>();
  const [fixOnlyFailedConcepts, setFixOnlyFailedConcepts] = useState(false);
  const [hasFailedFixConceptChapters, setHasFailedFixConceptChapters] = useState(false);
  const [isGenerateConceptsConfirmationOpen, setIsGenerateConceptsConfirmationOpen] = useState(false);
  const [isFixConceptsConfirmationOpen, setIsFixConceptsConfirmationOpen] = useState(false);
  const [isEmbeddingsConfirmationOpen, setIsEmbeddingsConfirmationOpen] = useState(false);
  const onGenerateConcepts = useCallback((): void => {
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

    setGenerateConceptsEstimate(undefined);
    setGenerateOnlyMissingConcepts(false);
    setHasChaptersMissingConcepts(false);
    setIsGenerateConceptsConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const onRetryMissingConcepts = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setGenerateConceptsEstimate(undefined);
    setGenerateOnlyMissingConcepts(true);
    setHasChaptersMissingConcepts(true);
    setIsGenerateConceptsConfirmationOpen(true);
  }, [selectedBook, requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isGenerateConceptsConfirmationOpen || !selectedBook) {
      return;
    }

    let isCurrent = true;

    setGenerateConceptsEstimate(undefined);

    const estimateChapters = (pages: Awaited<ReturnType<typeof getBookPages>>, chapters: ReturnType<typeof conceptChaptersFromPages>): void => {
      const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
      const requestInputs = chapters.flatMap(({ pageNumbers: chapterPageNumbers }) => {
        const chapterText = chapterPageNumbers.map((pageNumber) => `--- page ${pageNumber} ---\n${pageByNumber.get(pageNumber)?.pageMMD ?? ''}`).join('\n\n');
        const estimatedRequest = chapterText.padEnd(chapterText.length + 2_000);

        // Concept extraction can retry an empty chapter response once, so
        // estimate two whole-chapter requests per chapter conservatively.
        return [estimatedRequest, estimatedRequest];
      });

      if (isCurrent) {
        setGenerateConceptsEstimate(estimateAiInput(generateAllConceptsModel, requestInputs, 4_800));
      }
    };

    const loadConceptCountByChapter = async (chapters: ReturnType<typeof conceptChaptersFromPages>): Promise<Map<string, number>> => {
      const pageNumbers = Array.from(new Set(chapters.flatMap(({ pageNumbers: chapterPageNumbers }) => chapterPageNumbers)));
      const [pageConceptRows, pageLessConcepts] = await Promise.all([
        Promise.all(pageNumbers.map(async (pageNumber) => [pageNumber, await getBookConceptsForBookPage(selectedBook.id, pageNumber)] as const)),
        getBookConceptsForBookPage(selectedBook.id, 0)
      ]);
      const conceptsByPage = new Map(pageConceptRows);

      return new Map(chapters.map((chapter) => {
        const pageConceptCount = chapter.pageNumbers.reduce((count, pageNumber) => count + (conceptsByPage.get(pageNumber)?.length ?? 0), 0);
        const pageLessConceptCount = chapter.chapterId === undefined ? 0 : pageLessConcepts.filter(({ chapterId }) => chapterId === chapter.chapterId).length;

        return [standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers), pageConceptCount + pageLessConceptCount] as const;
      }));
    };

    getBookPages(selectedBook.id)
      .then(async (pages) => {
        if (!isCurrent) {
          return;
        }

        const chapters = conceptChaptersFromPages(pages);

        if (!generateOnlyMissingConcepts) {
          // The normal estimate needs only page text and chapter assignments.
          // Render it before touching the concept inventory so a slow/stuck
          // IndexedDB concept query cannot leave the popup calculating forever.
          estimateChapters(pages, chapters);

          // This inventory lookup exists only to decide whether the optional
          // "only missing" toggle should be enabled. It must never block cost.
          void loadConceptCountByChapter(chapters)
            .then((conceptCountByChapter) => {
              if (!isCurrent) {
                return;
              }

              const conceptCounts = chapters.map((chapter) => conceptCountByChapter.get(standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers)) ?? 0);
              const hasMissingConcepts = conceptCounts.some((count) => count === 0);
              const hasGeneratedConcepts = conceptCounts.some((count) => count > 0);

              setHasChaptersMissingConcepts(hasMissingConcepts);
              if (hasMissingConcepts && hasGeneratedConcepts) {
                setGenerateOnlyMissingConcepts(true);
              }
            })
            .catch((conceptInventoryError) => {
              console.error('Unable to load concept inventory for cost estimation.', conceptInventoryError);

              if (isCurrent) {
                setHasChaptersMissingConcepts(false);
              }
            });

          return;
        }

        // If the user explicitly requests only missing chapters, inventory is
        // required to know which requests should be included in the estimate.
        const conceptCountByChapter = await loadConceptCountByChapter(chapters);

        if (!isCurrent) {
          return;
        }

        const missingChapters = chapters.filter((chapter) => (conceptCountByChapter.get(standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers)) ?? 0) === 0);
        const hasMissingConcepts = missingChapters.length > 0;

        setHasChaptersMissingConcepts(hasMissingConcepts);

        if (!hasMissingConcepts) {
          setGenerateOnlyMissingConcepts(false);
          return;
        }

        estimateChapters(pages, missingChapters);
      })
      .catch((estimationError) => {
        if (!isCurrent) {
          return;
        }

        console.error('Unable to estimate concept generation cost.', estimationError);
        const message = estimationError instanceof Error ? estimationError.message : t('Unable to estimate concept generation cost.');

        setGenerateConceptsEstimate(message);
        setError(message);
      });

    return () => {
      isCurrent = false;
    };
  }, [generateAllConceptsModel, generateOnlyMissingConcepts, isGenerateConceptsConfirmationOpen, selectedBook, t, requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const closeGenerateConceptsConfirmation = useCallback((): void => {
    setIsGenerateConceptsConfirmationOpen(false);
    setGenerateOnlyMissingConcepts(false);
    setHasChaptersMissingConcepts(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const confirmGenerateConcepts = useCallback((): void => {
    setIsGenerateConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('concepts');

    resetBookProcessingStagesFrom(selectedBook.id, generateOnlyMissingConcepts ? 'fixConcepts' : 'concepts').then((updatedBook) => {
      clearFixConceptsChapterStatuses(selectedBook.id);
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      requestProcessing('concepts');
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [generateOnlyMissingConcepts, requestProcessing, selectedBook, t, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const onFixConcepts = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!selectedBook.language || !selectedBook.subject || selectedBook.age === undefined) {
      setError(t('Set the book language, subject, and learner age before running Fix concepts.'));
      return;
    }

    setFixConceptsEstimate(undefined);
    setFixOnlyFailedConcepts(false);
    setHasFailedFixConceptChapters(false);
    setIsFixConceptsConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isFixConceptsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
      const pageLessConcepts = await getBookConceptsForBookPage(selectedBook.id, 0);
      const chapters = conceptChaptersFromPages(pages);
      const failedChapterKeys = failedFixConceptChapterKeys(selectedBook.id, chapters);
      const targetChapters = fixOnlyFailedConcepts
        ? chapters.filter((chapter) => failedChapterKeys.has(fixConceptsChapterKey(chapter)))
        : chapters;
      const requests: string[] = [];

      setHasFailedFixConceptChapters(failedChapterKeys.size > 0);
      if (!failedChapterKeys.size && fixOnlyFailedConcepts) {
        setFixOnlyFailedConcepts(false);
      }

      for (const chapter of targetChapters) {
        const concepts = [
          ...(await Promise.all(chapter.pageNumbers.map((pageNumber) => getBookConceptsForBookPage(selectedBook.id, pageNumber)))).flat(),
          ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.chapterId)
        ];

        const chapterMmd = chapter.pageNumbers.map((pageNumber) => `--- page ${pageNumber} ---\n${pageByNumber.get(pageNumber)?.pageMMD ?? ''}`).join('\n\n');

        requests.push(fixChapterConceptsPrompt(chapter.title, chapterMmd, concepts, selectedBook.subject, selectedBook.language, selectedBook.age));
      }

      setFixConceptsEstimate(requests.length
        ? estimateAiInput(generateAllConceptsModel, requests, 1_200)
        : t('No chapters are available for Fix concepts.'));
    }).catch(() => setError(t('Unable to estimate Fix concepts cost.')));
  }, [fixOnlyFailedConcepts, generateAllConceptsModel, isFixConceptsConfirmationOpen, selectedBook, t, requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const closeFixConceptsConfirmation = useCallback((): void => {
    setIsFixConceptsConfirmationOpen(false);
    setFixOnlyFailedConcepts(false);
    setHasFailedFixConceptChapters(false);
    setPendingProcessingAction(undefined);
  }, [requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const confirmFixConcepts = useCallback((): void => {
    setIsFixConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('fixConcepts');
    requestProcessing('fixConcepts');
  }, [requestProcessing, selectedBook, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const onEmbeddings = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!isBookProcessingStageComplete(selectedBook, 'fixConcepts')) {
      setError(t('Complete Fix concepts before calculating Embedings.'));
      return;
    }

    setEmbeddingsEstimate(undefined);
    setIsEmbeddingsConfirmationOpen(true);
  }, [selectedBook, t, requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  useEffect(() => {
    if (!isEmbeddingsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const conceptRows = [
        ...(await Promise.all(pages.map(({ pageNumber }) => getBookConceptsForBookPage(selectedBook.id, pageNumber)))).flat(),
        ...await getBookConceptsForBookPage(selectedBook.id, 0)
      ];
      const conceptsById = new Map(conceptRows.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]));
      const configuredModel = await getSetting(SettingKey.CONCEPTS_EMBEDDER);
      const cachedRows = configuredModel === embeddingModel
        ? await getConceptEmbeddings(Array.from(conceptsById.keys()))
        : [];
      const cachedIds = new Set(cachedRows.flatMap(({ embedding, id, input }) => {
        const concept = conceptsById.get(id);

        return concept && input === conceptEmbeddingInput(concept) && Array.isArray(embedding) && embedding.length ? [id] : [];
      }));
      const missingInputs = Array.from(conceptsById.values()).flatMap((concept) => {
        const input = conceptEmbeddingInput(concept);

        return input && !cachedIds.has(concept.id as number) ? [input] : [];
      });
      const requests: string[] = [];

      for (let index = 0; index < missingInputs.length; index += 100) {
        requests.push(missingInputs.slice(index, index + 100).join('\n\n'));
      }

      setEmbeddingsEstimate(requests.length
        ? estimateAiInput(embeddingModel, requests, 0)
        : t('All current concept Embedings are already cached for this model.'));
    }).catch(() => setError(t('Unable to estimate Embedings cost.')));
  }, [embeddingModel, isEmbeddingsConfirmationOpen, selectedBook, t, requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const closeEmbeddingsConfirmation = useCallback((): void => {
    setIsEmbeddingsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
    getSetting(SettingKey.CONCEPTS_EMBEDDER)
      .then((storedModel) => setEmbeddingModel(storedModel || DEFAULT_STANDARDS_EMBEDDER))
      .catch(() => setEmbeddingModel(DEFAULT_STANDARDS_EMBEDDER));
  }, [requestProcessing, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);

  const confirmEmbeddings = useCallback((): void => {
    setIsEmbeddingsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('embeddings');
    resetBookProcessingStagesFrom(selectedBook.id, 'embeddings').then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      requestProcessing('embeddings');
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [requestProcessing, selectedBook, t, setBooks, setEmbeddingModel, setError, setPendingProcessingAction]);


  return {
    closeEmbeddingsConfirmation,
    closeFixConceptsConfirmation,
    closeGenerateConceptsConfirmation,
    confirmEmbeddings,
    confirmFixConcepts,
    confirmGenerateConcepts,
    embeddingsEstimate,
    fixConceptsEstimate,
    fixOnlyFailedConcepts,
    generateConceptsEstimate,
    generateOnlyMissingConcepts,
    hasChaptersMissingConcepts,
    hasFailedFixConceptChapters,
    isEmbeddingsConfirmationOpen,
    isFixConceptsConfirmationOpen,
    isGenerateConceptsConfirmationOpen,
    onEmbeddings,
    onFixConcepts,
    onGenerateConcepts,
    onRetryMissingConcepts,
    setFixOnlyFailedConcepts,
    setGenerateOnlyMissingConcepts
  };
}
