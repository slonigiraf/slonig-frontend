// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookStageSpendKey } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { createBook, deleteBook, getBook, getBookByContentHash, getBookConceptsForBookPage, getBookPages, getBooks, getExercisesForBookPage, isBookProcessingStageComplete, putBook, resetBookProcessingStagesFrom } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, Modal, Toggle, styled } from '@polkadot/react-components';

import type { AiInputEstimate } from './aiEstimate.js';

import { estimateAiInput, estimateAiRequests } from './aiEstimate.js';
import { MATHPIX_PDF_PAGE_PRICE_USD, OPENAI_MODELS } from './constants.js';
import { bookLanguageLabel } from './bookLanguage.js';
import { exerciseGenerationRequestEstimate } from './bookProcessing.js';
import { conceptChaptersFromPages } from './conceptRecognition.js';
import { fixChapterConceptsPrompt } from './fixConcepts.js';
import { formatOpenRouterSpend } from './openRouterCost.js';
import { loadStandardsCatalogsForBookSubject, loadStoredBookStandards, STANDARDS_FIX_RUNS, STANDARDS_MATCH_RUNS, standardsChapterKey, standardsConceptInputs, standardsFixInputs, standardsFixPrompt, standardsMatchingPrompt } from './standards.js';
import { AiPriceEstimate, UnitPriceEstimate } from './PriceEstimate.js';
import { loadPdfJs } from './pdf.js';
import { useTranslation } from './translate.js';

const BookReader = React.lazy(() => import('./BookReader.js'));

