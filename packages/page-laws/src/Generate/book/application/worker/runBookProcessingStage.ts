// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, BookProcessingStageKey, Exercise } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
  addBookStageSpend,
  applyBookChapterRefinements,
  completeBookProcessingStage,
  createBookConcept,
  deleteAbilities,
  deleteMathpixPdfJob,
  getAbilities,
  getBook,
  getBookConceptsForBookPage,
  getBookPages,
  getBookProcessingArtifact,
  getExercisesForBookPage,
  getMathpixPdfJob,
  getSetting,
  incrementBookFixConceptsAttempts,
  isBookProcessingStageComplete,
  putBookPage,
  putBookProcessingArtifact,
  putMathpixPdfJob,
  replaceAbilities,
  replaceBookChapterAssignments,
  replaceExercisesForBookPage,
  SettingKey,
  updateBookConcept,
  updateBookFieldsAndStages,
  updateBookProcessingWorker
} from '@slonigiraf/db';
import OpenAI from 'openai';

import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY, openRouterRequestGate } from '../../../../openrouter/concurrency.js';
import { reportOpenRouterCost, type OpenRouterCostReporter } from '../../../../openrouter/cost.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_EMBEDDER, DEFAULT_STANDARDS_MODEL, MATHPIX_PDF_PAGE_PRICE_USD } from '../config.js';
import { processExtractedChapterContent } from '../processing/bookProcessing.js';
import {
  chapterAssignmentsFromBoundaries,
  chapterEvidenceWindows,
  chapterReconciliationPrompt,
  chapterWindowPrompt,
  deriveStructuralChapterCandidates,
  pageChapterEvidence,
  stabilizeChapterBoundaries
} from '../../domain/chapters/chapterSegmentation.js';
import { conceptsForRefinementChapter, hasPersistedRefinedConceptMembership, refinedChapterSplitPages } from '../../domain/chapters/refineChapters.js';
import { conceptChaptersFromPages, type ConceptChapterNavigationItem } from '../../domain/concepts/conceptRecognition.js';
import { combineDeduplicateConceptPairs, DEDUPLICATE_CONCEPTS_RUNS, deduplicateConceptCandidatesAcrossChapters, deduplicateConceptCandidatesWithinChapters, type DeduplicateConceptInput, type DeduplicateConceptPair } from '../../domain/concepts/deduplicateConcepts.js';
import { chapterLevelMissingConcept, combineFixChapterConceptsResults, FIX_CONCEPTS_RUNS, type FixChapterConceptsResult } from '../../domain/concepts/fixConcepts.js';
import { assertDisjointSortChapterConcepts, conceptsForSortChapter } from '../../domain/concepts/sortConcepts.js';
import { getBookAgeSamplePageNumbers, parseDetectedBookAge } from '../../domain/metadata/bookAge.js';
import { getMiddleBookPageNumbers, normalizeLanguageCode, parseDetectedBookLanguage } from '../../domain/metadata/bookLanguage.js';
import { automaticBookSubjectForLanguage, parseDetectedBookSubject } from '../../domain/metadata/bookSubject.js';
import { needsChapterStandardsIdentification, standardsChapterKey, standardsConceptFingerprint, standardsConceptInputs, standardsPathForBookSubject, type StoredBookStandards } from '../../domain/standards/standards.js';
import { BOOK_AGE_DETECTION_PROMPT, BOOK_LANGUAGE_DETECTION_PROMPT, BOOK_SUBJECT_DETECTION_PROMPT } from '../../infrastructure/ai/prompts/metadata.js';
import { cachedConceptEmbeddingMap, ensureConceptEmbeddingCache, ensureStandardEmbeddingCache } from '../../infrastructure/ai/standardsEmbeddings.js';
import { extractPdfOutlineChapterBoundaries, loadPdfJs } from '../../infrastructure/pdf/pdf.js';
import { MathpixPdfTerminalError, MATHPIX_PDF_SLICE_CONCURRENCY, mathpixPdfSlices, recognizePdfWithMathpix } from '../../infrastructure/pdf/mathpixPdf.js';
import { stripMarkdownImageReferences } from '../../infrastructure/pdf/bookImageRefs.js';
import { loadStandardsCatalogsForBookSubject } from '../../infrastructure/standards/standardsCatalog.js';
import { bookLanguageLabel } from '../../domain/metadata/bookLanguage.js';
import {
  conceptGenerationErrorMessage,
  createOpenRouterClient,
  createPdfPageSliceFactory,
  generateChapterContentWithEmptyConceptRetry,
  getChapterConceptInputs,
  getChapterStandardsConceptRows,
  mathpixHeadingsForRecognitionPage,
  requestChapterBoundaries,
  requestChapterStandards,
  requestDeduplicateConceptPairs,
  requestMissingChapterConcepts,
  requestRefinedChapterGroups,
  requestSortedChapterConceptIndexes,
  storeGeneratedChapterConcepts
} from '../workspace/bookReaderProcessing.js';
import { conceptsForNavigationChapter, deleteConceptAndDependencies, exerciseAbilityModuleId, exerciseForPageReplacement, getBookConceptInventory, sortConceptsForDisplay } from '../workspace/bookReaderWorkspace.js';
import { fixConceptsChapterKey, type FixConceptsChapterStatuses } from '../../infrastructure/storage/fixConceptsProgress.js';
import { FIX_CONCEPTS_STATUS_ARTIFACT, STANDARDS_ARTIFACT, type BookProcessingWorkerCommand, type BookProcessingWorkerServices } from './bookProcessingWorkerProtocol.js';
import { runAbilitiesStage, runFixAbilitiesStage, runFixExercisesStage, runFixImagesStage, runImagesStage } from './runBookSkillsWorkerStages.js';

interface StageContext {
  book: Book;
  command: BookProcessingWorkerCommand;
  cost: OpenRouterCostReporter;
  progress: (value: number, total: number, label?: string) => Promise<void>;
  services: BookProcessingWorkerServices;
  signal: AbortSignal;
  throwIfAborted: () => void;
  waitForWrites: () => Promise<void>;
}

function abortError (): DOMException {
  return new DOMException('Processing aborted.', 'AbortError');
}

function ensureNotAborted (signal: AbortSignal): void {
  if (signal.aborted) {
    throw abortError();
  }
}

