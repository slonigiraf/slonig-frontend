// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage, BookProcessingStageKey, BookStageSpendKey } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { createBook, deleteBook, getBook, getBookByContentHash, getBookConceptsForBookPage, getBookPages, getBooks, getConceptEmbeddings, getExercisesForBookPage, getSetting, getStandardEmbeddings, isBookProcessingStageComplete, resetBookProcessingStagesFrom, SettingKey, uncompleteBookProcessingStage, updateBookFields, updateBookFieldsAndStages } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, Modal, Toggle, styled } from '@polkadot/react-components';

import type { AiInputEstimate } from '../book/processing/aiEstimate.js';

import { estimateAiInput, estimateAiRequests } from '../book/processing/aiEstimate.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_EMBEDDER, DEFAULT_STANDARDS_MODEL, MATHPIX_PDF_PAGE_PRICE_USD } from '../../constants.js';
import OpenRouterEmbeddingModelSelector from '../components/OpenRouterEmbeddingModelSelector.js';
import OpenRouterModelSelector from '../../OpenRouterModelSelector.js';
import { bookLanguageLabel } from '../book/processing/metadata/bookLanguage.js';
import { exerciseGenerationRequestEstimate } from '../book/processing/bookProcessing.js';
import { conceptChaptersFromPages } from '../book/processing/concepts/conceptRecognition.js';
import { conceptDeduplicationInput, deduplicateConceptCandidates, deduplicateConceptsPrompt, type DeduplicateConceptInput } from '../book/processing/concepts/deduplicateConcepts.js';
import { fixChapterConceptsPrompt } from '../book/processing/concepts/fixConcepts.js';
import { conceptsForSortChapter, sortChapterConceptsPrompt } from '../book/processing/concepts/sortConcepts.js';
import { conceptBelongsToChapter, conceptsForRefinementChapter, isRefineChaptersComplete, REFINE_CHAPTERS_SPEND_STAGE, refineChapterPrompt, sortConceptsByDisplayOrder, withRefineChaptersIncomplete } from '../book/processing/chapters/refineChapters.js';
import { clearFixConceptsChapterStatuses, failedFixConceptChapterKeys, fixConceptsChapterKey } from '../book/runtime/fixConceptsProgress.js';
import { formatOpenRouterSpend } from '../../openRouterCost.js';
import { clearBookStageTimes, formatBookStageTime, loadBookStageTimes, type BookStageTimes } from '../book/runtime/bookStageTime.js';
import { bookExternalCallTotal, clearBookExternalCalls, loadBookExternalCalls, type BookExternalCalls } from '../book/runtime/bookExternalCalls.js';
import { loadStandardsCatalogsForBookSubject, STANDARDS_MATCH_RUNS, standardsCandidatesFromEmbeddings, standardsChapterKey, standardsConceptInputs, standardsMatchingPrompt, standardEmbeddingInput } from '../book/processing/standards/standards.js';
import { conceptEmbeddingInput } from '../book/processing/standards/standardsEmbeddings.js';
import { AiPriceEstimate, UnitPriceEstimate } from '../components/PriceEstimate.js';
import { loadPdfJs } from '../book/processing/source/pdf.js';
import StageRunPricePopup from '../components/StageRunPricePopup.js';
import { useTranslation } from '../../translate.js';

const BookReader = React.lazy(() => import('./BookReader.js'));

const BOOKS_DIRECTORY = 'books';
const SELECTED_BOOK_SESSION_KEY = 'knowledge-upload-selected-book';
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

const PRICE_STAGES: Array<{ detail?: string; key: BookStageSpendKey; label: string }> = [
  { key: 'recognize', label: 'Recognize' },
  { key: 'language', label: 'Language' },
  { key: 'subject', label: 'Subject' },
  { key: 'age', label: 'Age' },
  { key: 'chapters', label: 'Chapters' },
  { key: 'concepts', label: 'Concepts' },
  { key: 'fixConcepts', label: 'Fix concepts' },
  { key: 'embeddings', label: 'Embedings' },
  { key: 'deduplicateConcepts', label: 'Deduplicate concepts' },
  { key: 'sortConcepts', label: 'Sort concepts' },
  { key: REFINE_CHAPTERS_SPEND_STAGE, label: 'Refine chapters' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'fixExercises', label: 'Fix exercises' },
  { key: 'abilities', label: 'Abilities' },
  { key: 'fixAbilities', label: 'Fix abilities' },
  { key: 'images', label: 'Images' },
  { key: 'fixImages', label: 'Fix images' },
  { key: 'standards', label: 'Standards' }
];

function getSessionBookId (): number | undefined {
  try {
    const value = Number(sessionStorage.getItem(SELECTED_BOOK_SESSION_KEY));

    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function getBooksDirectory (): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error('OPFS is not supported by this browser');
  }

  const root = await navigator.storage.getDirectory();

  return root.getDirectoryHandle(BOOKS_DIRECTORY, { create: true });
}

async function writePdf (opfsName: string, contents: Uint8Array): Promise<void> {
  const directory = await getBooksDirectory();
  const handle = await directory.getFileHandle(opfsName, { create: true });
  const writable = await handle.createWritable();

  await writable.write(contents.slice().buffer);
  await writable.close();
}

async function removePdf (opfsName: string): Promise<void> {
  const directory = await getBooksDirectory();

  await directory.removeEntry(opfsName);
}

async function readPdf (opfsName: string): Promise<File> {
  const directory = await getBooksDirectory();
  const handle = await directory.getFileHandle(opfsName);

  return handle.getFile();
}

