// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, Exercise } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { getAbilities, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, putBook, putBookPage, replaceParsedBookPageContent, SettingKey, storeSetting, updateBookProcessingStage } from '@slonigiraf/db';
import { KatexSpan, RoundProgress } from '@slonigiraf/slonig-components';
import { strFromU8, unzipSync } from 'fflate';
import MathpixLoader from 'mathpix-markdown-it/lib/components/mathpix-loader/index.js';
import MathpixMarkdown from 'mathpix-markdown-it/lib/components/mathpix-markdown/index.js';
import OpenAI from 'openai';
import * as PDFDocumentModule from 'pdf-lib/cjs/api/PDFDocument.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { bookLanguageLabel, getMiddleBookPageNumbers, parseDetectedBookLanguage } from './bookLanguage.js';
import { areAllBookPagesConceptsProcessed, calculatePageSymbolStatistics, countUnprocessedBookPages, isWithinTwoStandardDeviations, processExtractedChapterContent } from './bookProcessing.js';
import { mapConcurrent } from './concurrency.js';
import { OPENROUTER_CONCURRENCY, openRouterRequestGate } from './openRouterConcurrency.js';
import { BOOK_LANGUAGE_DETECTION_PROMPT, BOOK_PAGE_EXTRACTION_REQUEST_PROMPT, exerciseAbilityModes, OPENAI_MODELS } from './constants.js';
import { stripMarkdownImageReferences } from './bookImageRefs.js';
import Skills from './Skills.js';
import SkillsCourse from './SkillsCourse.js';

export { OPENAI_MODELS } from './constants.js';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

interface GeneratedPageExercise {
  abilityMode: string;
  description: string;
  imageDescription?: string;
  imageIndexes?: number[];
  solution: string;
  solutionImageDescription?: string;
  title: string;
}

interface GeneratedConcepts {
  chapter: string;
  concepts: Array<{ description: string; title: string }>;
  exercises?: GeneratedPageExercise[];
}

function parseGeneratedConcepts (content: string, imageCount = 0): GeneratedConcepts {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed: Partial<GeneratedConcepts>;

  try {
    parsed = JSON.parse(json) as Partial<GeneratedConcepts>;
  } catch {
    // Models occasionally return LaTeX commands with JSON-invalid single
    // backslashes (for example, "\\alpha" instead of "\\\\alpha").
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as Partial<GeneratedConcepts>;
  }

  if (typeof parsed.chapter !== 'string' || !Array.isArray(parsed.concepts) || parsed.concepts.some(({ description, title }) => typeof title !== 'string' || typeof description !== 'string') || (parsed.exercises !== undefined && (!Array.isArray(parsed.exercises) || parsed.exercises.some((exercise) => {
    const { abilityMode, description, solution, title } = exercise as { abilityMode?: unknown; description?: unknown; solution?: unknown; title?: unknown };

    return typeof title !== 'string' || typeof description !== 'string' || typeof solution !== 'string' || !solution.trim() || typeof abilityMode !== 'string' || !exerciseAbilityModes.includes(abilityMode as typeof exerciseAbilityModes[number]);
  })))) {
    throw new Error('OpenRouter returned invalid concept data.');
  }

  return {
    chapter: parsed.chapter.trim(),
    concepts: parsed.concepts.map(({ description, title }) => ({ description: description.trim(), title: title.trim() })).filter(({ title }) => title),
    exercises: (parsed.exercises ?? []).map((exercise) => {
      const value = exercise as GeneratedPageExercise & { imageIndex?: unknown; imageIndexes?: unknown };
      const legacyImageIndex = value.imageIndex === null || value.imageIndex === undefined ? undefined : Number(value.imageIndex);
      const imageIndexes = Array.isArray(value.imageIndexes)
        ? Array.from(new Set(value.imageIndexes.map(Number).filter((index) => Number.isInteger(index) && index >= 0 && index < imageCount)))
        : legacyImageIndex !== undefined && Number.isInteger(legacyImageIndex) && legacyImageIndex >= 0 && legacyImageIndex < imageCount
          ? [legacyImageIndex]
          : [];

      return {
        abilityMode: value.abilityMode,
        description: stripMarkdownImageReferences(value.description.trim()),
        imageDescription: typeof value.imageDescription === 'string' ? value.imageDescription.trim() : '',
        imageIndexes,
        solution: value.solution.trim(),
        solutionImageDescription: typeof value.solutionImageDescription === 'string' ? value.solutionImageDescription.trim() : '',
        title: value.title.trim()
      };
    }).filter(({ title }) => title)
  };
}

function storageReadyGeneratedConcepts (generated: GeneratedConcepts): GeneratedConcepts {
  return {
    ...generated,
    exercises: (generated.exercises ?? []).map(({ abilityMode, description, imageDescription = '', solution, solutionImageDescription = '', title }) => ({
      abilityMode,
      description: stripMarkdownImageReferences(description),
      imageDescription: imageDescription.trim(),
      solution,
      solutionImageDescription: solutionImageDescription.trim(),
      title
    }))
  };
}

function resolveChapterTitle (generatedTitle: string, pageNumber: number, pages: Map<number, BookPage>): string {
  const title = generatedTitle.trim();

  if (title) {
    return title;
  }

  for (let previousPage = pageNumber - 1; previousPage >= 1; previousPage--) {
    const previousChapter = pages.get(previousPage)?.chapter.trim();

    if (previousChapter) {
      return previousChapter;
    }
  }

  return 'Introduction';
}

async function requestGeneratedPageContent (client: OpenAI, model: string, mmdZipInput: MMDZipInput): Promise<GeneratedConcepts> {
  if (!mmdZipInput.text.trim() && !mmdZipInput.images.length) {
    return { chapter: '', concepts: [], exercises: [] };
  }

  const response = await openRouterRequestGate.run(() => client.chat.completions.create({
    messages: [{
      content: [
        {
          text: BOOK_PAGE_EXTRACTION_REQUEST_PROMPT(mmdZipInput.text, mmdZipInput.images.map(({ name }) => name)),
          type: 'text'
        },
        ...mmdZipInput.images.map(({ image_url, type }) => ({ image_url, type }))
      ],
      role: 'user'
    }],
    model,
    response_format: { type: 'json_object' }
  }));
  const generatedContent = response.choices[0].message?.content?.trim();

  if (!generatedContent) {
    return { chapter: '', concepts: [], exercises: [] };
  }

  const generated = parseGeneratedConcepts(generatedContent, mmdZipInput.images.length);
  return storageReadyGeneratedConcepts(generated);
}

async function generatePageContentWithEmptyConceptRetry (client: OpenAI, model: string, mmdZipInput: MMDZipInput, retryEmptyConcepts: boolean): Promise<GeneratedConcepts> {
  const firstResult = await requestGeneratedPageContent(client, model, mmdZipInput);

  if (firstResult.concepts.length || !retryEmptyConcepts) {
    return firstResult;
  }

  let secondResult: GeneratedConcepts;

  try {
    secondResult = await requestGeneratedPageContent(client, model, mmdZipInput);
  } catch {
    // The first result was valid but empty. A failed recovery request must not
    // leave this page permanently blocking exercise generation.
    return firstResult;
  }

  if (secondResult.concepts.length) {
    return secondResult;
  }

  return {
    chapter: secondResult.chapter || firstResult.chapter,
    concepts: [],
    exercises: secondResult.exercises?.length ? secondResult.exercises : firstResult.exercises ?? []
  };
}

const MAX_REQUESTS_PER_MIN = 180;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RECOGNITION_PAGE_SPAWN_INTERVAL_MS = Math.ceil(RATE_LIMIT_WINDOW_MS / MAX_REQUESTS_PER_MIN);

const pageSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-page`;

function getSessionPage (bookId: number): number {
  try {
    const value = Number(sessionStorage.getItem(pageSessionKey(bookId)));

    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

function storeSessionPage (bookId: number, pageNumber: number): void {
  try {
    sessionStorage.setItem(pageSessionKey(bookId), String(pageNumber));
  } catch {
    // Session storage may be unavailable in privacy-restricted browser contexts.
  }
}

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface MMDZipInput {
  images: Array<{ image_url: { url: string }; name: string; type: 'image_url' }>;
  text: string;
}

function bytesToBase64 (bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return window.btoa(binary);
}

async function extractMMDZipInput (blob: Blob): Promise<MMDZipInput> {
  const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));
  const textEntries: string[] = [];
  const images: MMDZipInput['images'] = [];
  const imageTypes: Record<string, string> = {
    gif: 'image/gif',
    jpeg: 'image/jpeg',
    jpg: 'image/jpeg',
    png: 'image/png',
    webp: 'image/webp'
  };

  Object.entries(entries).forEach(([name, bytes]) => {
    const extension = name.split('.').pop()?.toLowerCase() ?? '';
    const imageType = imageTypes[extension];

    if (imageType) {
      images.push({
        image_url: { url: `data:${imageType};base64,${bytesToBase64(bytes)}` },
        name,
        type: 'image_url'
      });
    } else if (['html', 'json', 'md', 'mmd', 'tex', 'txt'].includes(extension)) {
      textEntries.push(`--- ${name} ---\n${strFromU8(bytes)}`);
    }
  });

  // A cover, separator, or image-only page can legitimately contain no
  // readable text. Treat it as valid extraction input instead of failing the
  // whole Concepts stage; images can still be sent to the model when present.
  return { images, text: textEntries.join('\n\n') };
}

async function getPageConceptInput (page: BookPage): Promise<MMDZipInput | undefined> {
  const recognizedText = page.pageMMD?.trim() ?? '';

  if (page.pageMMDZip) {
    try {
      const zipInput = await extractMMDZipInput(page.pageMMDZip);

      // Mathpix can return readable pageMMD while the ZIP itself contains no
      // text entry. Keep any ZIP images, but fall back to the recognized MMD
      // text so a real text page is never silently skipped.
      return {
        images: zipInput.images,
        text: zipInput.text.trim() ? zipInput.text : recognizedText
      };
    } catch (error) {
      // Older/incomplete stored recognition results can have a bad ZIP while
      // still containing valid recognized text. The text is sufficient for
      // concept extraction, so only fail when neither source is usable.
      if (!recognizedText) {
        throw error;
      }
    }
  }

  return recognizedText ? { images: [], text: recognizedText } : undefined;
}

async function createSinglePagePdf (file: File, pageNumber: number): Promise<Blob> {
  const sourcePdf = await PDFDocumentModule.default.load(await file.arrayBuffer());
  const pagePdf = await PDFDocumentModule.default.create();
  const [page] = await pagePdf.copyPages(sourcePdf, [pageNumber - 1]);

  pagePdf.addPage(page);

  const bytes = await pagePdf.save();
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return new Blob([buffer], { type: 'application/pdf' });
}

async function recognizePageWithMathpix (apiKey: string, file: File, pageNumber: number): Promise<Pick<BookPage, 'pageMMD' | 'pageMMDZip'>> {
  const headers = { app_key: apiKey };
  const body = new FormData();
  const pagePdf = await createSinglePagePdf(file, pageNumber);
  const fileName = `${file.name.replace(/\.pdf$/i, '')}-page-${pageNumber}.pdf`;

  body.append('file', pagePdf, fileName);
  body.append('options_json', JSON.stringify({
    conversion_formats: { 'mmd.zip': true }
  }));

  const response = await fetch('https://api.mathpix.com/v3/pdf', {
    body,
    headers,
    method: 'POST'
  });
  const result = await response.json() as { error?: string; pdf_id?: string };

  if (!response.ok || !result.pdf_id) {
    throw new Error(result.error || 'Mathpix could not start PDF recognition.');
  }

  for (let attempt = 0; attempt < 120; attempt++) {
    const statusResponse = await fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}`, { headers });
    const statusResult = await statusResponse.json() as {
      conversion_status?: Record<string, { error?: string; status?: string }>;
      error?: string;
      status?: string;
    };
    const zipStatus = statusResult.conversion_status?.['mmd.zip'];

    if (!statusResponse.ok) {
      throw new Error(statusResult.error || 'Unable to check Mathpix PDF recognition.');
    }

    if (statusResult.status === 'error') {
      throw new Error(statusResult.error || 'Mathpix could not recognize the PDF page.');
    }

    if (zipStatus?.status === 'error') {
      throw new Error(zipStatus.error || 'Mathpix could not create the MMD ZIP.');
    }

    if (statusResult.status === 'completed' && zipStatus?.status === 'completed') {
      const [mmdResponse, zipResponse] = await Promise.all([
        fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.mmd`, { headers }),
        fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.mmd.zip`, { headers })
      ]);

      if (!mmdResponse.ok || !zipResponse.ok) {
        throw new Error('Unable to download the MMD results from Mathpix.');
      }

      return {
        pageMMD: (await mmdResponse.text()).trim(),
        pageMMDZip: await zipResponse.blob()
      };
    }

    await delay(1000);
  }

  throw new Error('Mathpix timed out while recognizing the PDF page.');
}

interface Props {
  book: Book;
  file: File;
  generateAllConceptsModel: string;
  generateAllConceptsRequest: number;
  onBookChange: (book: Book) => void;
  onProcessingComplete: () => void;
  pendingProcessingAction?: 'concepts' | 'recognize' | 'exercises';
  processingToolbar: React.ReactNode;
  generateAllExercisesRequest: number;
  recognizeAllRequest: number;
}

type ReaderPane = 'conceptExercises' | 'conceptsSkills' | 'pdfText' | 'preExercisesExercises' | 'skillsCourse' | 'textConcepts';
type RecognitionTarget = 'all' | 'page';

interface ReaderEntityCounts {
  abilities: number;
  bookExercises: number;
  concepts: number;
  exercises: number;
}

interface ExerciseChapterNavigationItem {
  pageNumbers: number[];
  title: string;
}

const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

const readerPaneSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-pane`;
const exerciseChapterSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-exercises-chapter`;