async function loadBookPdfFile (book: Book): Promise<File> {
  const storage = navigator.storage;

  if (!storage?.getDirectory) {
    throw new Error('Origin-private file storage is not available in this browser.');
  }

  const root = await storage.getDirectory();
  const directory = await root.getDirectoryHandle('books');
  const handle = await directory.getFileHandle(book.opfsName);

  return handle.getFile();
}

async function pdfPageCount (file: File): Promise<number> {
  const { PDFDocument } = await import('pdf-lib');
  const pdf = await PDFDocument.load(await file.arrayBuffer());

  return pdf.getPageCount();
}

function orderedPagesMap (pages: BookPage[]): Map<number, BookPage> {
  return new Map(pages.map((page) => [page.pageNumber, page]));
}

function recognizedPageTotal (pages: Map<number, BookPage>, totalPages: number): number {
  return Array.from({ length: totalPages }, (_, index) => pages.get(index + 1)).filter((page) => page?.pageMMD !== undefined).length;
}

async function requireOpenRouterClient (signal: AbortSignal): Promise<OpenAI> {
  const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

  if (!key) {
    throw new Error('No OpenRouter token found. Add it in Settings.');
  }

  return createOpenRouterClient(key, signal);
}

async function runRecognition ({ book, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  const file = await loadBookPdfFile(book);
  const totalPages = await pdfPageCount(file);

  if (!totalPages) {
    throw new Error('The PDF has no pages.');
  }

  const [appId, apiKey] = await Promise.all([
    getSetting(SettingKey.MATHPIX_APP_ID),
    getSetting(SettingKey.MATHPIX_API_KEY)
  ]);

  if (!apiKey) {
    throw new Error('No Mathpix API key found. Add it in Settings.');
  }

  const storedPages = orderedPagesMap(await getBookPages(book.id));
  let completed = recognizedPageTotal(storedPages, totalPages);

  await progress(completed, totalPages, 'Recognizing pages');
  const createPdfPageSlice = await createPdfPageSliceFactory(file);
  const sliceResults = await mapConcurrent(mathpixPdfSlices(totalPages), MATHPIX_PDF_SLICE_CONCURRENCY, async ({ endPage, startPage }) => {
    const pageCount = endPage - startPage + 1;
    const existingCount = Array.from({ length: pageCount }, (_, index) => storedPages.get(startPage + index)).filter((page) => page?.pageMMD !== undefined).length;
    let newlyStored = 0;

    try {
      throwIfAborted();

      if (existingCount === pageCount) {
        await deleteMathpixPdfJob(book.id, startPage, endPage);
        return { failedPages: 0 };
      }

      const pendingJob = await getMathpixPdfJob(book.id, startPage, endPage);
      const sliceFile = await createPdfPageSlice(startPage, endPage);
      const recognition = await recognizePdfWithMathpix(appId, apiKey, sliceFile, pageCount, undefined, undefined, signal, {
        pdfId: pendingJob?.pdfId,
        onPdfId: async (pdfId) => {
          await putMathpixPdfJob({ bookId: book.id, created: Date.now(), endPage, pdfId, startPage });
          cost(MATHPIX_PDF_PAGE_PRICE_USD * pageCount);
        }
      });

      if (recognition.pages.length !== pageCount) {
        throw new Error(`Mathpix returned ${recognition.pages.length} pages for PDF pages ${startPage}-${endPage}.`);
      }

      for (let index = 0; index < pageCount; index++) {
        throwIfAborted();
        const pageNumber = startPage + index;
        const previous = storedPages.get(pageNumber);
        const recognized = recognition.pages[index];
        const next: BookPage = {
          ...previous,
          bookId: book.id,
          chapter: previous?.chapter ?? '',
          conceptsProcessed: previous?.conceptsProcessed ?? false,
          mathpixHeadings: mathpixHeadingsForRecognitionPage(recognition, index),
          pageMMD: recognized.pageMMD,
          pageMMDZip: recognized.pageMMDZip,
          pageNumber
        };

        await putBookPage(next);
        storedPages.set(pageNumber, next);

        if (previous?.pageMMD === undefined) {
          newlyStored++;
          completed++;
          await progress(completed, totalPages, 'Recognizing pages');
        }
      }

      await deleteMathpixPdfJob(book.id, startPage, endPage);
      return { failedPages: 0 };
    } catch (error) {
      if (signal.aborted || (error instanceof Error && error.name === 'AbortError')) {
        throw error;
      }

      if (error instanceof MathpixPdfTerminalError) {
        await deleteMathpixPdfJob(book.id, startPage, endPage).catch(() => undefined);
      }

      return { failedPages: Math.max(0, pageCount - existingCount - newlyStored) };
    }
  });
  const failedPages = sliceResults.reduce((sum, result) => sum + result.failedPages, 0);

  if (failedPages) {
    throw new Error(`${failedPages} of ${totalPages} pages could not be recognized.`);
  }

  await completeBookProcessingStage(book.id, 'recognize');
}

async function runLanguage ({ book, command, cost, progress, signal }: StageContext): Promise<void> {
  const pages = orderedPagesMap(await getBookPages(book.id));
  const totalPages = Math.max(...Array.from(pages.keys()), 0);
  const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
  const pageTexts = middlePageNumbers.flatMap((pageNumber) => {
    const text = pages.get(pageNumber)?.pageMMD?.trim();
    return text ? [{ pageNumber, text }] : [];
  });

  if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
    throw new Error('The middle recognized pages do not contain enough text to detect a language.');
  }

  await progress(0, 1, 'Detecting book language');
  const client = await requireOpenRouterClient(signal);
  const response = await openRouterRequestGate.run(() => client.chat.completions.create({
    messages: [{ content: BOOK_LANGUAGE_DETECTION_PROMPT(pageTexts), role: 'user' }],
    model: command.options.model || DEFAULT_PROCESSING_MODEL,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, cost);
  const language = parseDetectedBookLanguage(response.choices[0].message?.content?.trim() ?? '');
  const changed = normalizeLanguageCode(book.language) !== language;
  const automaticSubject = automaticBookSubjectForLanguage(language);
  const changes: Partial<Pick<Book, 'age' | 'language' | 'subject'>> = { language };

  if (changed) {
    changes.age = undefined;
    changes.subject = automaticSubject;
  } else if (automaticSubject) {
    changes.subject = automaticSubject;
  }

  const updated = await updateBookFieldsAndStages(book.id, changes, {
    complete: automaticSubject ? ['language', 'subject'] : ['language'],
    ...(changed ? { resetFrom: 'language' as const } : {})
  });

  if (!updated) {
    throw new Error('Book not found.');
  }

  await progress(1, 1, 'Detected book language');
}

async function runSubject ({ book, command, cost, progress, signal }: StageContext): Promise<void> {
  if (!book.language) {
    throw new Error('Set the book language before detecting its subject.');
  }

  const automaticSubject = automaticBookSubjectForLanguage(book.language);

  if (automaticSubject) {
    const changed = book.subject !== automaticSubject;
    const updated = await updateBookFieldsAndStages(book.id, {
      ...(changed ? { age: undefined } : {}),
      subject: automaticSubject
    }, {
      complete: ['subject'],
      ...(changed ? { resetFrom: 'subject' as const } : {})
    });

    if (!updated) {
      throw new Error('Book not found.');
    }

    await progress(1, 1, 'Detected book subject');
    return;
  }

  const pages = orderedPagesMap(await getBookPages(book.id));
  const totalPages = Math.max(...Array.from(pages.keys()), 0);
  const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
  const pageTexts = middlePageNumbers.flatMap((pageNumber) => {
    const text = pages.get(pageNumber)?.pageMMD?.trim();
    return text ? [{ pageNumber, text }] : [];
  });

  if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
    throw new Error('The middle recognized pages do not contain enough text to detect a subject.');
  }

  await progress(0, 1, 'Detecting book subject');
  const client = await requireOpenRouterClient(signal);
  const response = await openRouterRequestGate.run(() => client.chat.completions.create({
    messages: [{ content: BOOK_SUBJECT_DETECTION_PROMPT(book.language, pageTexts), role: 'user' }],
    model: command.options.model || DEFAULT_PROCESSING_MODEL,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, cost);
  const subject = parseDetectedBookSubject(response.choices[0].message?.content?.trim() ?? '');
  const changed = book.subject !== subject;
  const updated = await updateBookFieldsAndStages(book.id, {
    ...(changed ? { age: undefined } : {}),
    subject
  }, {
    complete: ['subject'],
    ...(changed ? { resetFrom: 'subject' as const } : {})
  });

  if (!updated) {
    throw new Error('Book not found.');
  }

  await progress(1, 1, 'Detected book subject');
}

async function runAge ({ book, command, cost, progress, signal }: StageContext): Promise<void> {
  if (!book.language || !book.subject) {
    throw new Error('Set the book language and subject before detecting learner age.');
  }

  const pages = orderedPagesMap(await getBookPages(book.id));
  const totalPages = Math.max(...Array.from(pages.keys()), 0);
  const samplePageNumbers = getBookAgeSamplePageNumbers(totalPages, Array.from(pages.values()).flatMap(({ pageMMD, pageNumber }) => pageMMD?.trim() ? [pageNumber] : []));
  const pageTexts = samplePageNumbers.flatMap((pageNumber) => {
    const text = pages.get(pageNumber)?.pageMMD?.trim();
    return text ? [{ pageNumber, text }] : [];
  });

  if (!samplePageNumbers.length || samplePageNumbers.length !== Math.min(3, totalPages) || pageTexts.length !== samplePageNumbers.length) {
    throw new Error('The representative recognized pages do not contain enough text to detect learner age.');
  }

  await progress(0, 1, 'Detecting learner age');
  const client = await requireOpenRouterClient(signal);
  const response = await openRouterRequestGate.run(() => client.chat.completions.create({
    messages: [{ content: BOOK_AGE_DETECTION_PROMPT(book.language, book.subject, pageTexts), role: 'user' }],
    model: command.options.model || DEFAULT_PROCESSING_MODEL,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, cost);
  const age = parseDetectedBookAge(response.choices[0].message?.content?.trim() ?? '');
  const changed = book.age !== age;
  const updated = await updateBookFieldsAndStages(book.id, { age }, {
    complete: ['age'],
    ...(changed ? { resetFrom: 'age' as const } : {})
  });

  if (!updated) {
    throw new Error('Book not found.');
  }

  await progress(1, 1, 'Detected learner age');
}

async function runChapters ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  const pages = (await getBookPages(book.id)).sort((a, b) => a.pageNumber - b.pageNumber);
  const totalPages = pages.length;

  if (!totalPages || pages.some(({ pageMMD }) => pageMMD === undefined)) {
    throw new Error('Recognize every page before identifying chapters.');
  }

  await progress(0, totalPages, 'Reading PDF bookmarks');
  let outlineBoundaries: Awaited<ReturnType<typeof extractPdfOutlineChapterBoundaries>> = [];
  let pdf: PDFDocumentProxy | undefined;

  try {
    const file = await loadBookPdfFile(book);
    const pdfjs = await loadPdfJs();
    const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });

    pdf = await loadingTask.promise;
    outlineBoundaries = await extractPdfOutlineChapterBoundaries(pdf);
  } catch {
    // PDF bookmarks are an optimization. Text inference remains available if
    // PDF.js cannot initialize inside a browser worker.
  } finally {
    if (pdf) {
      void pdf.destroy();
    }
  }

  throwIfAborted();

  if (outlineBoundaries.length) {
    await replaceBookChapterAssignments(book.id, chapterAssignmentsFromBoundaries(outlineBoundaries, totalPages));
    await completeBookProcessingStage(book.id, 'chapters');
    await progress(totalPages, totalPages, 'Saved PDF bookmark chapters');
    return;
  }

  if (!book.language) {
    throw new Error('Set the book language before identifying chapters without PDF bookmarks.');
  }

  const client = await requireOpenRouterClient(signal);
  const windows = chapterEvidenceWindows(pages);
  let processedThrough = 0;
  const proposals = (await mapConcurrent(windows, Math.min(3, OPENROUTER_CONCURRENCY), async (window) => {
    throwIfAborted();
    const result = await requestChapterBoundaries(client, command.options.model || DEFAULT_PROCESSING_MODEL, chapterWindowPrompt(window), totalPages, cost, book.language);

    processedThrough = Math.max(processedThrough, window[window.length - 1]?.pageNumber ?? processedThrough);
    await progress(processedThrough, totalPages, 'Identifying chapters from page text');
    return result;
  })).flat();
  const evidence = pages.map(pageChapterEvidence);
  const structural = deriveStructuralChapterCandidates(evidence);
  const reconciled = await requestChapterBoundaries(client, command.options.model || DEFAULT_PROCESSING_MODEL, chapterReconciliationPrompt(proposals, evidence, totalPages, structural), totalPages, cost, book.language);
  const stable = stabilizeChapterBoundaries(reconciled.length ? reconciled : proposals, structural, totalPages, evidence, book.language);
  const boundaries = chapterAssignmentsFromBoundaries(stable, totalPages);

  await replaceBookChapterAssignments(book.id, boundaries);
  await completeBookProcessingStage(book.id, 'chapters');
  await progress(totalPages, totalPages, 'Saved chapter assignments');
}

async function runConcepts ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  if (book.age === undefined) {
    throw new Error('Set the learner age before generating concepts.');
  }

  const pages = await getBookPages(book.id);
  const totalPages = pages.length;

  if (!totalPages || pages.some(({ pageMMD }) => pageMMD === undefined)) {
    throw new Error('Recognize every page before generating concepts.');
  }

  const chapters = conceptChaptersFromPages(pages);
  const activePages = pages.filter(({ excludedFromAnalysis }) => !excludedFromAnalysis);

  if (!chapters.length || chapters.reduce((sum, chapter) => sum + chapter.pageNumbers.length, 0) !== activePages.length) {
    throw new Error('Every included page must belong to exactly one chapter before generating concepts.');
  }

  let targets = chapters;

  if (command.options.onlyMissingConcepts) {
    const inventory = await getBookConceptInventory(book.id, pages.map(({ pageNumber }) => pageNumber));
    targets = chapters.filter((chapter) => conceptsForNavigationChapter(inventory, chapter).length === 0);
  }

  if (!targets.length) {
    await completeBookProcessingStage(book.id, 'concepts');
    await progress(chapters.length, chapters.length, 'Concepts already complete');
    return;
  }

  const client = await requireOpenRouterClient(signal);
  let completed = 0;
  let successes = 0;
  const failures: string[] = [];

  await progress(0, targets.length, 'Extracting concepts by chapter');
  const results = await mapConcurrent(targets, OPENROUTER_CONCURRENCY, async (chapter) => {
    try {
      throwIfAborted();
      const chapterPages = chapter.pageNumbers.map((pageNumber) => pages.find((page) => page.pageNumber === pageNumber) as BookPage);
      const inputs = await getChapterConceptInputs(chapterPages);
      const generated = await generateChapterContentWithEmptyConceptRetry(client, command.options.model || DEFAULT_PROCESSING_MODEL, chapter.title, inputs, book.age, inputs.length > 0, cost, book.language);

      await storeGeneratedChapterConcepts(book.id, chapterPages, generated);
      successes++;
    } catch (reason) {
      failures.push(`${chapter.title || 'Untitled chapter'}: ${conceptGenerationErrorMessage(reason)}`);
    } finally {
      completed++;
      await progress(completed, targets.length, 'Extracting concepts by chapter');
    }
  });
  void results;

  if (!successes) {
    throw new Error(`Concept generation failed for all ${targets.length} chapters. ${failures.join(' | ')}`);
  }

  // Preserve the existing reader behavior: successful chapter results make the
  // stage eligible to continue, while failed chapters remain retryable via the
  // "missing concepts only" mode.
  await completeBookProcessingStage(book.id, 'concepts');
}

async function runFixConcepts ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  if (!book.language || !book.subject || book.age === undefined) {
    throw new Error('Set the book language, subject, and learner age before running Fix concepts.');
  }

  const pages = await getBookPages(book.id);
  const chapters = conceptChaptersFromPages(pages);
  const previousStatuses = await getBookProcessingArtifact<FixConceptsChapterStatuses>(book.id, FIX_CONCEPTS_STATUS_ARTIFACT) ?? {};
  const hasPreviousStatuses = Object.keys(previousStatuses).length > 0;
  const targets = command.options.onlyFailedConcepts && hasPreviousStatuses
    ? chapters.filter((chapter) => previousStatuses[fixConceptsChapterKey(chapter)] === 'failed')
    : chapters;

  if (!targets.length) {
    if (command.options.onlyFailedConcepts) {
      await completeBookProcessingStage(book.id, 'fixConcepts');
      return;
    }
    throw new Error('No chapters are available for Fix concepts.');
  }

  const client = await requireOpenRouterClient(signal);
  const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
  const totalPasses = targets.length * FIX_CONCEPTS_RUNS;
  let completedPasses = 0;

  await progress(0, totalPasses, 'Finding missing chapter concepts');
  const results = await mapConcurrent(targets, OPENROUTER_CONCURRENCY, async (chapter) => {
    const before = sortConceptsForDisplay([
      ...(await Promise.all(chapter.pageNumbers.map((pageNumber) => getBookConceptsForBookPage(book.id, pageNumber)))).flat(),
      ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.chapterId)
    ]);
    const chapterMmd = chapter.pageNumbers.map((pageNumber) => `--- page ${pageNumber} ---\n${pages.find((page) => page.pageNumber === pageNumber)?.pageMMD ?? ''}`).join('\n\n');
    const passes: FixChapterConceptsResult[] = [];
    const failures: string[] = [];

    for (let pass = 0; pass < FIX_CONCEPTS_RUNS; pass++) {
      try {
        throwIfAborted();
        passes.push(await requestMissingChapterConcepts(client, command.options.model || DEFAULT_PROCESSING_MODEL, chapter.title, chapterMmd, before, chapter.pageNumbers, book, cost));
      } catch (reason) {
        failures.push(`Pass ${pass + 1}: ${conceptGenerationErrorMessage(reason)}`);
      } finally {
        completedPasses++;
        await progress(completedPasses, totalPasses, 'Finding missing chapter concepts');
      }
    }

    if (!passes.length) {
      return { chapter, reason: failures.join(' | '), status: 'rejected' as const };
    }

    const fixes = combineFixChapterConceptsResults(passes);
    const removed = fixes.removeConceptIndexes.flatMap((index): BookConcept[] => before[index]?.id === undefined ? [] : [before[index]]);

    return { chapter, missing: fixes.concepts, removed, status: 'fulfilled' as const };
  });
  const attempt = await incrementBookFixConceptsAttempts(book.id);
  const nextStatuses: FixConceptsChapterStatuses = command.options.onlyFailedConcepts ? { ...previousStatuses } : {};
  const pageNumbers = pages.map(({ pageNumber }) => pageNumber);
  const saveFailures: string[] = [];

  for (const result of results) {
    if (result.status === 'rejected') {
      nextStatuses[fixConceptsChapterKey(result.chapter)] = 'failed';
      saveFailures.push(`${result.chapter.title || 'Untitled chapter'}: ${result.reason}`);
      continue;
    }

    try {
      for (const concept of result.removed) {
        throwIfAborted();
        await deleteConceptAndDependencies(book.id, concept, pageNumbers);
      }
      for (const concept of result.missing) {
        throwIfAborted();
        await createBookConcept(chapterLevelMissingConcept(book.id, result.chapter.chapterId, concept, attempt, book.language));
      }
      nextStatuses[fixConceptsChapterKey(result.chapter)] = 'fixed';
    } catch (reason) {
      nextStatuses[fixConceptsChapterKey(result.chapter)] = 'failed';
      saveFailures.push(`${result.chapter.title || 'Untitled chapter'}: ${conceptGenerationErrorMessage(reason)}`);
    }
  }

  await putBookProcessingArtifact(book.id, FIX_CONCEPTS_STATUS_ARTIFACT, nextStatuses);
  const allFixed = chapters.every((chapter) => nextStatuses[fixConceptsChapterKey(chapter)] === 'fixed');

  if (!allFixed) {
    throw new Error(`${chapters.filter((chapter) => nextStatuses[fixConceptsChapterKey(chapter)] !== 'fixed').length} chapter(s) still need Fix concepts attention.${saveFailures.length ? ` ${saveFailures.join(' | ')}` : ''}`);
  }

  await completeBookProcessingStage(book.id, 'fixConcepts');
}