const BOOKS_DIRECTORY = 'books';
const SELECTED_BOOK_SESSION_KEY = 'knowledge-upload-selected-book';
const PRICE_STAGES: Array<{ detail?: string; key: BookStageSpendKey; label: string }> = [
  { key: 'recognize', label: 'Recognize' },
  { key: 'language', label: 'Language' },
  { key: 'subject', label: 'Subject' },
  { key: 'age', label: 'Age' },
  { key: 'chapters', label: 'Chapters' },
  { key: 'concepts', label: 'Concepts' },
  { key: 'fixConcepts', label: 'Fix concepts' },
  { key: 'exercises', label: 'Exercises' },
  { key: 'fixExercises', label: 'Fix exercises' },
  { key: 'abilities', label: 'Abilities' },
  { key: 'fixAbilities', label: 'Fix abilities' },
  { key: 'images', label: 'Images' },
  { key: 'fixImages', label: 'Fix images' },
  { key: 'standards', label: 'Standards' },
  { key: 'fixStandards', label: 'Fix standards' }
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

function Upload (): React.ReactElement {
  const { t } = useTranslation();
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [assignAllStandardsRequest, setAssignAllStandardsRequest] = useState(0);
  const [fixAllStandardsRequest, setFixAllStandardsRequest] = useState(0);
  const [fixAllConceptsRequest, setFixAllConceptsRequest] = useState(0);
  const [generateAllConceptsRequest, setGenerateAllConceptsRequest] = useState(0);
  const [languageTabRequest, setLanguageTabRequest] = useState(0);
  const [subjectTabRequest, setSubjectTabRequest] = useState(0);
  const [ageTabRequest, setAgeTabRequest] = useState(0);
  const [identifyChaptersRequest, setIdentifyChaptersRequest] = useState(0);
  const [identifyChaptersEstimate, setIdentifyChaptersEstimate] = useState<AiInputEstimate>();
  const [isIdentifyChaptersConfirmationOpen, setIsIdentifyChaptersConfirmationOpen] = useState(false);
  const [generateAllConceptsModel, setGenerateAllConceptsModel] = useState(OPENAI_MODELS[0].value);
  const [generateConceptsEstimate, setGenerateConceptsEstimate] = useState<AiInputEstimate>();
  const [fixConceptsEstimate, setFixConceptsEstimate] = useState<AiInputEstimate | string>();
  const [isGenerateConceptsConfirmationOpen, setIsGenerateConceptsConfirmationOpen] = useState(false);
  const [isFixConceptsConfirmationOpen, setIsFixConceptsConfirmationOpen] = useState(false);
  const [isGenerateExercisesConfirmationOpen, setIsGenerateExercisesConfirmationOpen] = useState(false);
  const [isStandardsConfirmationOpen, setIsStandardsConfirmationOpen] = useState(false);
  const [isFixStandardsConfirmationOpen, setIsFixStandardsConfirmationOpen] = useState(false);
  const [isRecognizeConfirmationOpen, setIsRecognizeConfirmationOpen] = useState(false);
  const [isPriceOpen, setIsPriceOpen] = useState(false);
  const [priceBook, setPriceBook] = useState<Book>();
  const [pendingProcessingAction, setPendingProcessingAction] = useState<'chapters' | 'concepts' | 'fixConcepts' | 'recognize' | 'standards' | 'fixStandards' | 'exercises'>();
  const [generateAllExercisesRequest, setGenerateAllExercisesRequest] = useState(0);
  const [generateExercisesEstimate, setGenerateExercisesEstimate] = useState<AiInputEstimate>();
  const [generateOnlyMissingExercises, setGenerateOnlyMissingExercises] = useState(false);
  const [hasConceptsMissingExercise, setHasConceptsMissingExercise] = useState(false);
  const [recognizePageCount, setRecognizePageCount] = useState<number>();
  const [standardsEstimate, setStandardsEstimate] = useState<AiInputEstimate | string>();
  const [fixStandardsEstimate, setFixStandardsEstimate] = useState<AiInputEstimate | string>();
  const [recognizeAllRequest, setRecognizeAllRequest] = useState(0);
  const [readerFile, setReaderFile] = useState<File>();
  const [selectedId, setSelectedId] = useState<number | undefined>(getSessionBookId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = useCallback(async (): Promise<void> => {
    let storedBooks = await getBooks();

    for (const book of storedBooks) {
      if (!book.contentHash) {
        try {
          const file = await readPdf(book.opfsName);
          const contentHash = await getContentHash(new Uint8Array(await file.arrayBuffer()));

          await putBook({ ...book, contentHash });
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
  }, []);

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
      await putBook({ contentHash, created: Date.now(), id, name, opfsName, size: contents.byteLength });
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

    const resetBook: Book = { ...selectedBook, age: undefined, completedStages: [], language: undefined, subject: undefined };

    putBook(resetBook).then(() => {
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
    setIsGenerateConceptsConfirmationOpen(true);
  }, [selectedBook, t]);

  useEffect(() => {
    if (!isGenerateConceptsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id)
      .then((pages) => {
        const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
        const requestInputs = conceptChaptersFromPages(pages).flatMap(({ pageNumbers }) => {
          const chapterText = pageNumbers.map((pageNumber) => `--- page ${pageNumber} ---\n${pageByNumber.get(pageNumber)?.pageMMD ?? ''}`).join('\n\n');
          const estimatedRequest = chapterText.padEnd(chapterText.length + 2_000);

          // Concept extraction can retry an empty chapter response once, so
          // estimate two whole-chapter requests per chapter conservatively.
          return [estimatedRequest, estimatedRequest];
        });

        setGenerateConceptsEstimate(estimateAiInput(generateAllConceptsModel, requestInputs, 4_800));
      })
      .catch(() => setError(t('Unable to estimate concept generation cost.')));
  }, [generateAllConceptsModel, isGenerateConceptsConfirmationOpen, selectedBook, t]);

  const closeGenerateConceptsConfirmation = useCallback((): void => {
    setIsGenerateConceptsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmGenerateConcepts = useCallback((): void => {
    setIsGenerateConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('concepts');

    resetBookProcessingStagesFrom(selectedBook.id, 'concepts').then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setGenerateAllConceptsRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [selectedBook, t]);

  const onFixConcepts = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!selectedBook.language || !selectedBook.subject || selectedBook.age === undefined) {
      setError(t('Set the book language, subject, and learner age before running Fix concepts.'));
      return;
    }

    setFixConceptsEstimate(undefined);
    setIsFixConceptsConfirmationOpen(true);
  }, [selectedBook, t]);

  useEffect(() => {
    if (!isFixConceptsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const pageByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
      const pageLessConcepts = await getBookConceptsForBookPage(selectedBook.id, 0);
      const requests: string[] = [];

      for (const chapter of conceptChaptersFromPages(pages)) {
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
  }, [generateAllConceptsModel, isFixConceptsConfirmationOpen, selectedBook, t]);

  const closeFixConceptsConfirmation = useCallback((): void => {
    setIsFixConceptsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmFixConcepts = useCallback((): void => {
    setIsFixConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('fixConcepts');

    resetBookProcessingStagesFrom(selectedBook.id, 'fixConcepts').then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setFixAllConceptsRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the Fix concepts stage.'));
    });
  }, [selectedBook, t]);

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

    setStandardsEstimate(undefined);
    setIsStandardsConfirmationOpen(true);
  }, [selectedBook, t]);

  useEffect(() => {
    if (!isStandardsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const requests: string[] = [];
      const catalogs = (await loadStandardsCatalogsForBookSubject(selectedBook.subject)).filter(({ standards }) => standards.length);

      for (const chapter of conceptChaptersFromPages(pages)) {
        const concepts = standardsConceptInputs((await Promise.all(chapter.pageNumbers.map((pageNumber) => getBookConceptsForBookPage(selectedBook.id, pageNumber)))).flat());

        if (!concepts.length) {
          continue;
        }

        catalogs.forEach((catalog) => {
          const prompt = standardsMatchingPrompt(chapter.title, concepts, catalog);

          for (let run = 0; run < STANDARDS_MATCH_RUNS; run++) {
            requests.push(prompt);
          }
        });
      }

      setStandardsEstimate(requests.length
        ? estimateAiInput(generateAllConceptsModel, requests, 600)
        : t(catalogs.length ? 'No extracted chapter concepts are available for standards matching.' : 'No standards catalogs are available for this book subject.'));
    }).catch(() => setError(t('Unable to estimate standards assignment cost.')));
  }, [generateAllConceptsModel, isStandardsConfirmationOpen, selectedBook, t]);

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

  const onFixStandards = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    if (!isBookProcessingStageComplete(selectedBook, 'standards')) {
      setError(t('Run Standards before Fix standards.'));
      return;
    }

    setFixStandardsEstimate(undefined);
    setIsFixStandardsConfirmationOpen(true);
  }, [selectedBook, t]);

  useEffect(() => {
    if (!isFixStandardsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const requests: string[] = [];
      const catalogs = await loadStandardsCatalogsForBookSubject(selectedBook.subject);
      const stored = loadStoredBookStandards(selectedBook.id);

      for (const chapter of conceptChaptersFromPages(pages)) {
        const concepts = standardsConceptInputs((await Promise.all(chapter.pageNumbers.map((pageNumber) => getBookConceptsForBookPage(selectedBook.id, pageNumber)))).flat());
        const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);
        const assignment = stored[chapterKey];

        if (!assignment) {
          continue;
        }

        const standards = standardsFixInputs(assignment.standards, catalogs);

        if (standards.length) {
          const prompt = standardsFixPrompt(chapter.title, concepts, standards);

          for (let run = 0; run < STANDARDS_FIX_RUNS; run++) {
            requests.push(prompt);
          }
        }
      }

      setFixStandardsEstimate(requests.length
        ? estimateAiInput(generateAllConceptsModel, requests, 600)
        : t('No assigned chapter standards require review.'));
    }).catch(() => setError(t('Unable to estimate Fix standards cost.')));
  }, [generateAllConceptsModel, isFixStandardsConfirmationOpen, selectedBook, t]);

  const closeFixStandardsConfirmation = useCallback((): void => {
    setIsFixStandardsConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmFixStandards = useCallback((): void => {
    setIsFixStandardsConfirmationOpen(false);

    if (!selectedBook) {
      setPendingProcessingAction(undefined);
      return;
    }

    setPendingProcessingAction('fixStandards');

    resetBookProcessingStagesFrom(selectedBook.id, 'fixStandards').then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setFixAllStandardsRequest((request) => request + 1);
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

      setHasConceptsMissingExercise(hasMissingExercise);
      if (!hasMissingExercise && generateOnlyMissingExercises) {
        setGenerateOnlyMissingExercises(false);
      }

      const pageInputs = pageRows.map(({ concepts, storedPage }) => ({
        chapter: storedPage.chapter,
        concepts: concepts.flatMap(({ description, id, title }) => generateOnlyMissingExercises && id !== undefined && exerciseConceptIds.has(id)
          ? []
          : [{ description, sourceId: id, title }]),
        pageNumber: storedPage.pageNumber
      }));
      const groupedPages = pageInputs.reduce((grouped, { chapter, ...page }) => {
        const chapterPages = grouped.get(chapter) ?? [];

        chapterPages.push(page);
        grouped.set(chapter, chapterPages);

        return grouped;
      }, new Map<string, Array<Omit<typeof pageInputs[number], 'chapter'>>>());
      const bookDetectedLanguage = bookLanguageLabel(selectedBook.language);
      const requests = Array.from(groupedPages, ([chapter, chapterPages]) =>
        exerciseGenerationRequestEstimate({ chapter, pages: chapterPages }, bookDetectedLanguage, selectedBook.age)
      ).flatMap((request) => request ? [request] : []);

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

  const onDelete = useCallback(async (): Promise<void> => {
    if (!selectedBook) {
      return;
    }

    setError('');
    setIsBusy(true);

    try {
      await removePdf(selectedBook.opfsName);
      await deleteBook(selectedBook.id);

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
      {isPriceOpen && <PriceModal
        header={t('Price')}
        onClose={closePrice}
        size='small'
      >
        <Modal.Content>
          <PriceContent>
            <p className='priceIntro'>{t('Cumulative spending for this book, including reruns.')}</p>
            <div className='priceTableFrame'>
              <table className='priceTable'>
                <tbody>
                  {PRICE_STAGES.map(({ detail, key, label }) => {
                    const value = priceBook?.stageSpend?.[key] ?? 0;

                    return <tr className={value === 0 ? 'isZero' : undefined} key={key}>
                      <th scope='row'>{t(label)}{detail && <small className='priceSource'>{detail}</small>}</th>
                      <td>{formatOpenRouterSpend(value)}</td>
                    </tr>;
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope='row'>{t('Total')}</th>
                    <td>{formatOpenRouterSpend(totalSpend)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </PriceContent>
        </Modal.Content>
      </PriceModal>}
      {isRecognizeConfirmationOpen && <Modal
        header={t('Recognize pages')}
        onClose={closeRecognizeConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Recognize every page in this book?')}</p>
          <UnitPriceEstimate
            count={recognizePageCount}
            lineLabel='Mathpix v3/pdf'
            title={t('Estimated Mathpix cost')}
            unitLabel='page'
            unitPriceUsd={MATHPIX_PDF_PAGE_PRICE_USD}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeRecognizeConfirmation}
            />
            <Button
              icon='play'
              label={t('Recognize')}
              onClick={confirmRecognize}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isIdentifyChaptersConfirmationOpen && <Modal
        header={t('Identify chapters')}
        onClose={closeIdentifyChaptersConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Use PDF bookmarks as chapter boundaries when available. Otherwise identify chapters from recognized page text.')}</p>
          <p>{t('If bookmarks are unavailable, page-text detection needs a book language and may use AI.')}</p>
          <AiPriceEstimate
            estimate={identifyChaptersEstimate}
            title={t('Estimated AI cost if page-text detection is needed')}
          />
          <p>{t('You can manually rename chapters, start a chapter on any page, merge chapters, or assign individual pages afterward.')}</p>
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeIdentifyChaptersConfirmation}
            />
            <Button
              icon='play'
              label={t('Identify')}
              onClick={confirmIdentifyChapters}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isGenerateConceptsConfirmationOpen && <Modal
        header={t('Generate concepts')}
        onClose={closeGenerateConceptsConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Generate concepts chapter-by-chapter for this book? Each concept will be stored on the page where it is first introduced.')}</p>
          <AiPriceEstimate estimate={generateConceptsEstimate} />
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeGenerateConceptsConfirmation}
            />
            <Button
              icon='play'
              label={t('Generate')}
              onClick={confirmGenerateConcepts}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isFixConceptsConfirmationOpen && <Modal
        header={t('Fix concepts')}
        onClose={closeFixConceptsConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Review each chapter’s current concept list using the book topic, language, and learner age, then add only strongly implied concepts that are missing. This stage does not reread the chapter text.')}</p>
          <AiPriceEstimate estimate={fixConceptsEstimate} />
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeFixConceptsConfirmation}
            />
            <Button
              icon='play'
              label={t('Fix')}
              onClick={confirmFixConcepts}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isStandardsConfirmationOpen && <Modal
        header={t('Standards')}
        onClose={closeStandardsConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Match standards for every chapter from its extracted concepts? The detected book subject selects the standards catalog path, then each available standards catalog is checked three times against the chapter concepts and the detected standards are combined. Only codes present in the supplied catalog can be stored.')}</p>
          <AiPriceEstimate estimate={standardsEstimate} />
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeStandardsConfirmation}
            />
            <Button
              icon='play'
              label={t('Identify')}
              onClick={confirmAssignStandards}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isFixStandardsConfirmationOpen && <Modal
        header={t('Fix standards')}
        onClose={closeFixStandardsConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Review each chapter’s assigned standards against its concepts and remove standards that are too vague or are not actually introduced in the chapter. This pass can only remove existing standards; it cannot add or rewrite codes.')}</p>
          <AiPriceEstimate estimate={fixStandardsEstimate} />
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeFixStandardsConfirmation}
            />
            <Button
              icon='play'
              label={t('Fix')}
              onClick={confirmFixStandards}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isGenerateExercisesConfirmationOpen && <Modal
        header={t('Generate exercises')}
        onClose={closeGenerateExercisesConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Generate one succinct, transformation-first exercise per concept, keep one per non-overlapping book exercise, and skip book exercises already covered by concepts?')}</p>
          <Toggle
            isDisabled={!hasConceptsMissingExercise}
            label={t('Only for concepts, missing an exercise')}
            onChange={setGenerateOnlyMissingExercises}
            value={generateOnlyMissingExercises}
          />
          <AiPriceEstimate estimate={generateExercisesEstimate} />
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeGenerateExercisesConfirmation}
            />
            <Button
              icon='play'
              label={t('Generate')}
              onClick={confirmGenerateExercises}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      <div className='bookToolbar'>
        <div className='bookToolbarPrimary'>
          <Button
            className='uploadButton'
            icon='upload'
            isDisabled={isBusy}
            label={t('Upload')}
            onClick={onChooseFile}
          />
          <Dropdown
            className='bookSelect'
            isDisabled={!books.length || isBusy}
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
            isDisabled={!selectedBook || isBusy}
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
            book={selectedBook}
            fixAllStandardsRequest={fixAllStandardsRequest}
            fixAllConceptsRequest={fixAllConceptsRequest}
            key={selectedBook.id}
            file={readerFile}
            generateAllConceptsModel={generateAllConceptsModel}
            languageTabRequest={languageTabRequest}
            subjectTabRequest={subjectTabRequest}
            ageTabRequest={ageTabRequest}
            generateAllConceptsRequest={generateAllConceptsRequest}
            identifyChaptersRequest={identifyChaptersRequest}
            isPriceDisabled={!selectedBook || isBusy}
            onBookChange={onBookChange}
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
                onClick: onGenerateConcepts
              },
              {
                key: 'fixConcepts',
                label: t('Fix concepts'),
                isDone: isBookProcessingStageComplete(selectedBook, 'fixConcepts'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'concepts') || !selectedBook.language || !selectedBook.subject || selectedBook.age === undefined,
                onClick: onFixConcepts
              },
              {
                key: 'exercises',
                label: t('Exercises'),
                isDone: isBookProcessingStageComplete(selectedBook, 'exercises'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'fixConcepts') || !selectedBook.language || !selectedBook.subject,
                onClick: onGenerateExercises
              }
            ]}
            processingToolbarAfterFixImages={[
              {
                key: 'standards',
                label: t('Standards'),
                isDone: isBookProcessingStageComplete(selectedBook, 'standards'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'fixImages') || !selectedBook.language || !selectedBook.subject,
                onClick: onAssignStandards
              },
              {
                key: 'fixStandards',
                label: t('Fix standards'),
                isDone: isBookProcessingStageComplete(selectedBook, 'fixStandards'),
                isDisabled: !readerFile || isBusy || !isBookProcessingStageComplete(selectedBook, 'standards') || !selectedBook.language || !selectedBook.subject,
                onClick: onFixStandards
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
    max-width: 34rem;
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

  .priceTable th {
    font-weight: 550;
    text-align: left;
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