function getSessionExerciseChapter (bookId: number): number {
  try {
    const stored = Number(sessionStorage.getItem(exerciseChapterSessionKey(bookId)));

    return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function getSessionReaderPane (bookId: number): ReaderPane {
  try {
    const value = sessionStorage.getItem(readerPaneSessionKey(bookId));

    return value === 'pdfText' || value === 'textConcepts' || value === 'conceptExercises' || value === 'preExercisesExercises' || value === 'skillsCourse' ? value : 'pdfText';
  } catch {
    return 'pdfText';
  }
}

function BookReader ({ book, file, generateAllConceptsModel, generateAllConceptsRequest, onBookChange, onProcessingComplete, pendingProcessingAction, processingToolbar, recognizeAllRequest, generateAllExercisesRequest }: Props): React.ReactElement {
  const [activePane, setActivePane] = useState<ReaderPane>(() => getSessionReaderPane(book.id));
  const [concepts, setConcepts] = useState<BookConcept[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [exerciseChapterConcepts, setExerciseChapterConcepts] = useState<BookConcept[]>([]);
  const [exerciseChapterExercises, setExerciseChapterExercises] = useState<Exercise[]>([]);
  const [exerciseChapterIndex, setExerciseChapterIndex] = useState(() => getSessionExerciseChapter(book.id));
  const [isExerciseChapterLoading, setIsExerciseChapterLoading] = useState(false);
  const [error, setError] = useState('');
  const [entityCounts, setEntityCounts] = useState<ReaderEntityCounts>({ abilities: 0, bookExercises: 0, concepts: 0, exercises: 0 });
  const [generatedConceptsPageCount, setGeneratedConceptsPageCount] = useState(0);
  const [isDetectingBookLanguage, setIsDetectingBookLanguage] = useState(false);
  const [isGeneratingAllConcepts, setIsGeneratingAllConcepts] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMathpixKeyPromptOpen, setIsMathpixKeyPromptOpen] = useState(false);
  const [isPageGenerationConfirmationOpen, setIsPageGenerationConfirmationOpen] = useState(false);
  const [isGeneratingAllExercises, setIsGeneratingAllExercises] = useState(false);
  const [isRecognizingAll, setIsRecognizingAll] = useState(false);
  const [mathpixApiKey, setMathpixApiKey] = useState('');
  const [recognizedPageCount, setRecognizedPageCount] = useState(0);
  const [generatedExercisesPageCount, setGeneratedExercisesPageCount] = useState(0);
  const [recognitionTarget, setRecognitionTarget] = useState<RecognitionTarget>('page');
  const [processingPage, setProcessingPage] = useState<number>();
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [renderedPageHeight, setRenderedPageHeight] = useState<number>();
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);
  const [totalPages, setTotalPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handledGenerateAllConceptsRequestRef = useRef(generateAllConceptsRequest);
  const handledGenerateAllExercisesRequestRef = useRef(generateAllExercisesRequest);
  const handledRecognizeAllRequestRef = useRef(recognizeAllRequest);
  const isDetectingBookLanguageRef = useRef(false);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const pageGenerationEstimate = useMemo(() => {
    const pageText = pages.get(pageNumber)?.pageMMD ?? '';
    const validationInput = pageText.slice(0, Math.ceil(pageText.length / 3));

    return formatAiInputEstimate(estimateAiInput(selectedModel, [pageText.padEnd(pageText.length + 2_000), validationInput.padEnd(validationInput.length + 2_000)], 4_800));
  }, [pageNumber, pages, selectedModel]);
  const exerciseChapters = useMemo<ExerciseChapterNavigationItem[]>(() => {
    const grouped = new Map<string, ExerciseChapterNavigationItem>();

    Array.from(pages.values())
      .filter(({ conceptsProcessed }) => conceptsProcessed)
      .sort((a, b) => a.pageNumber - b.pageNumber)
      .forEach(({ chapter, pageNumber }) => {
        const title = chapter.trim();
        const current = grouped.get(title);

        if (current) {
          current.pageNumbers.push(pageNumber);
        } else {
          grouped.set(title, { pageNumbers: [pageNumber], title });
        }
      });

    return Array.from(grouped.values());
  }, [pages]);
  const currentExerciseChapter = exerciseChapters[exerciseChapterIndex];

  const refreshEntityCounts = useCallback(async (): Promise<void> => {
    const storedPages = await getBookPages(book.id);
    const pageRows = await Promise.all(storedPages.map(async ({ pageNumber }) => {
      const [pageConcepts, pageExercises] = await Promise.all([
        getBookConceptsForBookPage(book.id, pageNumber),
        getExercisesForBookPage([book.id, pageNumber])
      ]);

      return { concepts: pageConcepts, exercises: pageExercises };
    }));
    const allExercises = pageRows.flatMap(({ exercises }) => exercises);
    const abilities = (await Promise.all(allExercises.flatMap(({ id }) => id === undefined ? [] : [getAbilities(exerciseAbilityModuleId(book.id, id))]))).flat();

    setEntityCounts({
      abilities: abilities.length,
      bookExercises: allExercises.filter(({ source }) => source !== 'generated').length,
      concepts: pageRows.reduce((count, { concepts }) => count + concepts.length, 0),
      exercises: allExercises.length
    });
  }, [book.id]);

  const onSkillsEntityCountsChange = useCallback(({ abilities, bookExercises, exercises }: Pick<ReaderEntityCounts, 'abilities' | 'bookExercises' | 'exercises'>): void => {
    setEntityCounts((current) => ({ ...current, abilities, bookExercises, exercises }));
  }, []);
  const changeExerciseChapter = useCallback((index: number): void => {
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, exerciseChapters.length - 1)));

    setExerciseChapterIndex(nextIndex);

    try {
      sessionStorage.setItem(exerciseChapterSessionKey(book.id), String(nextIndex));
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }
  }, [book.id, exerciseChapters.length]);

  useEffect(() => {
    refreshEntityCounts().catch(() => undefined);
  }, [book.processingStage, refreshEntityCounts]);

  useEffect((): void => {
    if (!exerciseChapters.length) {
      setExerciseChapterIndex(0);

      return;
    }

    if (exerciseChapterIndex >= exerciseChapters.length) {
      changeExerciseChapter(exerciseChapters.length - 1);
    }
  }, [changeExerciseChapter, exerciseChapterIndex, exerciseChapters.length]);

  useEffect(() => {
    try {
      sessionStorage.setItem(readerPaneSessionKey(book.id), activePane);
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }
  }, [activePane, book.id]);

  useEffect(() => {
    if (pendingProcessingAction === 'recognize') {
      setActivePane('pdfText');
    } else if (pendingProcessingAction === 'concepts' || pendingProcessingAction === 'exercises') {
      setActivePane('textConcepts');
    }
  }, [pendingProcessingAction]);
  const advanceStage = useCallback(async (processingStage: number): Promise<void> => {
    if ((book.processingStage ?? 0) >= processingStage) {
      return;
    }

    const updatedBook = await updateBookProcessingStage(book.id, processingStage);

    // Keep the parent toolbar in sync even when the DB helper performs the
    // update without returning the updated row.
    onBookChange(updatedBook ?? { ...book, processingStage });
  }, [book, onBookChange]);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;

    setError('');
    setPdf(undefined);
    setRenderedPageHeight(undefined);
    setTotalPages(0);

    const load = async (): Promise<void> => {
      const data = new Uint8Array(await file.arrayBuffer());

      if (!active) {
        return;
      }

      loadingTask = getDocument({ data });

      const [document, storedPages] = await Promise.all([
        loadingTask.promise,
        getBookPages(book.id)
      ]);

      if (!active) {
        void document.destroy();

        return;
      }

      setPdf(document);
      setTotalPages(document.numPages);
      setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
      const hasEveryPage = storedPages.length === document.numPages;

      if (areAllBookPagesConceptsProcessed(document.numPages, storedPages)) {
        await advanceStage(2);
      } else if (hasEveryPage && storedPages.every(({ pageMMD }) => !!pageMMD)) {
        await advanceStage(1);
      }

      const restoredPage = Math.min(document.numPages, getSessionPage(book.id));

      setPageNumber(restoredPage);
      setPageInput(String(restoredPage));
    };

    load().catch(() => active && setError('Unable to open this PDF.'));

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [advanceStage, book.id, file]);

  useEffect(() => {
    let active = true;

    const loadPageLearningContent = async (): Promise<void> => {
      const [storedConcepts, storedExercises] = await Promise.all([
        getBookConceptsForBookPage(book.id, pageNumber),
        getExercisesForBookPage([book.id, pageNumber])
      ]);
      if (active) {
        setConcepts(storedConcepts);
        setExercises(storedExercises);
      }
    };

    loadPageLearningContent().catch(() => active && setError('Unable to load concepts and exercises.'));

    return () => {
      active = false;
    };
  }, [book.id, pageNumber, pages]);

  useEffect(() => {
    if (activePane !== 'conceptExercises') {
      return;
    }

    let active = true;

    const loadChapterLearningContent = async (): Promise<void> => {
      if (!currentExerciseChapter) {
        setExerciseChapterConcepts([]);
        setExerciseChapterExercises([]);
        setIsExerciseChapterLoading(false);

        return;
      }

      setExerciseChapterConcepts([]);
      setExerciseChapterExercises([]);
      setIsExerciseChapterLoading(true);
      const pageRows = await Promise.all(currentExerciseChapter.pageNumbers.map(async (chapterPageNumber) => {
        const [storedConcepts, storedExercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, chapterPageNumber),
          getExercisesForBookPage([book.id, chapterPageNumber])
        ]);

        return { concepts: storedConcepts, exercises: storedExercises };
      }));

      if (active) {
        setExerciseChapterConcepts(pageRows.flatMap(({ concepts }) => concepts));
        setExerciseChapterExercises(pageRows.flatMap(({ exercises }) => exercises));
      }
    };

    loadChapterLearningContent()
      .catch(() => active && setError('Unable to load this chapter’s exercises.'))
      .finally(() => active && setIsExerciseChapterLoading(false));

    return () => {
      active = false;
    };
  }, [activePane, book.id, currentExerciseChapter]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !pageAreaRef.current) {
      return;
    }

    let renderTask: RenderTask | undefined;
    let active = true;
    const canvas = canvasRef.current;
    const pageArea = pageAreaRef.current;

    const render = async (): Promise<void> => {
      const page = await pdf.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(pageArea.clientWidth, 320);
      const scale = availableWidth / initialViewport.width;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');

      if (!active || !context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;

      if (active) {
        setRenderedPageHeight(canvas.getBoundingClientRect().height);
      }
    };

    render().catch((renderError: Error) => {
      if (renderError.name !== 'RenderingCancelledException') {
        setError('Unable to render this page.');
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [activePane, isMaximized, pageNumber, pdf]);

  const generateConcepts = useCallback(async (): Promise<void> => {
    const storedPage = pages.get(pageNumber);

    if (!storedPage || (!storedPage.pageMMDZip && !storedPage.pageMMD?.trim()) || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll) {
      return;
    }

    setError('');
    setProcessingPage(pageNumber);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: {
          'HTTP-Referer': window.location.origin,
          'X-OpenRouter-Title': 'Slonig'
        }
      });
      const mmdZipInput = await getPageConceptInput(storedPage);

      if (!mmdZipInput) {
        throw new Error('Page has no recognized text or MMD ZIP content.');
      }

      const symbolStatistics = calculatePageSymbolStatistics(Array.from(pages.values()).flatMap(({ pageMMD }) => typeof pageMMD === 'string' ? [pageMMD] : []));
      const pageSymbolCount = storedPage.pageMMD?.length ?? mmdZipInput.text.length;
      const generatedConcepts = await generatePageContentWithEmptyConceptRetry(client, selectedModel, mmdZipInput, isWithinTwoStandardDeviations(pageSymbolCount, symbolStatistics));

      const resolvedChapter = resolveChapterTitle(generatedConcepts.chapter, pageNumber, pages);
      const generatedPage: BookPage = {
        ...storedPage,
        bookId: book.id,
        chapter: resolvedChapter,
        conceptsProcessed: true,
        pageNumber
      };

      let stored: Awaited<ReturnType<typeof replaceParsedBookPageContent>> | undefined;

      if (generatedConcepts.concepts.length) {
        // Normal pages are marked processed only after their generated content
        // has been stored successfully.
        stored = await replaceParsedBookPageContent(book.id, pageNumber, resolvedChapter, generatedConcepts.concepts, generatedConcepts.exercises ?? []);
        await putBookPage(generatedPage);
      } else {
        // A valid empty result is itself a successful Concepts-stage result.
        // Persist that state before touching concept rows so an empty-array
        // storage edge case cannot keep Exercises disabled.
        await putBookPage(generatedPage);

        try {
          stored = await replaceParsedBookPageContent(book.id, pageNumber, resolvedChapter, [], generatedConcepts.exercises ?? []);
        } catch {
          // There may be nothing to replace. The page processing result is
          // still valid and must not block the next stage.
        }

        // Reassert the flag in case content replacement also updates BookPage.
        await putBookPage(generatedPage);
      }

      const updatedPages = new Map(pages).set(pageNumber, generatedPage);

      setPages(updatedPages);
      setConcepts(stored?.concepts ?? []);
      setExercises(stored?.exercises ?? []);
      await refreshEntityCounts();

      if (areAllBookPagesConceptsProcessed(totalPages, Array.from(updatedPages.values()))) {
        await advanceStage(2);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [advanceStage, book.id, isGeneratingAllConcepts, isRecognizingAll, pageNumber, pages, processingPage, refreshEntityCounts, selectedModel, totalPages]);
  const closePageGenerationConfirmation = useCallback((): void => setIsPageGenerationConfirmationOpen(false), []);
  const confirmPageGeneration = useCallback((): void => {
    setIsPageGenerationConfirmationOpen(false);
    generateConcepts().catch(console.error);
  }, [generateConcepts]);

  const generateAllConcepts = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll) {
      return;
    }

    setError('');
    setIsGeneratingAllConcepts(true);
    setGeneratedConceptsPageCount(0);

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      setError('No OpenRouter token found. Add it in Settings.');
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();

      return;
    }

    const client = new OpenAI({
      apiKey: key,
      baseURL: 'https://openrouter.ai/api/v1',
      dangerouslyAllowBrowser: true,
      defaultHeaders: {
        'HTTP-Referer': window.location.origin,
        'X-OpenRouter-Title': 'Slonig'
      }
    });
    const eligiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
      .filter((currentPageNumber) => {
        const page = pages.get(currentPageNumber);

        return !!page?.pageMMDZip || !!page?.pageMMD?.trim();
      });
    const resolvedPages = new Map(pages);
    const symbolStatistics = calculatePageSymbolStatistics(Array.from(pages.values()).flatMap(({ pageMMD }) => typeof pageMMD === 'string' ? [pageMMD] : []));

    try {
      const generationResults = await mapConcurrent(eligiblePages, OPENROUTER_CONCURRENCY, async (currentPageNumber) => {
        try {
          const storedPage = pages.get(currentPageNumber);

          if (!storedPage) {
            throw new Error('Page has not been recognized.');
          }

          const mmdZipInput = await getPageConceptInput(storedPage);

          if (!mmdZipInput) {
            throw new Error('Page has no recognized text or MMD ZIP content.');
          }

          const pageSymbolCount = storedPage.pageMMD?.length ?? mmdZipInput.text.length;

          return {
            generatedConcepts: await generatePageContentWithEmptyConceptRetry(client, generateAllConceptsModel, mmdZipInput, isWithinTwoStandardDeviations(pageSymbolCount, symbolStatistics)),
            status: 'fulfilled' as const,
            storedPage
          };
        } catch (reason) {
          return { reason, status: 'rejected' as const };
        }
      });
      let failedConceptTasks = 0;

      // Persist in page order so blank chapter titles still inherit from the
      // nearest preceding page exactly as they did before parallel generation.
      for (let index = 0; index < generationResults.length; index++) {
        const result = generationResults[index];
        const currentPageNumber = eligiblePages[index];

        if (result.status === 'rejected') {
          failedConceptTasks++;
          continue;
        }

        try {
          const { generatedConcepts, storedPage } = result;

          const resolvedChapter = resolveChapterTitle(generatedConcepts.chapter, currentPageNumber, resolvedPages);
          const generatedPage: BookPage = {
            ...storedPage,
            bookId: book.id,
            chapter: resolvedChapter,
            conceptsProcessed: true,
            pageNumber: currentPageNumber
          };

          let stored: Awaited<ReturnType<typeof replaceParsedBookPageContent>> | undefined;

          if (generatedConcepts.concepts.length) {
            stored = await replaceParsedBookPageContent(book.id, currentPageNumber, resolvedChapter, generatedConcepts.concepts, generatedConcepts.exercises ?? []);
            await putBookPage(generatedPage);
          } else {
            // Empty concepts are a successful extraction result. Commit the
            // page-level completion independently from concept-row storage.
            await putBookPage(generatedPage);

            try {
              stored = await replaceParsedBookPageContent(book.id, currentPageNumber, resolvedChapter, [], generatedConcepts.exercises ?? []);
            } catch {
              // Do not turn a valid `concepts: []` result into an unprocessed
              // page merely because there are no concept rows to replace.
            }

            await putBookPage(generatedPage);
          }

          resolvedPages.set(currentPageNumber, generatedPage);
          setPages((current) => new Map(current).set(currentPageNumber, generatedPage));
          setGeneratedConceptsPageCount((count) => count + 1);

          if (currentPageNumber === pageNumber) {
            setConcepts(stored?.concepts ?? []);
            setExercises(stored?.exercises ?? []);
          }
        } catch {
          failedConceptTasks++;
        }
      }

      const allPagesSuccessfullyAttempted = eligiblePages.length === totalPages && failedConceptTasks === 0;
      const storedPagesAfterGeneration = await getBookPages(book.id);
      const conceptsComplete = areAllBookPagesConceptsProcessed(totalPages, storedPagesAfterGeneration);

      setPages(new Map(storedPagesAfterGeneration.map((storedPage) => [storedPage.pageNumber, storedPage])));
      await refreshEntityCounts();

      if (allPagesSuccessfullyAttempted || conceptsComplete) {
        // Do not use concept count as the gate. A text page for which the AI
        // twice returns `concepts: []` has still completed this stage.
        await advanceStage(2);
      } else {
        const failedPages = Math.max(failedConceptTasks, countUnprocessedBookPages(totalPages, storedPagesAfterGeneration));

        setError(`${failedPages} of ${totalPages} pages could not have concepts processed. Recognize missing pages or retry concept generation.`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all pages.');
    } finally {
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();
    }
  }, [advanceStage, book.id, generateAllConceptsModel, isGeneratingAllConcepts, isRecognizingAll, onProcessingComplete, pageNumber, pages, processingPage, refreshEntityCounts, totalPages]);

  const generateAllExercises = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isGeneratingAllExercises) {
      return;
    }

    setError('');
    setIsGeneratingAllExercises(true);
    setGeneratedExercisesPageCount(0);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1', dangerouslyAllowBrowser: true, defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' } });
      const storedPages = (await getBookPages(book.id))
        .filter(({ conceptsProcessed }) => conceptsProcessed)
        .sort((a, b) => a.pageNumber - b.pageNumber);
      const pageInputs = await Promise.all(storedPages.map(async (storedPage) => ({
        chapter: storedPage.chapter,
        concepts: (await getBookConceptsForBookPage(book.id, storedPage.pageNumber)).map(({ description, title }) => ({ description, title })),
        exercises: (await getExercisesForBookPage([book.id, storedPage.pageNumber])).map(({ abilityMode = 'reasoning', description, imageDescription, solution = '', solutionImageDescription, title }) => ({ abilityMode, description: stripMarkdownImageReferences(description), imageDescription, solution, solutionImageDescription, title })),
        pageNumber: storedPage.pageNumber
      })));
      const groupedPages = pageInputs.reduce((grouped, { chapter, ...page }) => {
        const chapterPages = grouped.get(chapter) ?? [];

        chapterPages.push(page);
        grouped.set(chapter, chapterPages);

        return grouped;
      }, new Map<string, Array<Omit<typeof pageInputs[number], 'chapter'>>>());
      const chapterInputs = Array.from(groupedPages, ([chapter, pages]) => ({ chapter, pages }));

      await mapConcurrent(chapterInputs, OPENROUTER_CONCURRENCY, async (chapterInput) => {
        const processedChapter = await processExtractedChapterContent(chapterInput, async (prompt) => {
          const response = await openRouterRequestGate.run(() => client.chat.completions.create({
            messages: [{ content: prompt, role: 'user' }],
            model: generateAllConceptsModel,
            response_format: { type: 'json_object' }
          }));

          return response.choices[0].message?.content?.trim() ?? '{}';
        });

        for (const processed of processedChapter.pages) {
          const stored = await replaceParsedBookPageContent(book.id, processed.pageNumber, processedChapter.chapter, processed.concepts, processed.exercises);

          if (processed.pageNumber === pageNumber) {
            setConcepts(stored.concepts);
            setExercises(stored.exercises);
          }

          setGeneratedExercisesPageCount((count) => count + 1);
        }
      });

      await refreshEntityCounts();
      await advanceStage(3);
      setActivePane('conceptExercises');
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
    } finally {
      setIsGeneratingAllExercises(false);
      onProcessingComplete();
    }
  }, [advanceStage, book.id, generateAllConceptsModel, isGeneratingAllConcepts, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, pageNumber, pages, processingPage, refreshEntityCounts, totalPages]);

  const detectAndStoreBookLanguage = useCallback(async (recognizedPages: Map<number, BookPage>): Promise<void> => {
    if (book.language || isDetectingBookLanguageRef.current) {
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = recognizedPages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      return;
    }

    isDetectingBookLanguageRef.current = true;
    setIsDetectingBookLanguage(true);

    try {
      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }
      });
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_LANGUAGE_DETECTION_PROMPT(pageTexts), role: 'user' }],
        model: selectedModel,
        response_format: { type: 'json_object' }
      }));
      const language = parseDetectedBookLanguage(response.choices[0].message?.content?.trim() ?? '');
      const updatedBook = { ...book, language };

      await putBook(updatedBook);
      onBookChange(updatedBook);
    } finally {
      isDetectingBookLanguageRef.current = false;
      setIsDetectingBookLanguage(false);
    }
  }, [book, onBookChange, selectedModel, totalPages]);

  const isMmdConversionComplete = useMemo((): boolean => {
    if (!totalPages) {
      return false;
    }

    return Array.from({ length: totalPages }, (_, index) => pages.get(index + 1)?.pageMMD?.trim()).every(Boolean);
  }, [pages, totalPages]);

  useEffect((): void => {
    if (
      book.language ||
      !isMmdConversionComplete ||
      isRecognizingAll ||
      processingPage !== undefined
    ) {
      return;
    }

    detectAndStoreBookLanguage(pages).catch((languageError) => {
      setError(languageError instanceof Error ? languageError.message : 'Unable to determine the book language from MMD text.');
    });
  }, [book.language, detectAndStoreBookLanguage, isMmdConversionComplete, isRecognizingAll, pages, processingPage]);

  const recognizePage = useCallback(async (): Promise<void> => {
    if (processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll) {
      return;
    }

    setError('');
    setProcessingPage(pageNumber);

    try {
      const apiKey = await getSetting(SettingKey.MATHPIX_API_KEY);

      if (!apiKey) {
        setMathpixApiKey(apiKey ?? '');
        setRecognitionTarget('page');
        setIsMathpixKeyPromptOpen(true);

        return;
      }

      const { pageMMD, pageMMDZip } = await recognizePageWithMathpix(apiKey, file, pageNumber);

      if (!pageMMD) {
        throw new Error('Mathpix returned no recognized content.');
      }

      const recognizedPage: BookPage = {
        ...pages.get(pageNumber),
        bookId: book.id,
        chapter: pages.get(pageNumber)?.chapter ?? '',
        conceptsProcessed: pages.get(pageNumber)?.conceptsProcessed ?? false,
        pageMMD,
        pageMMDZip,
        pageNumber
      };

      await putBookPage(recognizedPage);
      const updatedPages = new Map(pages).set(pageNumber, recognizedPage);

      setPages(updatedPages);
      if (totalPages && Array.from({ length: totalPages }, (_, index) => updatedPages.get(index + 1)).every((page) => !!page?.pageMMD)) {
        await advanceStage(1);
      }
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this page.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [advanceStage, book.id, file, isGeneratingAllConcepts, isRecognizingAll, pageNumber, pages, processingPage, totalPages]);

  const recognizeAllPages = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll) {
      return;
    }

    setError('');
    setIsRecognizingAll(true);
    setRecognizedPageCount(0);

    const apiKey = await getSetting(SettingKey.MATHPIX_API_KEY);

    if (!apiKey) {
      setMathpixApiKey('');
      setRecognitionTarget('all');
      setIsMathpixKeyPromptOpen(true);
      setIsRecognizingAll(false);
      onProcessingComplete();

      return;
    }

    const recognitionTasks: Array<Promise<void>> = [];

    try {
      for (let currentPageNumber = 1; currentPageNumber <= totalPages; currentPageNumber++) {
        if (currentPageNumber > 1) {
          await delay(RECOGNITION_PAGE_SPAWN_INTERVAL_MS);
        }

        recognitionTasks.push((async () => {
          const { pageMMD, pageMMDZip } = await recognizePageWithMathpix(apiKey, file, currentPageNumber);

          if (!pageMMD) {
            throw new Error('Mathpix returned no recognized content.');
          }

          const storedPage = pages.get(currentPageNumber);
          const recognizedPage: BookPage = {
            ...storedPage,
            bookId: book.id,
            chapter: storedPage?.chapter ?? '',
            conceptsProcessed: storedPage?.conceptsProcessed ?? false,
            pageMMD,
            pageMMDZip,
            pageNumber: currentPageNumber
          };

          await putBookPage(recognizedPage);
          setPages((current) => new Map(current).set(currentPageNumber, recognizedPage));
          setRecognizedPageCount((count) => count + 1);
        })());
      }

      const results = await Promise.allSettled(recognitionTasks);
      const failedPages = results.filter(({ status }) => status === 'rejected').length;

      if (failedPages) {
        setError(`${failedPages} of ${totalPages} pages could not be recognized.`);
      } else {
        await advanceStage(1);
      }

    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
    } finally {
      setIsRecognizingAll(false);
      onProcessingComplete();
    }
  }, [advanceStage, book.id, file, isGeneratingAllConcepts, isRecognizingAll, onProcessingComplete, pages, processingPage, totalPages]);

  const saveMathpixApiKey = useCallback(async (): Promise<void> => {
    const apiKey = mathpixApiKey.trim();

    if (!apiKey) {
      return;
    }

    await storeSetting(SettingKey.MATHPIX_API_KEY, apiKey);
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
    await (recognitionTarget === 'all' ? recognizeAllPages() : recognizePage());
  }, [mathpixApiKey, recognitionTarget, recognizeAllPages, recognizePage]);

  const submitMathpixApiKey = useCallback((): void => {
    saveMathpixApiKey().catch((saveError) => {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the Mathpix API key.');
    });
  }, [saveMathpixApiKey]);

  const closeMathpixKeyPrompt = useCallback((): void => {
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
  }, []);

  useEffect((): void => {
    if (
      generateAllExercisesRequest === handledGenerateAllExercisesRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises
    ) {
      return;
    }

    handledGenerateAllExercisesRequestRef.current = generateAllExercisesRequest;
    setActivePane('textConcepts');
    generateAllExercises().catch((processingError) => {
      setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
      onProcessingComplete();
    });
  }, [isGeneratingAllConcepts, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, processingPage, generateAllExercises, generateAllExercisesRequest, totalPages]);

  useEffect((): void => {
    if (
      generateAllConceptsRequest === handledGenerateAllConceptsRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises
    ) {
      return;
    }

    handledGenerateAllConceptsRequestRef.current = generateAllConceptsRequest;
    setActivePane('textConcepts');
    generateAllConcepts().catch((generationError) => {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all pages.');
      onProcessingComplete();
    });
  }, [generateAllConcepts, generateAllConceptsRequest, isGeneratingAllConcepts, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, processingPage, totalPages]);

  useEffect((): void => {
    if (
      recognizeAllRequest === handledRecognizeAllRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises
    ) {
      return;
    }

    handledRecognizeAllRequestRef.current = recognizeAllRequest;
    setActivePane('pdfText');
    recognizeAllPages().catch((recognitionError) => {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
      onProcessingComplete();
    });
  }, [isGeneratingAllConcepts, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, processingPage, recognizeAllPages, recognizeAllRequest, totalPages]);

  useEffect(() => {
    if (!isMaximized) {
      return;
    }

    const closeOnEscape = ({ key }: KeyboardEvent): void => {
      if (key === 'Escape') {
        setIsMaximized(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape);

    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMaximized]);

  const goToPage = useCallback((requestedPage: number): void => {
    if (!totalPages) {
      return;
    }

    const nextPage = Math.min(totalPages, Math.max(1, requestedPage));

    setPageNumber(nextPage);
    setPageInput(String(nextPage));
    storeSessionPage(book.id, nextPage);
  }, [book.id, totalPages]);

  const submitPageInput = useCallback((): void => {
    const requestedPage = Number(pageInput);

    if (Number.isInteger(requestedPage)) {
      goToPage(requestedPage);
    } else {
      setPageInput(String(pageNumber));
    }
  }, [goToPage, pageInput, pageNumber]);

  const recognizedPane = (): React.ReactNode => (
    <div className='tabPanel'>
      <div className='detailsHeader'>
        <span>{isRecognizingAll
          ? `Recognizing all pages… ${recognizedPageCount}/${totalPages}`
          : processingPage === pageNumber
            ? 'Recognizing page…'
            : isDetectingBookLanguage
              ? 'Detecting book language…'
              : bookLanguageLabel(book.language)}</span>
      </div>
      {pages.get(pageNumber)?.pageMMD
        ? <div className='recognizedOutput'>
          <MathpixLoader>
            <MathpixMarkdown text={pages.get(pageNumber)?.pageMMD ?? ''} />
          </MathpixLoader>
        </div>
        : <p className='emptyOutput'>This page has not been recognized yet.</p>}
    </div>
  );

  const conceptsStatus = isGeneratingAllConcepts
    ? `Generating concepts for all pages… ${generatedConceptsPageCount}/${totalPages}`
    : isGeneratingAllExercises
      ? `Generating exercises… ${generatedExercisesPageCount}/${totalPages}`
      : processingPage === pageNumber
        ? 'Extracting and saving concepts and book exercises…'
        : 'Concepts and exercises';
  const exerciseItem = (exercise: Exercise): React.ReactNode => {
    const description = stripMarkdownImageReferences(exercise.description);

    return <li key={exercise.id}>
      <strong><KatexSpan content={exercise.title} /></strong>
      {description && <p><KatexSpan content={description} /></p>}
      {exercise.abilityMode && <p><small>{exercise.abilityMode}</small></p>}
      {exercise.imageDescription && <p><small>Required visual: <KatexSpan content={exercise.imageDescription} /></small></p>}
      {exercise.solution && <p><KatexSpan content={exercise.solution} /></p>}
      {exercise.solutionImageDescription && <p><small>Solution visual: <KatexSpan content={exercise.solutionImageDescription} /></small></p>}
    </li>;
  };
  const conceptsPane = (): React.ReactNode => {
    const bookExercises = exercises.filter(({ source }) => source !== 'generated');

    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'>
        <span>{conceptsStatus}</span>
      </div>
      {!pages.get(pageNumber)?.pageMMDZip && <p className='recognitionHint'>Recognize this page before generating concepts.</p>}
      <div className='conceptsOutput'>
        <h3>{pages.get(pageNumber)?.chapter || 'Chapter not identified'}</h3>
        <section className='conceptExerciseGroup'>
          <h3>Concepts</h3>
          {concepts.length
            ? <ul>{concepts.map((concept) => <li key={concept.id}>
              <strong><KatexSpan content={concept.title} /></strong>
              {concept.description && <p><KatexSpan content={concept.description} /></p>}
            </li>)}</ul>
            : <p className='emptyOutput'>No concepts were parsed from this book page.</p>}
        </section>
        <section className='conceptExerciseGroup bookExercisesGroup'>
          <h3>Book exercises</h3>
          {bookExercises.length ? <ul>{bookExercises.map(exerciseItem)}</ul> : <p className='emptyOutput'>No exercises were parsed from this book page.</p>}
        </section>
      </div>
    </div>;
  };

  const exercisesPane = (): React.ReactNode => {
    const conceptIds = new Set(exerciseChapterConcepts.flatMap(({ id }) => id === undefined ? [] : [id]));
    const generatedWithoutConcept = exerciseChapterExercises.filter(({ conceptId, source }) => source === 'generated' && (conceptId === undefined || !conceptIds.has(conceptId)));
    const bookExercises = exerciseChapterExercises.filter(({ source }) => source !== 'generated');

    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'><span>{isExerciseChapterLoading ? 'Loading chapter exercises…' : 'Exercises grouped by concept'}</span></div>
      <div className='conceptsOutput'>
        <h3>{currentExerciseChapter?.title || 'Chapter not identified'}</h3>
        {!currentExerciseChapter
          ? <p className='emptyOutput'>No processed chapters are available.</p>
          : <>
            {exerciseChapterConcepts.map((concept) => {
              const generated = exerciseChapterExercises.filter(({ conceptId, source }) => source === 'generated' && concept.id !== undefined && conceptId === concept.id);

              return <section
                className='conceptExerciseGroup'
                key={concept.id}
                     >
                <h4><KatexSpan content={concept.title} /></h4>
                {concept.description && <p><KatexSpan content={concept.description} /></p>}
                {generated.length ? <ul>{generated.map(exerciseItem)}</ul> : <p className='emptyOutput'>No generated exercises for this concept.</p>}
              </section>;
            })}
            {!!generatedWithoutConcept.length && <section className='conceptExerciseGroup'>
              <h4>Other generated exercises</h4>
              <ul>{generatedWithoutConcept.map(exerciseItem)}</ul>
            </section>}
            <section className='conceptExerciseGroup bookExercisesGroup'>
              <h3>Book exercises</h3>
              {bookExercises.length ? <ul>{bookExercises.map(exerciseItem)}</ul> : <p className='emptyOutput'>No exercises were copied from this chapter.</p>}
            </section>
          </>}
      </div>
    </div>;
  };

  return (
    <StyledReader className={`bookReader${isMaximized ? ' isMaximized' : ''}`}>
      {isMathpixKeyPromptOpen && <Modal
        header='Mathpix API key'
        onClose={closeMathpixKeyPrompt}
        size='small'
      >
        <Modal.Content>
          <p>Enter your Mathpix API key to recognize {recognitionTarget === 'all' ? 'all pages' : 'this page'} and create MMD ZIPs.</p>
          <p>
            Get your API key from <a
              href='https://console.mathpix.com/'
              rel='noreferrer'
              target='_blank'
            >Mathpix Console</a>.
          </p>
          <Input
            autoFocus
            isFull
            label='Mathpix API key'
            onChange={setMathpixApiKey}
            onEnter={submitMathpixApiKey}
            placeholder='Enter your API key'
            type='password'
            value={mathpixApiKey}
          />
          <Button.Group>
            <Button
              icon='check'
              isDisabled={!mathpixApiKey.trim()}
              label='Save key'
              onClick={submitMathpixApiKey}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isPageGenerationConfirmationOpen && <Modal
        header='Generate concepts and exercises'
        onClose={closePageGenerationConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{pageGenerationEstimate}</p>
          <p>This extracts concepts and book exercises explicitly present on the page. Generated exercises run in the next pipeline step.</p>
          <Dropdown
            className='modelSelect'
            isDisabled={processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll}
            label='Model'
            onChange={setSelectedModel}
            options={OPENAI_MODELS}
            value={selectedModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label='Cancel'
              onClick={closePageGenerationConfirmation}
            />
            <Button
              icon='magic'
              label='Generate'
              onClick={confirmPageGeneration}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {(pendingProcessingAction || processingPage !== undefined || isRecognizingAll || isGeneratingAllConcepts || isGeneratingAllExercises) && <div className='processingOverlay'>
        <RoundProgress
          total={processingPage !== undefined ? 1 : Math.max(1, totalPages)}
          value={processingPage !== undefined ? 0 : isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? generatedExercisesPageCount : generatedConceptsPageCount}
        />
        <strong>{processingPage !== undefined ? `Processing page ${processingPage}` : isRecognizingAll || pendingProcessingAction === 'recognize' ? 'Recognizing MMD pages' : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? 'Generating exercises' : 'Extracting concepts and book exercises'}</strong>
        {processingPage === undefined && <span>{isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? generatedExercisesPageCount : generatedConceptsPageCount} / {totalPages}</span>}
      </div>}
      <Skills
        book={book}
        onAction={setActivePane}
        onBookChange={onBookChange}
        onEntityCountsChange={onSkillsEntityCountsChange}
        pipelineOnly
        pipelinePrefix={processingToolbar}
        view='conceptsSkills'
      />
      {error && <p
        className='readerError'
        role='alert'
                >{error}</p>}
      <div
        className='readerTabs'
        role='tablist'
      >
        {([
          ['pdfText', 'Text', 1, totalPages],
          ['textConcepts', `Concepts/Exercises (${entityCounts.concepts}/${entityCounts.bookExercises})`, 2, undefined],
          ['conceptExercises', 'Exercises', 3, entityCounts.exercises],
          ['preExercisesExercises', 'Abilities', 4, entityCounts.abilities],
          ['skillsCourse', 'Course', 7, undefined]
        ] as Array<[ReaderPane, string, number, number | undefined]>).filter(([, , requiredStage]) => (book.processingStage ?? 0) >= requiredStage).map(([pane, label, , count]) => (
          <button
            aria-selected={activePane === pane}
            className={activePane === pane ? 'active' : ''}
            id={`${pane}-tab`}
            key={pane}
            onClick={() => setActivePane(pane)}
            role='tab'
            type='button'
          >{label}{count === undefined ? '' : ` (${count})`}</button>
        ))}
        <div className='previewButton'><Button
          icon={isMaximized ? 'compress' : 'search-plus'}
          onClick={() => setIsMaximized((value) => !value)}
        /></div>
      </div>
      <div
        aria-labelledby={`${activePane}-tab`}
        className='readerColumns'
        role='tabpanel'
      >
        {(activePane === 'pdfText' || activePane === 'textConcepts') && <div className='pageNavigation'>
          <Button
            icon='arrow-left'
            isDisabled={pageNumber <= 1}
            onClick={() => goToPage(pageNumber - 1)}
          />
          <label>Page <input
            max={totalPages || 1}
            min={1}
            onBlur={submitPageInput}
            onChange={({ target }) => setPageInput(target.value)}
            onKeyDown={({ key }) => key === 'Enter' && submitPageInput()}
            type='number'
            value={pageInput}
                      /><span>of {totalPages || '…'}</span></label>
          <Button
            icon='arrow-right'
            isDisabled={!totalPages || pageNumber >= totalPages}
            onClick={() => goToPage(pageNumber + 1)}
          />
          <input
            aria-label='Navigate pages'
            className='pageScroller'
            disabled={!totalPages}
            max={totalPages || 1}
            min={1}
            onChange={({ target }) => goToPage(Number(target.value))}
            type='range'
            value={pageNumber}
          />
        </div>}
        {activePane === 'conceptExercises' && <div className='chapterNavigation'>
          <Button
            icon='arrow-left'
            isDisabled={exerciseChapterIndex <= 0}
            onClick={() => changeExerciseChapter(exerciseChapterIndex - 1)}
          />
          <label>Chapter <select
            aria-label='Navigate chapters'
            disabled={!exerciseChapters.length}
            onChange={({ target }) => changeExerciseChapter(Number(target.value))}
            value={exerciseChapters.length ? exerciseChapterIndex : ''}
                         >
            {exerciseChapters.map(({ title }, index) => <option
              key={`${title}:${index}`}
              value={index}
                                                        >{title || 'Chapter not identified'}</option>)}
          </select><span>{exerciseChapters.length ? `${exerciseChapterIndex + 1} of ${exerciseChapters.length}` : 'No chapters'}</span></label>
          <Button
            icon='arrow-right'
            isDisabled={!exerciseChapters.length || exerciseChapterIndex >= exerciseChapters.length - 1}
            onClick={() => changeExerciseChapter(exerciseChapterIndex + 1)}
          />
        </div>}
        {activePane === 'pdfText'
          ? <>
            <div
              className='pageArea'
              ref={pageAreaRef}
            >
              <canvas ref={canvasRef} />
            </div>
            <div
              className={`detailsArea${renderedPageHeight ? ' hasPageHeight' : ''}`}
              style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
            >
              {recognizedPane()}
            </div>
          </>
          : activePane === 'textConcepts'
            ? <>
              <div
                className={`detailsArea${renderedPageHeight ? ' hasPageHeight' : ''}`}
                style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
              >
                {recognizedPane()}
              </div>
              <div
                className='detailsArea'
                style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
              >
                {conceptsPane()}
              </div>
            </>
            : activePane === 'conceptExercises'
              ? <div className='detailsArea fullWidthDetails'>{exercisesPane()}</div>
              : activePane === 'conceptsSkills'
                ? <>
                  <div className='skillsArea'>
                    <Skills
                      book={book}
                      onAction={setActivePane}
                      onBookChange={onBookChange}
                      onEntityCountsChange={onSkillsEntityCountsChange}
                      showPipeline={false}
                      view='conceptsSkills'
                    />
                  </div>
                </>
                : activePane === 'preExercisesExercises'
                  ? <div className='skillsArea'><Skills
                      book={book}
                      onAction={setActivePane}
                      onBookChange={onBookChange}
                      onEntityCountsChange={onSkillsEntityCountsChange}
                      showPipeline={false}
                      view='preExercisesExercises'
                                                /></div>
                  : <SkillsCourse book={book} />}
      </div>
    </StyledReader>
  );
}

const StyledReader = styled.div`
  position: relative;
  &.isMaximized {
    background: var(--bg-page);
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    height: 100vh;
    height: 100dvh;
    inset: 0;
    overflow: hidden;
    padding: 1rem;
    position: fixed;
    width: 100vw;
    z-index: 1000;
  }

  &.isMaximized .readerColumns {
    flex: 1;
    height: auto;
    min-height: 0;
  }

  &.isMaximized .detailsArea, &.isMaximized .pageArea, &.isMaximized .skillsArea {
    height: 100%;
    min-height: 0;
  }

  .pageNavigation {
    align-items: center;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: auto auto auto minmax(10rem, 1fr) auto;
    margin-bottom: 1rem;
    grid-column: 1 / -1;
  }

  .chapterNavigation {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    grid-column: 1 / -1;
    margin-bottom: 1rem;
  }

  .chapterNavigation label {
    align-items: center;
    display: flex;
    flex: 1;
    gap: 0.5rem;
    min-width: 0;
  }

  .chapterNavigation select {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    flex: 1;
    min-width: 0;
    padding: 0.55rem;
  }

  .chapterNavigation span {
    white-space: nowrap;
  }

  .processingOverlay { align-items: center; background: color-mix(in srgb, var(--bg-page) 92%, transparent); display: flex; flex-direction: column; gap: 0.75rem; inset: 0; justify-content: center; position: fixed; z-index: 1000; }

  .pageNavigation label {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .pageNavigation input[type='number'] {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    padding: 0.55rem;
    width: 5rem;
  }

  .pageScroller {
    cursor: pointer;
    min-width: 0;
    width: 100%;
  }

  .readerColumns {
    align-items: stretch;
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 1fr);
  }

  .detailsArea {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.5rem;
    box-sizing: border-box;
    height: var(--page-height, auto);
    min-width: 0;
    overflow: hidden;
  }

  .fullWidthDetails {
    grid-column: 1 / -1;
  }

  .pageArea {
    box-sizing: border-box;
    min-width: 0;
    overflow: auto;
    text-align: center;
  }

  .skillsArea {
    grid-column: 1 / -1;
    height: var(--page-height, auto);
    min-width: 0;
    overflow: auto;
  }

  .pageArea canvas {
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    display: inline-block;
    height: auto;
    max-width: 100%;
  }

  .previewButton {
    align-items: center;
    display: flex;
    justify-content: flex-end;
  }

  .previewButton .ui--Button {
    margin: 0;
  }

  .detailsArea {
    display: flex;
    flex-direction: column;
  }

  .readerTabs {
    align-items: center;
    border-bottom: 1px solid #dde1eb;
    display: flex;
  }

  .readerTabs .previewButton {
    margin-left: auto;
    padding: 0 0.5rem;
  }

  .readerTabs button {
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #8b8b8b;
    cursor: pointer;
    font: inherit;
    padding: 0.9rem 1.25rem;
  }

  .readerTabs button.active {
    border-bottom-color: var(--color-text);
    color: var(--color-text);
    font-weight: 600;
  }

  .tabPanel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 1rem;
  }

  .detailsHeader {
    align-items: center;
    display: flex;
    justify-content: space-between;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  .generationControls, .recognitionControls {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }

  .generationControls .modelSelect {
    min-width: 11rem;
  }

  .conceptsOutput {
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    box-sizing: border-box;
    color: var(--color-text);
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 1rem;
    width: 100%;
  }

  .conceptsOutput h3 {
    margin-top: 0;
  }

  .conceptsOutput li + li {
    margin-top: 1rem;
  }

  .conceptsOutput p {
    margin: 0.25rem 0 0;
  }

  .conceptsOutput .exerciseImage {
    border: 1px solid var(--border-table);
    border-radius: 0.35rem;
    display: block;
    margin-top: 0.5rem;
    max-height: 18rem;
    max-width: min(100%, 32rem);
    object-fit: contain;
  }

  .recognizedOutput {
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    box-sizing: border-box;
    color: var(--color-text);
    flex: none;
    height: 31rem;
    margin: 0;
    min-height: 0;
    overflow-x: auto;
    overflow-y: auto;
    padding: 1rem;
    word-break: break-word;
  }

  .detailsArea.hasPageHeight .recognizedOutput {
    flex: 1;
    height: auto;
  }

  &.isMaximized .recognizedOutput {
    flex: 1;
    height: auto;
  }

  .recognizedOutput img, .recognizedOutput svg {
    height: auto;
    max-width: 100%;
  }

  .emptyOutput, .recognitionHint {
    color: #777;
  }

  .recognitionHint {
    margin-top: 0;
  }

  .readerError {
    color: #9f3a38;
  }

  @media only screen and (max-width: 800px) {
    .pageNavigation {
      grid-template-columns: auto 1fr auto auto;
    }

    .pageScroller {
      grid-column: 1 / 4;
    }

    .readerColumns {
      grid-template-columns: 1fr;
      height: auto;
    }

    .detailsArea {
      height: auto;
    }

    .pageArea {
      height: auto;
    }

    .conceptsOutput {
      min-height: 20rem;
    }

    .recognizedOutput {
      height: 19rem;
    }

    &.isMaximized .recognizedOutput {
      height: auto;
      min-height: 20rem;
    }
  }
`;

export default React.memo(BookReader);