async function runEmbeddings ({ book, command, cost, progress, signal }: StageContext): Promise<void> {
  if (!isBookProcessingStageComplete(book, 'fixConcepts')) {
    throw new Error('Complete Fix concepts before calculating Embedings.');
  }

  const pages = await getBookPages(book.id);
  const inventory = await getBookConceptInventory(book.id, pages.map(({ pageNumber }) => pageNumber));
  const client = await requireOpenRouterClient(signal);

  await progress(0, Math.max(1, inventory.length), 'Calculating concept Embedings');
  await ensureConceptEmbeddingCache(client, command.options.embeddingModel || DEFAULT_STANDARDS_EMBEDDER, inventory, cost);
  await completeBookProcessingStage(book.id, 'embeddings');
  await progress(inventory.length || 1, inventory.length || 1, 'Calculated concept Embedings');
}

async function deduplicateInventory (book: Book, pages: BookPage[]): Promise<{ conceptsById: Map<number, BookConcept>; inputs: DeduplicateConceptInput[] }> {
  const chapters = conceptChaptersFromPages(pages);
  const inventory = await getBookConceptInventory(book.id, pages.map(({ pageNumber }) => pageNumber));
  const conceptsById = new Map<number, BookConcept>();
  const inputs: DeduplicateConceptInput[] = [];

  for (const chapter of chapters) {
    for (const concept of conceptsForNavigationChapter(inventory, chapter)) {
      if (concept.id === undefined || chapter.chapterId === undefined) {
        continue;
      }

      conceptsById.set(concept.id, concept);
      inputs.push({
        chapterId: chapter.chapterId,
        chapterTitle: chapter.title,
        conceptId: concept.id,
        description: concept.description,
        title: concept.title
      });
    }
  }

  return { conceptsById, inputs };
}