async function getContentHash (contents: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', contents.slice().buffer);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

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

function Upload (): React.ReactElement {
  const { t } = useTranslation();
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [assignAllStandardsRequest, setAssignAllStandardsRequest] = useState(0);
  const [fixAllConceptsRequest, setFixAllConceptsRequest] = useState(0);
  const [embedAllConceptsRequest, setEmbedAllConceptsRequest] = useState(0);
  const [deduplicateAllConceptsRequest, setDeduplicateAllConceptsRequest] = useState(0);
  const [sortAllConceptsRequest, setSortAllConceptsRequest] = useState(0);
  const [refineAllChaptersRequest, setRefineAllChaptersRequest] = useState(0);
  const [generateAllConceptsRequest, setGenerateAllConceptsRequest] = useState(0);
  const [languageTabRequest, setLanguageTabRequest] = useState(0);
  const [subjectTabRequest, setSubjectTabRequest] = useState(0);
  const [ageTabRequest, setAgeTabRequest] = useState(0);
  const [identifyChaptersRequest, setIdentifyChaptersRequest] = useState(0);
  const [identifyChaptersEstimate, setIdentifyChaptersEstimate] = useState<AiInputEstimate>();
  const [isIdentifyChaptersConfirmationOpen, setIsIdentifyChaptersConfirmationOpen] = useState(false);
  const [generateAllConceptsModel, setGenerateAllConceptsModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [standardsModel, setStandardsModel] = useState(DEFAULT_STANDARDS_MODEL);
  const [embeddingModel, setEmbeddingModel] = useState(DEFAULT_STANDARDS_EMBEDDER);
  const [generateConceptsEstimate, setGenerateConceptsEstimate] = useState<AiInputEstimate | string>();
  const [generateOnlyMissingConcepts, setGenerateOnlyMissingConcepts] = useState(false);
  const [hasChaptersMissingConcepts, setHasChaptersMissingConcepts] = useState(false);
  const [fixConceptsEstimate, setFixConceptsEstimate] = useState<AiInputEstimate | string>();
  const [embeddingsEstimate, setEmbeddingsEstimate] = useState<AiInputEstimate | string>();
  const [deduplicateConceptsEstimate, setDeduplicateConceptsEstimate] = useState<AiInputEstimate | string>();
  const [sortConceptsEstimate, setSortConceptsEstimate] = useState<AiInputEstimate | string>();
  const [refineChaptersEstimate, setRefineChaptersEstimate] = useState<AiInputEstimate | string>();
  const [fixOnlyFailedConcepts, setFixOnlyFailedConcepts] = useState(false);
  const [hasFailedFixConceptChapters, setHasFailedFixConceptChapters] = useState(false);
  const [isGenerateConceptsConfirmationOpen, setIsGenerateConceptsConfirmationOpen] = useState(false);
  const [isFixConceptsConfirmationOpen, setIsFixConceptsConfirmationOpen] = useState(false);
  const [isEmbeddingsConfirmationOpen, setIsEmbeddingsConfirmationOpen] = useState(false);
  const [isDeduplicateConceptsConfirmationOpen, setIsDeduplicateConceptsConfirmationOpen] = useState(false);
  const [isSortConceptsConfirmationOpen, setIsSortConceptsConfirmationOpen] = useState(false);
  const [isRefineChaptersConfirmationOpen, setIsRefineChaptersConfirmationOpen] = useState(false);
  const [isGenerateExercisesConfirmationOpen, setIsGenerateExercisesConfirmationOpen] = useState(false);
  const [isStandardsConfirmationOpen, setIsStandardsConfirmationOpen] = useState(false);
  const [isRecognizeConfirmationOpen, setIsRecognizeConfirmationOpen] = useState(false);
  const [isPriceOpen, setIsPriceOpen] = useState(false);
  const [priceBook, setPriceBook] = useState<Book>();
  const [priceStageTimes, setPriceStageTimes] = useState<BookStageTimes>({});
  const [priceExternalCalls, setPriceExternalCalls] = useState<BookExternalCalls>({});
  const [isFastForwardConfirmationOpen, setIsFastForwardConfirmationOpen] = useState(false);
  const [isFastForwardRunning, setIsFastForwardRunning] = useState(false);
  const [fastForwardStartKey, setFastForwardStartKey] = useState<string>();
  const [fastForwardEstimate, setFastForwardEstimate] = useState<{ aiUsd: number; pageCount: number; recognitionUsd: number; remainingStages: number; totalUsd: number }>();
  const [pendingProcessingAction, setPendingProcessingAction] = useState<'chapters' | 'concepts' | 'fixConcepts' | 'embeddings' | 'deduplicateConcepts' | 'sortConcepts' | 'refineChapters' | 'recognize' | 'standards' | 'exercises'>();
  const [generateAllExercisesRequest, setGenerateAllExercisesRequest] = useState(0);
  const [generateExercisesEstimate, setGenerateExercisesEstimate] = useState<AiInputEstimate>();
  const [generateOnlyMissingExercises, setGenerateOnlyMissingExercises] = useState(false);
  const [hasConceptsMissingExercise, setHasConceptsMissingExercise] = useState(false);
  const [recognizePageCount, setRecognizePageCount] = useState<number>();
  const [standardsEstimate, setStandardsEstimate] = useState<AiInputEstimate | string>();
  const [recognizeAllRequest, setRecognizeAllRequest] = useState(0);
  const [readerFile, setReaderFile] = useState<File>();
  const [selectedId, setSelectedId] = useState<number | undefined>(getSessionBookId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getSetting(SettingKey.CONCEPTS_EMBEDDER)
      .then((storedModel) => {
        if (storedModel) {
          setEmbeddingModel(storedModel);
        }
      })
      .catch(() => undefined);
  }, []);

  const loadBooks = useCallback(async (): Promise<void> => {
    let storedBooks = await getBooks();

    for (const book of storedBooks) {
      if (!book.contentHash) {
        try {
          const file = await readPdf(book.opfsName);
          const contentHash = await getContentHash(new Uint8Array(await file.arrayBuffer()));

          await updateBookFields(book.id, { contentHash });
        } catch {
          // A missing file or an existing duplicate should not prevent other books from loading.
        }
      }
    }

    storedBooks = await getBooks();

    setBooks(storedBooks);
    setSelectedId((current) => storedBooks.some(({ id }) => id === current) ? current : storedBooks[0]?.id);
  }, []);

  useEffect((): void => {
    loadBooks().catch(() => setError(t('Unable to load uploaded books.')));
  }, [loadBooks, t]);

  useEffect((): void => {
    try {
      if (selectedId === undefined) {
        sessionStorage.removeItem(SELECTED_BOOK_SESSION_KEY);
      } else {
        sessionStorage.setItem(SELECTED_BOOK_SESSION_KEY, String(selectedId));
      }
    } catch {
      // Session storage may be unavailable in privacy-restricted browser contexts.
    }
  }, [selectedId]);

  const selectedBook = useMemo(
    () => books.find(({ id }) => id === selectedId),
    [books, selectedId]
  );
  const selectedBookOpfsName = selectedBook?.opfsName;
  const totalSpend = useMemo(
    () => PRICE_STAGES.reduce((total, { key }) => total + (priceBook?.stageSpend?.[key] ?? 0), 0),
    [priceBook]
  );
  const totalStageTime = useMemo(
    () => PRICE_STAGES.reduce((total, { key }) => total + (priceStageTimes[key] ?? 0), 0),
    [priceStageTimes]
  );
  const totalExternalCalls = useMemo(
    () => PRICE_STAGES.reduce((total, { key }) => total + bookExternalCallTotal(priceExternalCalls[key]), 0),
    [priceExternalCalls]
  );
  useEffect(() => {
    let active = true;
    const opfsName = selectedBookOpfsName;

    setReaderFile(undefined);

    if (opfsName) {
      readPdf(opfsName)
        .then((file) => active && setReaderFile(file))
        .catch(() => active && setError(t('Unable to open this PDF.')));
    }

    return () => {
      active = false;
    };
  }, [selectedBookOpfsName, t]);

  const options = useMemo(
    () => books.map(({ id, name }) => ({ key: id, text: name, value: id })),
    [books]
  );

  const onPrice = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setPriceBook(selectedBook);
    setPriceStageTimes(loadBookStageTimes(selectedBook.id));
    setPriceExternalCalls(loadBookExternalCalls(selectedBook.id));
    setIsPriceOpen(true);
    getBook(selectedBook.id)
      .then((storedBook) => {
        if (storedBook) {
          setPriceBook(storedBook);
        }
      })
      .catch(() => setError(t('Unable to load book spending.')));
  }, [selectedBook, t]);

  const closePrice = useCallback((): void => {
    setIsPriceOpen(false);
    setPriceBook(undefined);
    setPriceStageTimes({});
    setPriceExternalCalls({});
  }, []);

  const onFastForward = useCallback((startKey: string): void => {
    if (!selectedBook || !readerFile || isFastForwardRunning) {
      return;
    }

    const requestedStartIndex = PRICE_STAGES.findIndex(({ key }) => key === startKey);

    if (requestedStartIndex < 0) {
      return;
    }

    setFastForwardStartKey(startKey);
    setFastForwardEstimate(undefined);
    setIsFastForwardConfirmationOpen(true);

    let document: PDFDocumentProxy | undefined;

    const calculate = async (): Promise<void> => {
      const { getDocument } = await loadPdfJs();
      const task = getDocument({ data: new Uint8Array(await readerFile.arrayBuffer()) });

      document = await task.promise;

      const remaining = PRICE_STAGES.slice(requestedStartIndex);
      const pageCount = document.numPages;
      const recognitionUsd = remaining.some(({ key }) => key === 'recognize') ? pageCount * MATHPIX_PDF_PAGE_PRICE_USD : 0;
      const remainingAiStages = remaining.filter(({ key }) => key !== 'recognize');
      const recordedStageCosts = PRICE_STAGES.flatMap(({ key }) => {
        const value = selectedBook.stageSpend?.[key] ?? 0;

        return value > 0 ? [value] : [];
      }).sort((a, b) => a - b);
      const typicalRecordedCost = recordedStageCosts.length
        ? recordedStageCosts[Math.floor(recordedStageCosts.length / 2)]
        : 0;
      const syntheticInputLength = Math.min(120_000, Math.max(4_000, pageCount * 900));
      const embeddingStages = remainingAiStages.filter(({ key }) => key === 'embeddings');
      const standardStages = remainingAiStages.filter(({ key }) => key === 'standards');
      const regularStages = remainingAiStages.filter(({ key }) => key !== 'standards' && key !== 'embeddings');
      const regularFallback = regularStages.length
        ? estimateAiInput(DEFAULT_PROCESSING_MODEL, regularStages.map(() => 'x'.repeat(syntheticInputLength)), 1_200).totalPriceUsd / regularStages.length
        : 0;
      const embeddingsFallback = embeddingStages.length
        ? estimateAiInput(embeddingModel, embeddingStages.map(() => 'x'.repeat(syntheticInputLength)), 0).totalPriceUsd / embeddingStages.length
        : 0;
      const standardsFallback = standardStages.length
        ? (estimateAiInput(embeddingModel, standardStages.map(() => 'x'.repeat(syntheticInputLength)), 0).totalPriceUsd +
          estimateAiInput(DEFAULT_STANDARDS_MODEL, standardStages.flatMap(() => Array.from({ length: STANDARDS_MATCH_RUNS }, () => 'x'.repeat(Math.min(24_000, syntheticInputLength)))), 300).totalPriceUsd) / standardStages.length
        : 0;
      const aiUsd = remainingAiStages.reduce((total, { key }) => {
        const recorded = selectedBook.stageSpend?.[key] ?? 0;
        const fallback = key === 'standards' ? standardsFallback : key === 'embeddings' ? embeddingsFallback : regularFallback;

        const useSpecializedFallback = key === 'embeddings' || key === 'standards';

        return total + (recorded > 0 ? recorded : !useSpecializedFallback && typicalRecordedCost > 0 ? typicalRecordedCost : fallback);
      }, 0);

      setFastForwardEstimate({
        aiUsd,
        pageCount,
        recognitionUsd,
        remainingStages: remaining.length,
        totalUsd: recognitionUsd + aiUsd
      });
    };

    calculate()
      .catch(() => setError(t('Unable to estimate the fast-forward processing cost.')))
      .finally(() => document?.destroy().catch(console.error));
  }, [embeddingModel, isFastForwardRunning, readerFile, selectedBook, t]);

  const closeFastForwardConfirmation = useCallback((): void => {
    setIsFastForwardConfirmationOpen(false);
    setFastForwardStartKey(undefined);
  }, []);

  const confirmFastForward = useCallback(async (): Promise<void> => {
    if (!selectedBook || !fastForwardStartKey || !fastForwardEstimate || fastForwardEstimate.remainingStages === 0) {
      return;
    }

    try {
      const resetBook = await resetBookProcessingStagesFrom(selectedBook.id, fastForwardStartKey as BookProcessingStageKey);

      if (resetBook) {
        setBooks((current) => current.map((book) => book.id === resetBook.id ? resetBook : book));
      }

      setGenerateAllConceptsModel(DEFAULT_PROCESSING_MODEL);
      setStandardsModel(DEFAULT_STANDARDS_MODEL);
      setIsFastForwardConfirmationOpen(false);
      setIsFastForwardRunning(true);
    } catch {
      setError(t('Unable to prepare the selected stage for fast-forward processing.'));
    }
  }, [fastForwardEstimate, fastForwardStartKey, selectedBook, t]);

  const abortFastForward = useCallback((): void => {
    setIsFastForwardRunning(false);
  }, []);

  const onFastForwardComplete = useCallback((): void => {
    setIsFastForwardRunning(false);
    setFastForwardStartKey(undefined);
    setPendingProcessingAction(undefined);
    getBooks().then(setBooks).catch(() => setError(t('Unable to refresh book processing stages.')));
  }, [t]);

  const onUpload = useCallback(async (contents: Uint8Array, name: string): Promise<void> => {
    setError('');

    if (String.fromCharCode(...contents.slice(0, 5)) !== '%PDF-') {
      setError(t('The selected file is not a valid PDF.'));

      return;
    }

    setIsBusy(true);

    let id: number | undefined;
    let opfsName: string | undefined;

    try {
      const contentHash = await getContentHash(contents);
      const existingBook = await getBookByContentHash(contentHash);

      if (existingBook) {
        setSelectedId(existingBook.id);

        return;
      }

      id = await createBook({ contentHash, created: Date.now(), name, opfsName: '', size: contents.byteLength });
      opfsName = `${id}.pdf`;
      await writePdf(opfsName, contents);
      await updateBookFields(id, { opfsName });
      await loadBooks();
      setSelectedId(id);
    } catch {
      try {
        if (opfsName) {
          await removePdf(opfsName);
        }
      } catch {
        // The file may not have been created yet.
      }

      if (id !== undefined) {
        try {
          await deleteBook(id);
        } catch {
          // Preserve the original upload error if cleanup also fails.
        }
      }

      setError(t('Unable to store this PDF.'));
    } finally {
      setIsBusy(false);
    }
  }, [loadBooks, t]);

  const onChooseFile = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';

    if (file) {
      file.arrayBuffer()
        .then((buffer) => onUpload(new Uint8Array(buffer), file.name))
        .catch(() => setError(t('Unable to read this PDF.')));
    }
  }, [onUpload, t]);

  const onRecognize = useCallback((): void => {
    setRecognizePageCount(undefined);
    setIsRecognizeConfirmationOpen(true);
  }, []);

  useEffect(() => {
    if (!isRecognizeConfirmationOpen || !readerFile) {
      return;
    }

    let active = true;
    let document: PDFDocumentProxy | undefined;

    const calculate = async (): Promise<void> => {
      const { getDocument } = await loadPdfJs();
      const task = getDocument({ data: new Uint8Array(await readerFile.arrayBuffer()) });

      document = await task.promise;

      if (active) {
        setRecognizePageCount(document.numPages);
      }
    };

    calculate().catch(() => {
      if (active) {
        setRecognizePageCount(undefined);
        setError(t('Unable to estimate the Mathpix cost.'));
      }
    });

    return () => {
      active = false;
      document?.destroy().catch(console.error);
    };
  }, [isRecognizeConfirmationOpen, readerFile, t]);

  const closeRecognizeConfirmation = useCallback((): void => {
    setIsRecognizeConfirmationOpen(false);
  }, []);

  const confirmRecognize = useCallback((): void => {
    setIsRecognizeConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('recognize');

    updateBookFieldsAndStages(selectedBook.id, { age: undefined, language: undefined, subject: undefined }, { resetFrom: 'recognize' }).then((resetBook) => {
      if (!resetBook) {
        throw new Error('Book not found.');
      }

      setBooks((current) => current.map((book) => book.id === resetBook.id ? resetBook : book));
      setRecognizeAllRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset recognition, language, subject, and age.'));
    });
  }, [selectedBook, t]);

  const onShowLanguage = useCallback((): void => {
    if (!selectedBook || !isBookProcessingStageComplete(selectedBook, 'recognize')) {
      return;
    }

    setError('');
    setLanguageTabRequest((request) => request + 1);
  }, [selectedBook]);

  const onShowSubject = useCallback((): void => {
    if (!selectedBook || !isBookProcessingStageComplete(selectedBook, 'recognize')) {
      return;
    }

    if (!selectedBook.language) {
      setError(t('Book language has not been set yet. Open the Language step, then detect it from text or choose it manually.'));
      return;
    }

    setError('');
    setSubjectTabRequest((request) => request + 1);
  }, [selectedBook, t]);

  const onShowAge = useCallback((): void => {
    if (!selectedBook || !isBookProcessingStageComplete(selectedBook, 'recognize')) {
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

    setError('');
    setAgeTabRequest((request) => request + 1);
  }, [selectedBook, t]);

  const onIdentifyChapters = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setError('');
    setIdentifyChaptersEstimate(undefined);
    setIsIdentifyChaptersConfirmationOpen(true);
  }, [selectedBook]);

  useEffect(() => {
    if (!isIdentifyChaptersConfirmationOpen || !selectedBook) {
      return;
    }

    let active = true;

    const calculate = async (): Promise<void> => {
      const pages = await getBookPages(selectedBook.id);
      const compactPages = pages.map(({ mathpixHeadings, pageMMD = '', pageNumber }) => `Page ${pageNumber}\n${(mathpixHeadings ?? []).map(({ text, type }) => `[${type}] ${text}`).join(' | ')}\n${pageMMD.replace(/\s+/g, ' ').slice(0, 650)}`);
      const windowSize = 36;
      const overlap = 3;
      const step = windowSize - overlap;
      const requests: string[] = [];

      for (let start = 0; start < compactPages.length; start += step) {
        requests.push(compactPages.slice(start, start + windowSize).join('\n\n').padEnd(compactPages.slice(start, start + windowSize).join('\n\n').length + 1_500));

        if (start + windowSize >= compactPages.length) {
          break;
        }
      }

      requests.push(compactPages.filter((_, index) => (pages[index]?.mathpixHeadings?.length ?? 0) > 0).join('\n').padEnd(2_000));

      if (active) {
        setIdentifyChaptersEstimate(estimateAiInput(generateAllConceptsModel, requests, Math.max(2_000, pages.length * 12)));
      }
    };

    calculate().catch(() => {
      if (active) {
        setError(t('Unable to estimate chapter identification cost.'));
      }
    });

    return () => {
      active = false;
    };
  }, [generateAllConceptsModel, isIdentifyChaptersConfirmationOpen, selectedBook, t]);

  const closeIdentifyChaptersConfirmation = useCallback((): void => {
    setIsIdentifyChaptersConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmIdentifyChapters = useCallback((): void => {
    setIsIdentifyChaptersConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('chapters');

    resetBookProcessingStagesFrom(selectedBook.id, 'chapters').then((updatedBook) => {
      clearFixConceptsChapterStatuses(selectedBook.id);
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setIdentifyChaptersRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [selectedBook, t]);

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
  }, [selectedBook, t]);

  const onRetryMissingConcepts = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setGenerateConceptsEstimate(undefined);
    setGenerateOnlyMissingConcepts(true);
    setHasChaptersMissingConcepts(true);
    setIsGenerateConceptsConfirmationOpen(true);
  }, [selectedBook]);

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
  }, [generateAllConceptsModel, generateOnlyMissingConcepts, isGenerateConceptsConfirmationOpen, selectedBook, t]);

  const closeGenerateConceptsConfirmation = useCallback((): void => {
    setIsGenerateConceptsConfirmationOpen(false);
    setGenerateOnlyMissingConcepts(false);
    setHasChaptersMissingConcepts(false);
    setPendingProcessingAction(undefined);
  }, []);

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

      setGenerateAllConceptsRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [generateOnlyMissingConcepts, selectedBook, t]);

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
  }, [selectedBook, t]);

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
  }, [fixOnlyFailedConcepts, generateAllConceptsModel, isFixConceptsConfirmationOpen, selectedBook, t]);

  const closeFixConceptsConfirmation = useCallback((): void => {
    setIsFixConceptsConfirmationOpen(false);
    setFixOnlyFailedConcepts(false);
    setHasFailedFixConceptChapters(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmFixConcepts = useCallback((): void => {
    setIsFixConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('fixConcepts');
    setFixAllConceptsRequest((request) => request + 1);
  }, [selectedBook]);

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
  }, [selectedBook, t]);

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
  }, [embeddingModel, isEmbeddingsConfirmationOpen, selectedBook, t]);

  const closeEmbeddingsConfirmation = useCallback((): void => {
    setIsEmbeddingsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
    getSetting(SettingKey.CONCEPTS_EMBEDDER)
      .then((storedModel) => setEmbeddingModel(storedModel || DEFAULT_STANDARDS_EMBEDDER))
      .catch(() => setEmbeddingModel(DEFAULT_STANDARDS_EMBEDDER));
  }, []);

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

      setEmbedAllConceptsRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [selectedBook, t]);

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
  }, [selectedBook, t]);

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
  }, [embeddingModel, generateAllConceptsModel, isDeduplicateConceptsConfirmationOpen, selectedBook, t]);

  const closeDeduplicateConceptsConfirmation = useCallback((): void => {
    setIsDeduplicateConceptsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmDeduplicateConcepts = useCallback((): void => {
    setIsDeduplicateConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('deduplicateConcepts');
    setDeduplicateAllConceptsRequest((request) => request + 1);
  }, [selectedBook]);

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
  }, [selectedBook, t]);

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
  }, [generateAllConceptsModel, isSortConceptsConfirmationOpen, selectedBook, t]);

  const closeSortConceptsConfirmation = useCallback((): void => {
    setIsSortConceptsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

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
        setSortAllConceptsRequest((request) => request + 1);
      })
      .catch(() => {
        setPendingProcessingAction(undefined);
        setError(t('Unable to invalidate the Refine chapters stage before sorting.'));
      });
  }, [selectedBook, t]);

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
  }, [selectedBook, t]);

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
  }, [generateAllConceptsModel, isRefineChaptersConfirmationOpen, selectedBook, t]);

  const closeRefineChaptersConfirmation = useCallback((): void => {
    setIsRefineChaptersConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmRefineChapters = useCallback((): void => {
    setIsRefineChaptersConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('refineChapters');
    setRefineAllChaptersRequest((request) => request + 1);
  }, [selectedBook]);

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
  }, [selectedBook, t]);

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
  }, [embeddingModel, isStandardsConfirmationOpen, selectedBook, standardsModel, t]);

  const closeStandardsConfirmation = useCallback((): void => {
    setIsStandardsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

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

      setAssignAllStandardsRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [selectedBook, t]);

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
  }, [selectedBook, t]);

  const onRetryMissingExercises = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setGenerateExercisesEstimate(undefined);
    setGenerateOnlyMissingExercises(true);
    setHasConceptsMissingExercise(true);
    setIsGenerateExercisesConfirmationOpen(true);
  }, [selectedBook]);

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
  }, [generateAllConceptsModel, generateOnlyMissingExercises, isGenerateExercisesConfirmationOpen, selectedBook, t]);

  const closeGenerateExercisesConfirmation = useCallback((): void => {
    setIsGenerateExercisesConfirmationOpen(false);
    setGenerateOnlyMissingExercises(false);
    setHasConceptsMissingExercise(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmGenerateExercises = useCallback((): void => {
    setIsGenerateExercisesConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('exercises');

    resetBookProcessingStagesFrom(selectedBook.id, generateOnlyMissingExercises ? 'fixExercises' : 'exercises').then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setGenerateAllExercisesRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [generateOnlyMissingExercises, selectedBook, t]);

  useEffect((): void => {
    if (!isFastForwardRunning) {
      return;
    }

    if (isRecognizeConfirmationOpen) {
      confirmRecognize();
    } else if (isIdentifyChaptersConfirmationOpen) {
      confirmIdentifyChapters();
    } else if (isGenerateConceptsConfirmationOpen) {
      confirmGenerateConcepts();
    } else if (isFixConceptsConfirmationOpen) {
      confirmFixConcepts();
    } else if (isEmbeddingsConfirmationOpen) {
      confirmEmbeddings();
    } else if (isDeduplicateConceptsConfirmationOpen) {
      confirmDeduplicateConcepts();
    } else if (isSortConceptsConfirmationOpen) {
      confirmSortConcepts();
    } else if (isRefineChaptersConfirmationOpen) {
      confirmRefineChapters();
    } else if (isGenerateExercisesConfirmationOpen) {
      confirmGenerateExercises();
    } else if (isStandardsConfirmationOpen) {
      confirmAssignStandards();
    }
  }, [confirmAssignStandards, confirmDeduplicateConcepts, confirmEmbeddings, confirmFixConcepts, confirmGenerateConcepts, confirmGenerateExercises, confirmIdentifyChapters, confirmRecognize, confirmRefineChapters, confirmSortConcepts, isDeduplicateConceptsConfirmationOpen, isEmbeddingsConfirmationOpen, isFastForwardRunning, isFixConceptsConfirmationOpen, isGenerateConceptsConfirmationOpen, isGenerateExercisesConfirmationOpen, isIdentifyChaptersConfirmationOpen, isRecognizeConfirmationOpen, isRefineChaptersConfirmationOpen, isSortConceptsConfirmationOpen, isStandardsConfirmationOpen]);

  const onDelete = useCallback(async (): Promise<void> => {
    if (!selectedBook) {
      return;
    }

    setError('');
    setIsBusy(true);

    try {
      await removePdf(selectedBook.opfsName);
      await deleteBook(selectedBook.id);
      clearFixConceptsChapterStatuses(selectedBook.id);
      clearBookStageTimes(selectedBook.id);
      clearBookExternalCalls(selectedBook.id);

      const remaining = books.filter(({ id }) => id !== selectedBook.id);

      setBooks(remaining);
      setSelectedId(remaining[0]?.id);
    } catch {
      setError(t('Unable to delete this PDF.'));
    } finally {
      setIsBusy(false);
    }
  }, [books, selectedBook, t]);

  const onBookChange = useCallback((updatedBook: Book): void => {
    setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
  }, []);
  const onProcessingComplete = useCallback((): void => {
    setPendingProcessingAction(undefined);

    // Re-read persisted named stage completion after a pipeline action. This is
    // the state that enables the next toolbar button, and it must not depend
    // on whether the current page happened to produce any concepts.
    getBooks()
      .then(setBooks)
      .catch(() => setError(t('Unable to refresh book processing stages.')));
  }, [t]);

  return (
    <StyledSection>
      {isFastForwardConfirmationOpen && <StageRunPricePopup
        header={t('Run remaining stages')}
        isRunDisabled={!fastForwardEstimate || fastForwardEstimate.remainingStages === 0}
        onClose={closeFastForwardConfirmation}
        onRun={confirmFastForward}
        runLabel={t('Run')}
      >
        <PriceContent>
          <p className='priceIntro'>{t('Run every remaining processing stage automatically, one by one. Publishing to blockchain is not included.')}</p>
          {!fastForwardEstimate
            ? <div className='fastForwardEstimateStatus'>{t('Calculating price estimate…')}</div>
            : <>
              <div className='fastForwardEstimateHeading'>
                <strong>{t('Estimated processing cost')}</strong>
                <span className='fastForwardStageBadge'>{fastForwardEstimate.remainingStages} {t(fastForwardEstimate.remainingStages === 1 ? 'stage' : 'stages')}</span>
              </div>
              <div className='priceTableFrame'>
                <table className='priceTable fastForwardPriceTable'>
                  <tbody>
                    <tr className={fastForwardEstimate.recognitionUsd === 0 ? 'isZero' : undefined}>
                      <th scope='row'>
                        {t('Mathpix recognition')}
                        <small className='priceSource'>{fastForwardEstimate.pageCount.toLocaleString()} {t(fastForwardEstimate.pageCount === 1 ? 'page' : 'pages')}</small>
                      </th>
                      <td>{formatOpenRouterSpend(fastForwardEstimate.recognitionUsd)}</td>
                    </tr>
                    <tr className={fastForwardEstimate.aiUsd === 0 ? 'isZero' : undefined}>
                      <th scope='row'>
                        {t('AI / processing')}
                        <small className='priceSource'>{t('Remaining automated processing')}</small>
                      </th>
                      <td>{formatOpenRouterSpend(fastForwardEstimate.aiUsd)}</td>
                    </tr>
                  </tbody>
                  <tfoot>
                    <tr>
                      <th scope='row'>{t('Estimated total')}</th>
                      <td>≈ {formatOpenRouterSpend(fastForwardEstimate.totalUsd)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
              <p className='fastForwardEstimateFootnote'>{t('Based on the current book size, default models for each stage, and recorded stage costs when available. Later stages may cost more or less as earlier stages create content.')}</p>
            </>}
        </PriceContent>
      </StageRunPricePopup>}
      {isPriceOpen && <PriceModal
        header={t('Statistics')}
        onClose={closePrice}
        size='small'
      >
        <Modal.Content>
          <PriceContent>
            <div className='priceTableFrame'>
              <table className='priceTable'>
                <colgroup>
                  <col className='priceStageColumn' />
                  <col className='priceCallsColumn' />
                  <col className='priceValueColumn' />
                  <col className='priceTimeColumn' />
                </colgroup>
                <thead>
                  <tr>
                    <th scope='col'>{t('Stage')}</th>
                    <th scope='col'>{t('External calls')}</th>
                    <th scope='col'>{t('Price, $')}</th>
                    <th scope='col'>{t('Time, s')}</th>
                  </tr>
                </thead>
                <tbody>
                  {PRICE_STAGES.map(({ detail, key, label }) => {
                    const value = priceBook?.stageSpend?.[key] ?? 0;
                    const elapsedMs = priceStageTimes[key] ?? 0;
                    const externalCalls = priceExternalCalls[key];

                    return <tr className={value === 0 && elapsedMs === 0 && bookExternalCallTotal(externalCalls) === 0 ? 'isZero' : undefined} key={key}>
                      <th scope='row'>{t(label)}{detail && <small className='priceSource'>{detail}</small>}</th>
                      <td className='priceCallsCell'>{bookExternalCallTotal(externalCalls).toLocaleString()}</td>
                      <td>{formatOpenRouterSpend(value)}</td>
                      <td>{formatBookStageTime(elapsedMs)}</td>
                    </tr>;
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope='row'>{t('Total')}</th>
                    <td className='priceCallsCell'>{totalExternalCalls.toLocaleString()}</td>
                    <td>{formatOpenRouterSpend(totalSpend)}</td>
                    <td>{formatBookStageTime(totalStageTime)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </PriceContent>
        </Modal.Content>
      </PriceModal>}
      {isRecognizeConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Recognize pages')}
        onClose={closeRecognizeConfirmation}
        onRun={confirmRecognize}
        runLabel={t('Run')}
      >
        <p>{t('Recognize every page in this book?')}</p>
        <UnitPriceEstimate
          count={recognizePageCount}
          lineLabel='Mathpix v3/pdf'
          title={t('Estimated Mathpix cost')}
          unitLabel='page'
          unitPriceUsd={MATHPIX_PDF_PAGE_PRICE_USD}
        />
      </StageRunPricePopup>}
      {isIdentifyChaptersConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Identify chapters')}
        onClose={closeIdentifyChaptersConfirmation}
        onRun={confirmIdentifyChapters}
        runLabel={t('Run')}
      >
        <p>{t('Use PDF bookmarks as chapter boundaries when available. Otherwise identify chapters from recognized page text.')}</p>
        <p>{t('If bookmarks are unavailable, page-text detection needs a book language and may use AI.')}</p>
        <AiPriceEstimate
          estimate={identifyChaptersEstimate}
          title={t('Estimated AI cost if page-text detection is needed')}
        />
        <p>{t('You can manually rename chapters, start a chapter on any page, merge chapters, or assign individual pages afterward.')}</p>
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setGenerateAllConceptsModel}
          providerLabel={t('Provider')}
          value={generateAllConceptsModel}
        />
      </StageRunPricePopup>}
      {isGenerateConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Generate concepts')}
        onClose={closeGenerateConceptsConfirmation}
        onRun={confirmGenerateConcepts}
        runLabel={t('Run')}
      >
        <p>{t('Generate concepts chapter-by-chapter for this book? Each concept will be stored on the page where it is first introduced.')}</p>
        <Toggle
          isDisabled={!selectedBook || !hasChaptersMissingConcepts}
          label={t('Only for chapters missing concepts')}
          onChange={setGenerateOnlyMissingConcepts}
          value={generateOnlyMissingConcepts}
        />
        <AiPriceEstimate estimate={generateConceptsEstimate} />
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setGenerateAllConceptsModel}
          providerLabel={t('Provider')}
          requiredInputModalities={['image']}
          value={generateAllConceptsModel}
        />
      </StageRunPricePopup>}
      {isFixConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Fix concepts')}
        onClose={closeFixConceptsConfirmation}
        onRun={confirmFixConcepts}
        runLabel={t('Run')}
      >
        <p>{t('Review each chapter’s source text and current concept list using the book topic, language, and learner age. Fix concepts can propose strongly implied missing concepts and flag existing concepts that clearly do not belong to the chapter. You can add or remove concepts in the review before anything is saved.')}</p>
        <Toggle
          isDisabled={!hasFailedFixConceptChapters}
          label={t('Only retry chapters that failed the last Fix concepts run')}
          onChange={setFixOnlyFailedConcepts}
          value={fixOnlyFailedConcepts}
        />
        <AiPriceEstimate estimate={fixConceptsEstimate} />
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setGenerateAllConceptsModel}
          providerLabel={t('Provider')}
          value={generateAllConceptsModel}
        />
      </StageRunPricePopup>}
      {isEmbeddingsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Embedings')}
        onClose={closeEmbeddingsConfirmation}
        onRun={confirmEmbeddings}
        runLabel={t('Run')}
      >
        <p>{t('Calculate and cache embeddings for every current concept after Fix concepts. These vectors are used to shortlist likely duplicates before AI confirmation and are reused later when matching standards.')}</p>
        <AiPriceEstimate estimate={embeddingsEstimate} />
        <OpenRouterEmbeddingModelSelector
          className='batchModelSelect'
          label={t('Embedding model')}
          onChange={setEmbeddingModel}
          value={embeddingModel}
        />
      </StageRunPricePopup>}
      {isDeduplicateConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Deduplicate concepts')}
        onClose={closeDeduplicateConceptsConfirmation}
        onRun={confirmDeduplicateConcepts}
        runLabel={t('Run')}
      >
        <p>{t('Use the cached concept Embedings to generate a small set of semantically close deletion candidates, then send only those candidates to the selected AI model for confirmation. Nothing is deleted until you review the confirmed duplicate groups. For every confirmed duplicate group, the concept with the lowest chapter id is kept; ties inside the same chapter are broken by the lowest concept id, and every other concept in the group is proposed for deletion.')}</p>
        <AiPriceEstimate estimate={deduplicateConceptsEstimate} />
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setGenerateAllConceptsModel}
          providerLabel={t('Provider')}
          value={generateAllConceptsModel}
        />
      </StageRunPricePopup>}
      {isSortConceptsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Sort concepts')}
        onClose={closeSortConceptsConfirmation}
        onRun={confirmSortConcepts}
        runLabel={t('Run')}
      >
        <p>{t('Sort each original chapter independently into a Zone of Proximal Development progression for the configured learner age. Concepts from different chapters are never included in the same sorting request or saved in the same reorder operation. Only the relative order inside each chapter may change; chapter boundaries stay fixed.')}</p>
        <AiPriceEstimate estimate={sortConceptsEstimate} />
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setGenerateAllConceptsModel}
          providerLabel={t('Provider')}
          value={generateAllConceptsModel}
        />
      </StageRunPricePopup>}
      {isRefineChaptersConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Refine chapters')}
        onClose={closeRefineChaptersConfirmation}
        onRun={confirmRefineChapters}
        runLabel={t('Run')}
      >
        <p>{t('Process each original chapter independently, clustering only the concepts that already belong to that chapter. Concepts from different original chapters are never placed in the same clustering request and can never be reordered together. Within each original chapter, Refine chapters may cut the already-sorted concept sequence into one, two, or three contiguous thematic groups, targeting roughly 7–10 concepts per resulting chapter when the themes support it.')}</p>
        <AiPriceEstimate estimate={refineChaptersEstimate} />
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setGenerateAllConceptsModel}
          providerLabel={t('Provider')}
          value={generateAllConceptsModel}
        />
      </StageRunPricePopup>}
      {isStandardsConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Standards')}
        onClose={closeStandardsConfirmation}
        onRun={confirmAssignStandards}
        runLabel={t('Run')}
      >
        <p>{t('Match standards for every chapter from its extracted concepts? The same embedding model selected in Embedings is used to embed the standards catalogs, while the cached concept vectors are reused to reduce every framework to the nearest candidates. Only those candidates are sent to the selected AI model three times, and a standard is kept when at least two runs agree.')}</p>
        <AiPriceEstimate estimate={standardsEstimate} />
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setStandardsModel}
          providerLabel={t('Provider')}
          value={standardsModel}
        />
      </StageRunPricePopup>}
      {isGenerateExercisesConfirmationOpen && !isFastForwardRunning && <StageRunPricePopup
        header={t('Generate exercises')}
        onClose={closeGenerateExercisesConfirmation}
        onRun={confirmGenerateExercises}
        runLabel={t('Run')}
      >
        <p>{t('Generate one succinct, transformation-first exercise per concept, keep one per non-overlapping book exercise, and skip book exercises already covered by concepts?')}</p>
        <Toggle
          isDisabled={!hasConceptsMissingExercise}
          label={t('Only for concepts, missing an exercise')}
          onChange={setGenerateOnlyMissingExercises}
          value={generateOnlyMissingExercises}
        />
        <AiPriceEstimate estimate={generateExercisesEstimate} />
        <OpenRouterModelSelector
          className='batchModelSelect'
          modelLabel={t('Model')}
          onChange={setGenerateAllConceptsModel}
          providerLabel={t('Provider')}
          value={generateAllConceptsModel}
        />
      </StageRunPricePopup>}
      <div className='bookToolbar'>
        <div className='bookToolbarPrimary'>
          <Button
            className='uploadButton'
            icon='upload'
            isDisabled={isBusy || isFastForwardRunning}
            label={t('Upload')}
            onClick={onChooseFile}
          />
          <Dropdown
            className='bookSelect'
            isDisabled={!books.length || isBusy || isFastForwardRunning}
            isFull
            label={t('Uploaded books')}
            onChange={setSelectedId}
            options={options}
            placeholder={t('No books uploaded')}
            value={selectedId}
          />
          <Button
            className='deleteButton'
            icon='trash'
            isDisabled={!selectedBook || isBusy || isFastForwardRunning}
            onClick={onDelete}
          />
        </div>
        <input
          accept='application/pdf,.pdf'
          className='fileInput'
          onChange={onFileChange}
          ref={fileInputRef}
          type='file'
        />
      </div>
      {error && (
        <p
          className='errorMessage'
          role='alert'
        >{error}</p>
      )}
      {selectedBook && readerFile && (
        <React.Suspense fallback={<p>{t('Loading PDF reader…')}</p>}>
          <BookReader
            assignAllStandardsRequest={assignAllStandardsRequest}
            autoRunAll={isFastForwardRunning}
            autoRunStartKey={fastForwardStartKey}
            book={selectedBook}
            deduplicateAllConceptsRequest={deduplicateAllConceptsRequest}
            embedAllConceptsRequest={embedAllConceptsRequest}
            embeddingModel={embeddingModel}
            fixAllConceptsRequest={fixAllConceptsRequest}
            fixOnlyFailedConcepts={fixOnlyFailedConcepts}
            sortAllConceptsRequest={sortAllConceptsRequest}
            refineAllChaptersRequest={refineAllChaptersRequest}
            key={selectedBook.id}
            file={readerFile}
            generateAllConceptsModel={generateAllConceptsModel}
            languageTabRequest={languageTabRequest}
            subjectTabRequest={subjectTabRequest}
            standardsModel={standardsModel}
            ageTabRequest={ageTabRequest}
            generateAllConceptsRequest={generateAllConceptsRequest}
            generateOnlyMissingConcepts={generateOnlyMissingConcepts}
            identifyChaptersRequest={identifyChaptersRequest}
            isPriceDisabled={!selectedBook || isBusy || isFastForwardRunning}
            onAbortFastForward={abortFastForward}
            onAutoRunComplete={onFastForwardComplete}
            onBookChange={onBookChange}
            onFastForward={onFastForward}
            onPrice={onPrice}
            onProcessingComplete={onProcessingComplete}
            pendingProcessingAction={pendingProcessingAction}
            processingToolbar={[
              {
                key: 'recognize',
                label: t('Recognize'),
                isDone: isBookProcessingStageComplete(selectedBook, 'recognize'),
                isDisabled: !readerFile || isBusy,
                onClick: onRecognize
              },
              {
                key: 'language',
                label: t('Language'),
                isDone: isBookProcessingStageComplete(selectedBook, 'language'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'recognize'),
                onClick: onShowLanguage
              },
              {
                key: 'subject',
                label: t('Subject'),
                isDone: isBookProcessingStageComplete(selectedBook, 'subject'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'language') || !selectedBook.language,
                onClick: onShowSubject
              },
              {
                key: 'age',
                label: t('Age'),
                isDone: isBookProcessingStageComplete(selectedBook, 'age'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'subject') || !selectedBook.subject,
                onClick: onShowAge
              },
              {
                key: 'chapters',
                label: t('Chapters'),
                isDone: isBookProcessingStageComplete(selectedBook, 'chapters'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'age'),
                onClick: onIdentifyChapters
              },
              {
                key: 'concepts',
                label: t('Concepts'),
                isDone: isBookProcessingStageComplete(selectedBook, 'concepts'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'chapters') || !selectedBook.language || !selectedBook.subject,
                onClick: onGenerateConcepts,
                onRetryMissing: onRetryMissingConcepts
              },
              {
                key: 'fixConcepts',
                label: t('Fix concepts'),
                isDone: isBookProcessingStageComplete(selectedBook, 'fixConcepts'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'concepts') || !selectedBook.language || !selectedBook.subject || selectedBook.age === undefined,
                onClick: onFixConcepts
              },
              {
                key: 'embeddings',
                label: t('Embedings'),
                isDone: isBookProcessingStageComplete(selectedBook, 'embeddings'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'fixConcepts'),
                onClick: onEmbeddings
              },
              {
                key: 'deduplicateConcepts',
                label: t('Deduplicate concepts'),
                isDone: isBookProcessingStageComplete(selectedBook, 'deduplicateConcepts'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'embeddings') || !selectedBook.language || !selectedBook.subject || selectedBook.age === undefined,
                onClick: onDeduplicateConcepts
              },
              {
                key: 'sortConcepts',
                label: t('Sort concepts'),
                isDone: isBookProcessingStageComplete(selectedBook, 'sortConcepts'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'deduplicateConcepts') || !selectedBook.language || !selectedBook.subject || selectedBook.age === undefined,
                onClick: onSortConcepts
              },
              {
                key: 'refineChapters',
                label: t('Refine chapters'),
                isDone: isBookProcessingStageComplete(selectedBook, 'sortConcepts') && isRefineChaptersComplete(selectedBook),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'sortConcepts') || !selectedBook.language || !selectedBook.subject || selectedBook.age === undefined,
                onClick: onRefineChapters
              },
              {
                key: 'exercises',
                label: t('Exercises'),
                isDone: isBookProcessingStageComplete(selectedBook, 'exercises'),
                isDisabled: !readerFile || isBusy || !isRefineChaptersComplete(selectedBook) || !selectedBook.language || !selectedBook.subject,
                onClick: onGenerateExercises,
                onRetryMissing: onRetryMissingExercises
              }
            ]}
            processingToolbarAfterFixImages={[
              {
                key: 'standards',
                label: t('Standards'),
                isDone: isBookProcessingStageComplete(selectedBook, 'standards'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'fixImages') || !isBookProcessingStageComplete(selectedBook, 'embeddings') || !selectedBook.language || !selectedBook.subject,
                onClick: onAssignStandards
              }
            ]}
            recognizeAllRequest={recognizeAllRequest}
            generateAllExercisesRequest={generateAllExercisesRequest}
            generateOnlyMissingExercises={generateOnlyMissingExercises}
          />
        </React.Suspense>
      )}
    </StyledSection>
  );
}