async function runDeduplicateConcepts ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  if (!book.language || !book.subject || book.age === undefined) {
    throw new Error('Set the book language, subject, and learner age before running Deduplicate concepts.');
  }
  if (!isBookProcessingStageComplete(book, 'embeddings')) {
    throw new Error('Run Embedings before Deduplicate concepts.');
  }

  const pages = await getBookPages(book.id);
  const { conceptsById, inputs } = await deduplicateInventory(book, pages);

  if (inputs.length < 2) {
    await completeBookProcessingStage(book.id, 'deduplicateConcepts');
    await progress(inputs.length, inputs.length || 1, 'No duplicates found');
    return;
  }

  const client = await requireOpenRouterClient(signal);
  const embeddingModel = command.options.embeddingModel || DEFAULT_STANDARDS_EMBEDDER;
  const embeddings = await cachedConceptEmbeddingMap(embeddingModel, Array.from(conceptsById.values()));
  const missingEmbeddingIds = inputs.filter(({ conceptId }) => !embeddings.has(conceptId));

  if (missingEmbeddingIds.length) {
    throw new Error('Concept Embedings are missing or stale. Run Embedings again before deduplication.');
  }

  const inputsByChapter = new Map<number, DeduplicateConceptInput[]>();
  inputs.forEach((input) => inputsByChapter.set(input.chapterId, [...(inputsByChapter.get(input.chapterId) ?? []), input]));
  const runReview = async (): Promise<DeduplicateConceptPair[]> => {
    const within = (await mapConcurrent(Array.from(inputsByChapter.values()), OPENROUTER_CONCURRENCY, async (chapterInputs) => {
      throwIfAborted();
      if (chapterInputs.length < 2) return [];
      const candidates = deduplicateConceptCandidatesWithinChapters(chapterInputs, embeddings);
      return candidates.length ? requestDeduplicateConceptPairs(client, command.options.model || DEFAULT_PROCESSING_MODEL, chapterInputs, candidates, book, cost) : [];
    })).flat();
    const deleted = new Set(within.map(({ deletedConceptId }) => deletedConceptId));
    const survivors = inputs.filter(({ conceptId }) => !deleted.has(conceptId));
    const crossCandidates = deduplicateConceptCandidatesAcrossChapters(survivors, embeddings);
    const cross = crossCandidates.length
      ? await requestDeduplicateConceptPairs(client, command.options.model || DEFAULT_PROCESSING_MODEL, survivors, crossCandidates, book, cost)
      : [];
    return [...within, ...cross];
  };
  const reviewRuns: DeduplicateConceptPair[][] = [];

  await progress(0, DEDUPLICATE_CONCEPTS_RUNS, 'Finding duplicate concepts');
  for (let run = 0; run < DEDUPLICATE_CONCEPTS_RUNS; run++) {
    throwIfAborted();
    reviewRuns.push(await runReview());
    await progress(run + 1, DEDUPLICATE_CONCEPTS_RUNS, 'Finding duplicate concepts');
  }

  const pairs = combineDeduplicateConceptPairs(reviewRuns, inputs);
  const pageNumbers = pages.map(({ pageNumber }) => pageNumber);

  for (const { deletedConceptId } of pairs) {
    throwIfAborted();
    const concept = conceptsById.get(deletedConceptId);
    if (concept) {
      await deleteConceptAndDependencies(book.id, concept, pageNumbers);
    }
  }

  await completeBookProcessingStage(book.id, 'deduplicateConcepts');
}

async function runSortConcepts ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  if (!book.language || !book.subject || book.age === undefined) {
    throw new Error('Set the book language, subject, and learner age before running Sort concepts.');
  }

  const pages = await getBookPages(book.id);
  const chapters = conceptChaptersFromPages(pages);
  if (!chapters.length) throw new Error('No chapters are available for Sort concepts.');
  const inventory = await getBookConceptInventory(book.id, pages.map(({ pageNumber }) => pageNumber));
  const sourceChapters = chapters.map((chapter) => ({ ...chapter, pageNumbers: [...chapter.pageNumbers] }));
  const chapterInputs = sourceChapters.map((chapter) => ({ chapter, concepts: conceptsForSortChapter(inventory, chapter) }));
  assertDisjointSortChapterConcepts(chapterInputs);
  let clientPromise: Promise<OpenAI> | undefined;
  const getClient = (): Promise<OpenAI> => clientPromise ??= requireOpenRouterClient(signal);
  let completed = 0;

  await progress(0, chapterInputs.length, 'Sorting concepts by ZPD');
  const proposals = await mapConcurrent(chapterInputs, OPENROUTER_CONCURRENCY, async ({ chapter, concepts }) => {
    try {
      throwIfAborted();
      const indexes = concepts.length > 1
        ? await requestSortedChapterConceptIndexes(await getClient(), command.options.model || DEFAULT_PROCESSING_MODEL, chapter.title, concepts, book, cost)
        : concepts.map((_, index) => index);
      const ids = indexes.map((index) => concepts[index]?.id).filter((id): id is number => id !== undefined);
      if (ids.length !== concepts.length) throw new Error('Sort Concepts returned an incomplete chapter order.');
      return { chapter, ids, status: 'fulfilled' as const };
    } catch (reason) {
      return { chapter, reason, status: 'rejected' as const };
    } finally {
      completed++;
      await progress(completed, chapterInputs.length, 'Sorting concepts by ZPD');
    }
  });
  const failures = proposals.flatMap((result) => result.status === 'rejected' ? [`${result.chapter.title}: ${conceptGenerationErrorMessage(result.reason)}`] : []);

  if (failures.length) {
    throw new Error(`Sort concepts stopped before saving because ${failures.length} chapter(s) failed. ${failures.join(' | ')}`);
  }

  for (const proposal of proposals) {
    if (proposal.status !== 'fulfilled') continue;
    for (let displayOrder = 0; displayOrder < proposal.ids.length; displayOrder++) {
      throwIfAborted();
      await updateBookConcept(proposal.ids[displayOrder], { displayOrder });
    }
  }

  await completeBookProcessingStage(book.id, 'sortConcepts');
}