const PriceModal = styled(Modal)`
  .ui--Modal__body {
    max-width: 58rem;
    width: calc(100vw - 2rem);
  }
`;

const PriceContent = styled.div`
  padding: 0.15rem 0 0.35rem;

  .priceIntro {
    line-height: 1.5;
    margin: 0 0 1rem;
    opacity: 0.72;
  }

  .priceTableFrame {
    border: 1px solid rgba(127, 127, 127, 0.22);
    border-radius: 0.65rem;
    overflow: hidden;
  }

  .priceTable {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
  }

  .priceTable th,
  .priceTable td {
    border-bottom: 1px solid rgba(127, 127, 127, 0.16);
    padding: 0.68rem 0.9rem;
    vertical-align: middle;
  }

  .priceStageColumn {
    width: 38%;
  }

  .priceCallsColumn {
    width: 20%;
  }

  .priceValueColumn,
  .priceTimeColumn {
    width: 21%;
  }

  .priceTable th {
    font-weight: 550;
    text-align: left;
  }

  .priceTable thead th {
    background: rgba(127, 127, 127, 0.06);
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.02em;
  }

  .priceTable thead th:not(:first-child) {
    text-align: right;
  }


  .fastForwardPriceTable th {
    width: 62%;
  }

  .priceTable td {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: 0.01em;
    text-align: right;
    white-space: nowrap;
  }


  .priceTable tbody tr:last-child th,
  .priceTable tbody tr:last-child td {
    border-bottom: 0;
  }

  .priceTable tbody tr.isZero {
    opacity: 0.56;
  }

  .priceSource {
    display: block;
    font-size: 0.78rem;
    font-weight: 400;
    margin-top: 0.1rem;
    opacity: 0.68;
  }

  .priceTable tfoot th,
  .priceTable tfoot td {
    background: rgba(127, 127, 127, 0.08);
    border-bottom: 0;
    border-top: 1px solid rgba(127, 127, 127, 0.24);
    font-weight: 700;
    padding-bottom: 0.78rem;
    padding-top: 0.78rem;
  }

  .fastForwardEstimateStatus {
    background: rgba(127, 127, 127, 0.07);
    border: 1px solid rgba(127, 127, 127, 0.2);
    border-radius: 0.65rem;
    line-height: 1.45;
    padding: 0.8rem 0.9rem;
  }

  .fastForwardEstimateHeading {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    margin: 0 0 0.55rem;
  }

  .fastForwardEstimateHeading > strong {
    font-size: 0.94rem;
  }

  .fastForwardStageBadge {
    background: rgba(127, 127, 127, 0.12);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: 999px;
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
    padding: 0.2rem 0.5rem;
    white-space: nowrap;
  }

  .fastForwardPriceTable tfoot td {
    font-size: 1.08rem;
    font-weight: 700;
  }

  .fastForwardEstimateFootnote {
    font-size: 0.73rem;
    line-height: 1.4;
    margin: 0.55rem 0 0;
    opacity: 0.58;
  }

  @media only screen and (max-width: 480px) {
    .priceTable th,
    .priceTable td {
      padding-left: 0.7rem;
      padding-right: 0.7rem;
    }
  }
`;

const StyledSection = styled.section`
  margin: 1.5rem auto 2rem;
  max-width: 90rem;

  .bookToolbar {
    margin-bottom: 0.75rem;
  }

  .bookToolbarPrimary {
    align-items: center;
    display: grid;
    gap: 0.5rem;
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .bookToolbarPrimary .ui--Button {
    margin: 0;
  }

  .bookSelect.ui--Dropdown { min-width: 0; overflow: visible; }
  .bookSelect.ui--Dropdown .ui.selection.dropdown { box-sizing: border-box; min-width: 0 !important; width: 100%; }
  .bookSelect.ui--Dropdown .ui.selection.dropdown > .text {
    display: block !important;
    max-width: 100%;
    min-width: 0;
    overflow: hidden !important;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }
  .batchModelSelect {
    margin: 1rem 0;
  }

  .fileInput {
    display: none;
  }

  .errorMessage {
    color: #9f3a38;
    margin: 0.75rem 0 0;
  }

  @media only screen and (max-width: 700px) {
    .bookToolbarPrimary {
      gap: 0.35rem;
    }

    .bookToolbarPrimary .ui--Button {
      min-width: 0;
    }
  }
`;

export default React.memo(Upload);