async function runRefineChapters ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  if (!book.language || !book.subject || book.age === undefined) {
    throw new Error('Set the book language, subject, and learner age before running Refine chapters.');
  }

  const pages = await getBookPages(book.id);
  const chapters = conceptChaptersFromPages(pages);
  if (!chapters.length) throw new Error('No chapters are available for Refine chapters.');
  const inventory = await getBookConceptInventory(book.id, pages.map(({ pageNumber }) => pageNumber));
  const client = await requireOpenRouterClient(signal);
  let completed = 0;

  await progress(0, chapters.length, 'Clustering concepts into thematic chapters');
  const proposals = await mapConcurrent(chapters.map((chapter) => ({ ...chapter, pageNumbers: [...chapter.pageNumbers] })), OPENROUTER_CONCURRENCY, async (chapter) => {
    try {
      throwIfAborted();
      const concepts = conceptsForRefinementChapter(inventory, chapter);
      const groups = concepts.length
        ? await requestRefinedChapterGroups(client, command.options.model || DEFAULT_PROCESSING_MODEL, chapter.title, concepts, chapter.pageNumbers.length, book, cost)
        : [];
      const splitPages = refinedChapterSplitPages(chapter.pageNumbers, groups.map(({ conceptIndexes }) => conceptIndexes.length));
      if (groups.length > 1 && (chapter.chapterId === undefined || !splitPages)) throw new Error('The proposed thematic split cannot be persisted as real chapters.');
      if (groups.length > 1 && concepts.some(({ id }) => id === undefined)) throw new Error('Every concept needs an id before its chapter can be refined.');
      return { chapter, concepts, groups, splitPages: splitPages ?? [], status: 'fulfilled' as const };
    } catch (reason) {
      return { chapter, reason, status: 'rejected' as const };
    } finally {
      completed++;
      await progress(completed, chapters.length, 'Clustering concepts into thematic chapters');
    }
  });
  const failures = proposals.flatMap((result) => result.status === 'rejected' ? [`${result.chapter.title}: ${conceptGenerationErrorMessage(result.reason)}`] : []);
  if (failures.length) throw new Error(`Refine chapters stopped before saving because ${failures.length} chapter(s) failed. ${failures.join(' | ')}`);
  const splits = proposals.flatMap((proposal) => proposal.status === 'fulfilled' && proposal.groups.length > 1 ? [proposal] : []);

  if (splits.length) {
    const expected = await applyBookChapterRefinements(book.id, splits.map(({ chapter, concepts, groups, splitPages }) => ({
      groups: groups.map(({ conceptIndexes, title }) => ({ conceptIds: conceptIndexes.map((index) => concepts[index].id as number), title })),
      sourceChapterId: chapter.chapterId as number,
      sourcePageNumbers: chapter.pageNumbers,
      splitPages
    })));
    const persisted = await getBookConceptInventory(book.id, pages.map(({ pageNumber }) => pageNumber));
    if (!hasPersistedRefinedConceptMembership(expected, persisted)) throw new Error('Unable to persist the complete thematic chapter refinement plan.');
  }

  await completeBookProcessingStage(book.id, 'refineChapters');
}

async function runExercises ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  if (!book.language) {
    throw new Error('Set the book language before generating exercises.');
  }

  const storedPages = (await getBookPages(book.id))
    .filter(({ chapter, chapterId, conceptsProcessed, excludedFromAnalysis }) => conceptsProcessed && !excludedFromAnalysis && (chapterId !== undefined || Boolean(chapter.trim())))
    .sort((a, b) => a.pageNumber - b.pageNumber);
  const chapters = conceptChaptersFromPages(storedPages);
  const pageRows = await Promise.all(storedPages.map(async (storedPage) => ({
    concepts: await getBookConceptsForBookPage(book.id, storedPage.pageNumber),
    exercises: await getExercisesForBookPage([book.id, storedPage.pageNumber]),
    storedPage
  })));
  const inventory = pageRows.flatMap(({ concepts }) => concepts);
  const exerciseConceptIds = new Set(pageRows.flatMap(({ exercises }) => exercises.flatMap(({ conceptId }) => conceptId === undefined ? [] : [conceptId])));
  const existingByPage = new Map(pageRows.map(({ exercises, storedPage }) => [storedPage.pageNumber, exercises] as const));
  const chapterInputs = chapters.flatMap((chapter) => {
    const chapterConcepts = conceptsForNavigationChapter(inventory, chapter);
    const targets = chapterConcepts.filter(({ id }) => !command.options.onlyMissingExercises || id === undefined || !exerciseConceptIds.has(id));
    if (targets.some(({ id }) => id === undefined)) throw new Error(`Every Concept must have an id before Exercises can be generated (${chapter.title || 'untitled chapter'}).`);
    const byPage = new Map<number, BookConcept[]>();
    targets.forEach((concept) => byPage.set(concept.bookPage[1], [...(byPage.get(concept.bookPage[1]) ?? []), concept]));
    const pages = Array.from(byPage.entries()).sort(([a], [b]) => a - b).map(([pageNumber, concepts]) => ({
      concepts: concepts.map(({ description, id, title }) => ({ description, sourceId: id as number, title })),
      pageNumber
    }));
    return pages.length ? [{ chapter: chapter.title, pages }] : [];
  });
  const client = await requireOpenRouterClient(signal);
  const generatedByPage = new Map<number, Array<Omit<Exercise, 'bookPage' | 'id'>>>();
  let generatedChapters = 0;

  await progress(0, Math.max(1, chapterInputs.length + pageRows.length), 'Generating exercises');
  await mapConcurrent(chapterInputs, OPENROUTER_CONCURRENCY, async (chapterInput) => {
    throwIfAborted();
    const processed = await processExtractedChapterContent(chapterInput, async (prompt) => {
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: prompt, role: 'user' }],
        model: command.options.model || DEFAULT_PROCESSING_MODEL,
        response_format: { type: 'json_object' }
      }));
      reportOpenRouterCost(response, cost);
      return response.choices[0].message?.content?.trim() ?? '{}';
    }, bookLanguageLabel(book.language as string), book.age);

    for (const page of processed.pages) {
      const generated = page.exercises.flatMap((exercise): Array<Omit<Exercise, 'bookPage' | 'id'>> => {
        const source = exercise.conceptIndex === undefined ? undefined : page.concepts[exercise.conceptIndex];
        return source?.sourceId === undefined ? [] : [{
          conceptId: source.sourceId,
          description: stripMarkdownImageReferences(exercise.description),
          imageDescription: exercise.imageDescription,
          solution: exercise.solution,
          solutionImageDescription: exercise.solutionImageDescription,
          source: exercise.source,
          title: exercise.title
        }];
      });
      generatedByPage.set(page.pageNumber, [...(generatedByPage.get(page.pageNumber) ?? []), ...generated]);
    }
    generatedChapters++;
    await progress(generatedChapters, Math.max(1, chapterInputs.length + pageRows.length), 'Generating exercises');
  });

  let savedPages = 0;
  for (const { storedPage } of pageRows) {
    throwIfAborted();
    const generated = generatedByPage.get(storedPage.pageNumber) ?? [];
    const original = existingByPage.get(storedPage.pageNumber) ?? [];

    if (command.options.onlyMissingExercises && !generated.length) {
      savedPages++;
      await progress(generatedChapters + savedPages, Math.max(1, chapterInputs.length + pageRows.length), 'Saving exercises');
      continue;
    }

    const abilityContents = new Map<number, string[]>();
    if (command.options.onlyMissingExercises) {
      await Promise.all(original.map(async ({ id }) => {
        if (id !== undefined) abilityContents.set(id, (await getAbilities(exerciseAbilityModuleId(book.id, id))).map(({ content }) => content));
      }));
    }
    const replacements = command.options.onlyMissingExercises ? [...original.map(exerciseForPageReplacement), ...generated] : generated;
    await replaceExercisesForBookPage([book.id, storedPage.pageNumber], replacements);

    if (command.options.onlyMissingExercises) {
      const stored = await getExercisesForBookPage([book.id, storedPage.pageNumber]);
      if (stored.length !== replacements.length || stored.some(({ id }) => id === undefined)) throw new Error(`Unable to preserve existing Exercises while adding missing Exercises on page ${storedPage.pageNumber}.`);
      for (let index = 0; index < original.length; index++) {
        const oldId = original[index].id;
        const newId = stored[index].id as number;
        if (oldId === undefined || oldId === newId) continue;
        const contents = abilityContents.get(oldId) ?? [];
        if (contents.length) await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
        await deleteAbilities(exerciseAbilityModuleId(book.id, oldId));
      }
    }
    savedPages++;
    await progress(generatedChapters + savedPages, Math.max(1, chapterInputs.length + pageRows.length), 'Saving exercises');
  }

  await completeBookProcessingStage(book.id, 'exercises');
}

async function runStandards ({ book, command, cost, progress, signal, throwIfAborted }: StageContext): Promise<void> {
  if (!isBookProcessingStageComplete(book, 'fixImages')) {
    throw new Error('Complete Fix images before identifying Standards.');
  }
  if (!isBookProcessingStageComplete(book, 'embeddings')) {
    throw new Error('Complete Embedings before identifying Standards.');
  }

  const pages = await getBookPages(book.id);
  const chapters = conceptChaptersFromPages(pages);
  if (!chapters.length) throw new Error('No chapters are available for Standards.');
  const client = await requireOpenRouterClient(signal);
  const catalogs = await loadStandardsCatalogsForBookSubject(book.subject);
  const inventory = await getBookConceptInventory(book.id, pages.map(({ pageNumber }) => pageNumber));
  const embeddingModel = command.options.embeddingModel || DEFAULT_STANDARDS_EMBEDDER;
  const conceptEmbeddings = await cachedConceptEmbeddingMap(embeddingModel, inventory);
  const missing = inventory.filter(({ id, title, description }) => id !== undefined && Number.isSafeInteger(id) && id > 0 && (title.trim() || description.trim()) && !conceptEmbeddings.has(id));
  if (missing.length) throw new Error('Concept Embedings are missing or stale for the selected model. Run Embedings again before Standards.');
  const standardEmbeddings = await ensureStandardEmbeddingCache(client, embeddingModel, catalogs, cost);
  const existing = await getBookProcessingArtifact<StoredBookStandards>(book.id, STANDARDS_ARTIFACT) ?? {};
  const next: StoredBookStandards = { ...existing };
  let completed = 0;
  const failures: string[] = [];

  await progress(0, chapters.length, 'Matching standards to chapters');
  const results = await mapConcurrent(chapters, OPENROUTER_CONCURRENCY, async (chapter: ConceptChapterNavigationItem) => {
    try {
      throwIfAborted();
      const rows = getChapterStandardsConceptRows(inventory, chapter);
      const concepts = standardsConceptInputs(rows);
      const fingerprint = standardsConceptFingerprint(concepts, standardsPathForBookSubject(book.subject) ?? 'no-standards');
      const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);
      const current = existing[chapterKey];
      if (current && !needsChapterStandardsIdentification(current, fingerprint, command.options.force)) return { chapterKey, entry: current, status: 'fulfilled' as const };
      const chapterEmbeddings = rows.flatMap(({ id }) => id === undefined ? [] : (conceptEmbeddings.get(id) ? [conceptEmbeddings.get(id) as number[]] : []));
      const standards = await requestChapterStandards(client, command.options.standardsModel || DEFAULT_STANDARDS_MODEL, chapter.title, concepts, chapterEmbeddings, catalogs, standardEmbeddings, cost);
      return { chapterKey, entry: { conceptFingerprint: fingerprint, standards }, status: 'fulfilled' as const };
    } catch (reason) {
      return { chapterKey: standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers), reason, status: 'rejected' as const };
    } finally {
      completed++;
      await progress(completed, chapters.length, 'Matching standards to chapters');
    }
  });

  results.forEach((result) => {
    if (result.status === 'fulfilled') next[result.chapterKey] = result.entry;
    else failures.push(conceptGenerationErrorMessage(result.reason));
  });
  await putBookProcessingArtifact(book.id, STANDARDS_ARTIFACT, next);
  // Successful chapters count as progress even when other chapters failed.
  // Only fail the stage if no chapter could be identified at all.
  if (failures.length === chapters.length) {
    throw new Error(`${failures.length} of ${chapters.length} chapters could not have standards identified. ${failures.join(' | ')}`);
  }
  await completeBookProcessingStage(book.id, 'standards');
  if (failures.length) {
    await progress(chapters.length, chapters.length, `${failures.length} chapter${failures.length === 1 ? '' : 's'} missing standards; successful mappings saved`);
  }
}


async function runFixStandards (context: StageContext): Promise<void> {
  await runStandards({
    ...context,
    command: {
      ...context.command,
      options: { ...context.command.options, force: true }
    }
  });
  await completeBookProcessingStage(context.book.id, 'fixStandards');
}

const STAGE_RUNNERS: Partial<Record<BookProcessingStageKey, (context: StageContext) => Promise<void>>> = {
  abilities: runAbilitiesStage,
  age: runAge,
  chapters: runChapters,
  concepts: runConcepts,
  deduplicateConcepts: runDeduplicateConcepts,
  embeddings: runEmbeddings,
  fixAbilities: runFixAbilitiesStage,
  fixConcepts: runFixConcepts,
  fixImages: runFixImagesStage,
  fixStandards: runFixStandards,
  images: runImagesStage,
  language: runLanguage,
  recognize: runRecognition,
  refineChapters: runRefineChapters,
  sortConcepts: runSortConcepts,
  standards: runStandards,
  subject: runSubject
};

export async function runBookProcessingStage (command: BookProcessingWorkerCommand, signal: AbortSignal, services: BookProcessingWorkerServices): Promise<void> {
  const book = await getBook(command.bookId);

  if (!book) {
    throw new Error('Book not found.');
  }

  const runner = STAGE_RUNNERS[command.stage];

  if (!runner) {
    throw new Error(`Background processing for ${command.stage} is not implemented yet.`);
  }

  let spent = 0;
  const pendingWrites: Promise<unknown>[] = [];
  const cost: OpenRouterCostReporter = (amount) => {
    if (!Number.isFinite(amount) || amount <= 0) return;
    spent += amount;
    pendingWrites.push(addBookStageSpend(book.id, command.stage, amount));
    pendingWrites.push(updateBookProcessingWorker(command.workerId, { spent }));
  };
  const progress = async (value: number, total: number, label?: string): Promise<void> => {
    ensureNotAborted(signal);
    await updateBookProcessingWorker(command.workerId, {
      progressTotal: Math.max(0, total),
      progressValue: Math.max(0, value),
      ...(label ? { stageLabel: label } : {})
    });
  };
  const context: StageContext = {
    book,
    command,
    cost,
    progress,
    services,
    signal,
    throwIfAborted: () => ensureNotAborted(signal),
    waitForWrites: async () => { await Promise.allSettled(pendingWrites); }
  };

  try {
    ensureNotAborted(signal);
    await runner(context);
    ensureNotAborted(signal);
  } finally {
    await context.waitForWrites();
  }
}
