// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, Exercise } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, putBook, putBookPage, replaceParsedBookPageContent, SettingKey, storeSetting, updateBookProcessingStage } from '@slonigiraf/db';
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
import { detectBookLanguage } from './bookLanguage.js';
import { exerciseAbilityModes, processExtractedPageContent } from './bookProcessing.js';
import { OPENAI_MODELS } from './constants.js';
import Skills from './Skills.js';
import SkillsCourse from './SkillsCourse.js';

export { OPENAI_MODELS } from './constants.js';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

const CONCEPTS_PROMPT = `On the provided page, identify the chapter and subchapter/section.

Extract only the concepts that are intentionally introduced or explained as new on this page. Do not include concepts that the page assumes the reader already knows, merely reviews, references from earlier sections, or uses only in exercises/examples without introducing them. Also extract every exercise, question, or problem the learner is asked to solve. Classify the primary ability trained by each exercise as exactly one of: "perceptual observation", "perceptual discrimination", "transformation", "reasoning", or "generation".

Return only valid JSON in this exact shape, keeping the original language of the input:
{"chapter":"Chapter and section name","concepts":[{"title":"New concept","description":"Explanation or example from the page"}],"exercises":[{"title":"Exercise title","description":"Complete exercise question or instructions","abilityMode":"reasoning","solution":"Complete step-by-step solution"}]}

Use an empty string when the chapter is not shown. Use empty arrays when no concepts or exercises are present. The exercise description must contain the entire exercise statement, all data, and every instruction required to solve it; never abbreviate it or refer to an omitted source. If the book page provides a solution, extract its complete method and answer faithfully. Otherwise, solve the exercise and generate a correct, explicit step-by-step solution in the book's language. Never leave solution empty. Use <kx>...</kx> for every mathematical formula or expression in descriptions and solutions, never dollar-delimited LaTeX. Escape every backslash in mathematical notation so the result remains valid JSON. Do not add markdown or any text outside the JSON.`;

interface GeneratedConcepts {
  chapter: string;
  concepts: Array<{ description: string; title: string }>;
  exercises?: Array<{ abilityMode: string; description: string; solution: string; title: string }>;
}

function parseGeneratedConcepts (content: string): GeneratedConcepts {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  let parsed: Partial<GeneratedConcepts>;

  try {
    parsed = JSON.parse(json) as Partial<GeneratedConcepts>;
  } catch {
    // Models occasionally return LaTeX commands with JSON-invalid single
    // backslashes (for example, "\\alpha" instead of "\\\\alpha").
    parsed = JSON.parse(json.replace(/\\(?!["\\/bfnrt]|u[0-9a-fA-F]{4})/g, '\\\\')) as Partial<GeneratedConcepts>;
  }

  if (typeof parsed.chapter !== 'string' || !Array.isArray(parsed.concepts) || parsed.concepts.some(({ description, title }) => typeof title !== 'string' || typeof description !== 'string') || (parsed.exercises !== undefined && (!Array.isArray(parsed.exercises) || parsed.exercises.some(({ abilityMode, description, solution, title }) => typeof title !== 'string' || typeof description !== 'string' || typeof solution !== 'string' || !solution.trim() || typeof abilityMode !== 'string' || !exerciseAbilityModes.includes(abilityMode as typeof exerciseAbilityModes[number]))))) {
    throw new Error('OpenRouter returned invalid concept data.');
  }

  return {
    chapter: parsed.chapter.trim(),
    concepts: parsed.concepts.map(({ description, title }) => ({ description: description.trim(), title: title.trim() })).filter(({ title }) => title),
    exercises: (parsed.exercises ?? []).map(({ abilityMode, description, solution, title }) => ({ abilityMode, description: description.trim(), solution: solution.trim(), title: title.trim() })).filter(({ title }) => title)
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

async function validateExtractedContent (client: OpenAI, model: string, generated: GeneratedConcepts): Promise<GeneratedConcepts> {
  let lastError: unknown;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const response = await client.chat.completions.create({
        messages: [{
          content: `Act as an independent strict validator for extracted book content. Check that the chapter is accurate when present; concepts are faithfully extracted without requiring them to be atomic; every book exercise contains its complete task; abilityMode is one of the supplied supported modes and accurately describes the primary trained ability; every exercise has a correct, explicit step-by-step solution; the book language is preserved; and every mathematical expression uses <kx>...</kx>. Do not split concepts or exercises. Fix every error and return only the complete corrected JSON object in the original shape, without commentary.\n\nSupported ability modes: ${exerciseAbilityModes.join(', ')}\n\nCandidate:\n${JSON.stringify(generated)}`,
          role: 'user'
        }],
        model,
        response_format: { type: 'json_object' }
      });

      return parseGeneratedConcepts(response.choices[0].message?.content?.trim() ?? '');
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Extracted concepts and exercises failed AI validation twice.');
}

const MAX_REQUESTS_PER_MIN = 180;
const RATE_LIMIT_WINDOW_MS = 60_000;
const GENERATION_PAGE_SPAWN_INTERVAL_MS = Math.ceil(RATE_LIMIT_WINDOW_MS / (MAX_REQUESTS_PER_MIN / 4));
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
  images: Array<{ image_url: { url: string }; type: 'image_url' }>;
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
        type: 'image_url'
      });
    } else if (['html', 'json', 'md', 'mmd', 'tex', 'txt'].includes(extension)) {
      textEntries.push(`--- ${name} ---\n${strFromU8(bytes)}`);
    }
  });

  if (!textEntries.length) {
    throw new Error('The MMD ZIP contains no readable text.');
  }

  return { images, text: textEntries.join('\n\n') };
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
  pendingProcessingAction?: 'concepts' | 'recognize' | 'refine';
  processingToolbar: React.ReactNode;
  refineAllContentRequest: number;
  recognizeAllRequest: number;
}

type ReaderPane = 'conceptExercises' | 'conceptsSkills' | 'pdfText' | 'preExercisesExercises' | 'skillsCourse' | 'skillsPreExercises' | 'textConcepts';
type RecognitionTarget = 'all' | 'page';

const readerPaneSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-pane`;

function getSessionReaderPane (bookId: number): ReaderPane {
  try {
    const value = sessionStorage.getItem(readerPaneSessionKey(bookId));

    return value === 'pdfText' || value === 'textConcepts' || value === 'conceptExercises' || value === 'preExercisesExercises' || value === 'skillsCourse' ? value : 'pdfText';
  } catch {
    return 'pdfText';
  }
}

function BookReader ({ book, file, generateAllConceptsModel, generateAllConceptsRequest, onBookChange, onProcessingComplete, pendingProcessingAction, processingToolbar, recognizeAllRequest, refineAllContentRequest }: Props): React.ReactElement {
  const [activePane, setActivePane] = useState<ReaderPane>(() => getSessionReaderPane(book.id));
  const [concepts, setConcepts] = useState<BookConcept[]>([]);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [error, setError] = useState('');
  const [generatedConceptsPageCount, setGeneratedConceptsPageCount] = useState(0);
  const [isGeneratingAllConcepts, setIsGeneratingAllConcepts] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMathpixKeyPromptOpen, setIsMathpixKeyPromptOpen] = useState(false);
  const [isPageGenerationConfirmationOpen, setIsPageGenerationConfirmationOpen] = useState(false);
  const [isRefiningAllContent, setIsRefiningAllContent] = useState(false);
  const [isRecognizingAll, setIsRecognizingAll] = useState(false);
  const [mathpixApiKey, setMathpixApiKey] = useState('');
  const [recognizedPageCount, setRecognizedPageCount] = useState(0);
  const [refinedPageCount, setRefinedPageCount] = useState(0);
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
  const handledRefineAllContentRequestRef = useRef(refineAllContentRequest);
  const handledRecognizeAllRequestRef = useRef(recognizeAllRequest);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const pageGenerationEstimate = useMemo(() => {
    const pageText = pages.get(pageNumber)?.pageMMD ?? '';
    const validationInput = pageText.slice(0, Math.ceil(pageText.length / 3));

    return formatAiInputEstimate(estimateAiInput(selectedModel, [pageText.padEnd(pageText.length + 2_000), validationInput.padEnd(validationInput.length + 2_000)], 4_800));
  }, [pageNumber, pages, selectedModel]);

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
    } else if (pendingProcessingAction === 'concepts' || pendingProcessingAction === 'refine') {
      setActivePane('textConcepts');
    }
  }, [pendingProcessingAction]);
  const advanceStage = useCallback(async (processingStage: number): Promise<void> => {
    if ((book.processingStage ?? 0) >= processingStage) {
      return;
    }

    const updatedBook = await updateBookProcessingStage(book.id, processingStage);

    if (updatedBook) {
      onBookChange(updatedBook);
    }
  }, [book.id, book.processingStage, onBookChange]);

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

      if (hasEveryPage && storedPages.every(({ conceptsProcessed }) => conceptsProcessed)) {
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

    Promise.all([
      getBookConceptsForBookPage(book.id, pageNumber),
      getExercisesForBookPage([book.id, pageNumber])
    ])
      .then(([storedConcepts, storedExercises]) => {
        if (active) {
          setConcepts(storedConcepts);
          setExercises(storedExercises);
        }
      })
      .catch(() => active && setError('Unable to load concepts and exercises.'));

    return () => {
      active = false;
    };
  }, [book.id, pageNumber]);

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
    const pageMMDZip = pages.get(pageNumber)?.pageMMDZip;

    if (!pageMMDZip || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll) {
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
      const mmdZipInput = await extractMMDZipInput(pageMMDZip);
      const response = await client.chat.completions.create({
        messages: [{
          content: [
            {
              text: `${CONCEPTS_PROMPT}\n\nThe following text and images were extracted from the Mathpix MMD ZIP:\n\n${mmdZipInput.text}`,
              type: 'text'
            },
            ...mmdZipInput.images
          ],
          role: 'user'
        }],
        model: selectedModel,
        response_format: { type: 'json_object' }
      });
      const generatedContent = response.choices[0].message?.content?.trim();

      if (!generatedContent) {
        throw new Error('OpenRouter returned no concepts.');
      }

      const generatedConcepts = await validateExtractedContent(client, selectedModel, parseGeneratedConcepts(generatedContent));

      const resolvedChapter = resolveChapterTitle(generatedConcepts.chapter, pageNumber, pages);
      const generatedPage: BookPage = {
        ...pages.get(pageNumber),
        bookId: book.id,
        chapter: resolvedChapter,
        conceptsProcessed: true,
        pageNumber
      };

      const stored = await replaceParsedBookPageContent(book.id, pageNumber, resolvedChapter, generatedConcepts.concepts, generatedConcepts.exercises ?? []);

      await putBookPage(generatedPage);
      const updatedPages = new Map(pages).set(pageNumber, generatedPage);

      setPages(updatedPages);
      setConcepts(stored.concepts);
      setExercises(stored.exercises);

      if (totalPages && Array.from({ length: totalPages }, (_, index) => updatedPages.get(index + 1)).every((page) => page?.conceptsProcessed)) {
        await advanceStage(2);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [advanceStage, book.id, isGeneratingAllConcepts, isRecognizingAll, pageNumber, pages, processingPage, selectedModel, totalPages]);
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
    const conceptTasks: Array<Promise<void>> = [];
    const eligiblePages = Array.from({ length: totalPages }, (_, index) => index + 1)
      .filter((currentPageNumber) => pages.get(currentPageNumber)?.pageMMDZip);
    const resolvedPages = new Map(pages);
    let persistenceQueue: Promise<void> = Promise.resolve();

    try {
      for (const [index, currentPageNumber] of eligiblePages.entries()) {
        if (index > 0) {
          await delay(GENERATION_PAGE_SPAWN_INTERVAL_MS);
        }

        const generationTask = (async () => {
          const storedPage = pages.get(currentPageNumber);
          const pageMMDZip = storedPage?.pageMMDZip;

          if (!pageMMDZip) {
            throw new Error('Page has not been recognized.');
          }

          const mmdZipInput = await extractMMDZipInput(pageMMDZip);
          const response = await client.chat.completions.create({
            messages: [{
              content: [
                {
                  text: `${CONCEPTS_PROMPT}\n\nThe following text and images were extracted from the Mathpix MMD ZIP:\n\n${mmdZipInput.text}`,
                  type: 'text'
                },
                ...mmdZipInput.images
              ],
              role: 'user'
            }],
            model: generateAllConceptsModel,
            response_format: { type: 'json_object' }
          });
          const generatedContent = response.choices[0].message?.content?.trim();

          if (!generatedContent) {
            throw new Error('OpenRouter returned no concepts.');
          }

          return {
            generatedConcepts: await validateExtractedContent(client, generateAllConceptsModel, parseGeneratedConcepts(generatedContent)),
            storedPage
          };
        })();
        const persistenceTask = persistenceQueue.then(async () => {
          const { generatedConcepts, storedPage } = await generationTask;

          const resolvedChapter = resolveChapterTitle(generatedConcepts.chapter, currentPageNumber, resolvedPages);
          const generatedPage: BookPage = {
            ...storedPage,
            bookId: book.id,
            chapter: resolvedChapter,
            conceptsProcessed: true,
            pageNumber: currentPageNumber
          };

          const stored = await replaceParsedBookPageContent(book.id, currentPageNumber, resolvedChapter, generatedConcepts.concepts, generatedConcepts.exercises ?? []);

          await putBookPage(generatedPage);
          resolvedPages.set(currentPageNumber, generatedPage);
          setPages((current) => new Map(current).set(currentPageNumber, generatedPage));

          if (currentPageNumber === pageNumber) {
            setConcepts(stored.concepts);
            setExercises(stored.exercises);
          }

          setGeneratedConceptsPageCount((count) => count + 1);
        });

        persistenceQueue = persistenceTask.catch(() => undefined);
        conceptTasks.push(persistenceTask);
      }

      const results = await Promise.allSettled(conceptTasks);
      const failedPages = totalPages - eligiblePages.length + results.filter(({ status }) => status === 'rejected').length;

      if (failedPages) {
        setError(`${failedPages} of ${totalPages} pages could not have concepts generated. Recognize missing pages first.`);
      } else {
        await advanceStage(2);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all pages.');
    } finally {
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();
    }
  }, [advanceStage, book.id, generateAllConceptsModel, isGeneratingAllConcepts, isRecognizingAll, onProcessingComplete, pageNumber, pages, processingPage, totalPages]);

  const refineAllContent = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isRefiningAllContent) {
      return;
    }

    setError('');
    setIsRefiningAllContent(true);
    setRefinedPageCount(0);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = new OpenAI({ apiKey: key, baseURL: 'https://openrouter.ai/api/v1', dangerouslyAllowBrowser: true, defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' } });
      const storedPages = (await getBookPages(book.id)).filter(({ conceptsProcessed }) => conceptsProcessed);
      const pageInputs = await Promise.all(storedPages.map(async ({ pageNumber }) => ({
        concepts: await getBookConceptsForBookPage(book.id, pageNumber),
        exercises: await getExercisesForBookPage([book.id, pageNumber]),
        pageNumber
      })));

      for (const { concepts: storedConcepts, exercises: storedExercises, pageNumber: currentPageNumber } of pageInputs) {
        const storedPage = pages.get(currentPageNumber) ?? storedPages.find(({ pageNumber }) => pageNumber === currentPageNumber);

        if (!storedPage) {
          continue;
        }

        const processed = await processExtractedPageContent({
          chapter: storedPage.chapter,
          concepts: storedConcepts.map(({ description, title }) => ({ description, title })),
          exercises: storedExercises.map(({ abilityMode = 'reasoning', description, solution = '', title }) => ({ abilityMode, description, solution, title }))
        }, async (prompt) => {
          const response = await client.chat.completions.create({
            messages: [{ content: prompt, role: 'user' }],
            model: generateAllConceptsModel,
            response_format: { type: 'json_object' }
          });

          return response.choices[0].message?.content?.trim() ?? '{}';
        });
        const stored = await replaceParsedBookPageContent(book.id, currentPageNumber, processed.chapter, processed.concepts, processed.exercises);

        if (currentPageNumber === pageNumber) {
          setConcepts(stored.concepts);
          setExercises(stored.exercises);
        }

        setRefinedPageCount((count) => count + 1);
      }

      await advanceStage(3);
      setActivePane('conceptExercises');
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Unable to refine concepts and generate exercises.');
    } finally {
      setIsRefiningAllContent(false);
      onProcessingComplete();
    }
  }, [advanceStage, book.id, generateAllConceptsModel, isGeneratingAllConcepts, isRecognizingAll, isRefiningAllContent, onProcessingComplete, pageNumber, pages, processingPage, totalPages]);

  const detectAndStoreBookLanguage = useCallback(async (recognizedPages: Map<number, BookPage>): Promise<void> => {
    const requiredPageCount = Math.min(2, totalPages);
    const pageTexts = Array.from({ length: requiredPageCount }, (_, index) => recognizedPages.get(index + 1)?.pageMMD).filter((text): text is string => !!text);

    if (!requiredPageCount || pageTexts.length !== requiredPageCount) {
      return;
    }

    const updatedBook = { ...book, language: detectBookLanguage(pageTexts) };

    await putBook(updatedBook);
    onBookChange(updatedBook);
  }, [book, onBookChange, totalPages]);

  useEffect((): void => {
    if (!book.language) {
      detectAndStoreBookLanguage(pages).catch((languageError) => {
        setError(languageError instanceof Error ? languageError.message : 'Unable to determine the book language.');
      });
    }
  }, [book.language, detectAndStoreBookLanguage, pages]);

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
      await detectAndStoreBookLanguage(updatedPages);

      if (totalPages && Array.from({ length: totalPages }, (_, index) => updatedPages.get(index + 1)).every((page) => !!page?.pageMMD)) {
        await advanceStage(1);
      }
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this page.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [advanceStage, book.id, detectAndStoreBookLanguage, file, isGeneratingAllConcepts, isRecognizingAll, pageNumber, pages, processingPage, totalPages]);

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
    const recognizedPages = new Map(pages);

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
          recognizedPages.set(currentPageNumber, recognizedPage);
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

      await detectAndStoreBookLanguage(recognizedPages);
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
    } finally {
      setIsRecognizingAll(false);
      onProcessingComplete();
    }
  }, [advanceStage, book.id, detectAndStoreBookLanguage, file, isGeneratingAllConcepts, isRecognizingAll, onProcessingComplete, pages, processingPage, totalPages]);

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
      refineAllContentRequest === handledRefineAllContentRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isRefiningAllContent
    ) {
      return;
    }

    handledRefineAllContentRequestRef.current = refineAllContentRequest;
    setActivePane('textConcepts');
    refineAllContent().catch((processingError) => {
      setError(processingError instanceof Error ? processingError.message : 'Unable to refine concepts and generate exercises.');
      onProcessingComplete();
    });
  }, [isGeneratingAllConcepts, isRecognizingAll, isRefiningAllContent, onProcessingComplete, processingPage, refineAllContent, refineAllContentRequest, totalPages]);

  useEffect((): void => {
    if (
      generateAllConceptsRequest === handledGenerateAllConceptsRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isRefiningAllContent
    ) {
      return;
    }

    handledGenerateAllConceptsRequestRef.current = generateAllConceptsRequest;
    setActivePane('textConcepts');
    generateAllConcepts().catch((generationError) => {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all pages.');
      onProcessingComplete();
    });
  }, [generateAllConcepts, generateAllConceptsRequest, isGeneratingAllConcepts, isRecognizingAll, isRefiningAllContent, onProcessingComplete, processingPage, totalPages]);

  useEffect((): void => {
    if (
      recognizeAllRequest === handledRecognizeAllRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isRefiningAllContent
    ) {
      return;
    }

    handledRecognizeAllRequestRef.current = recognizeAllRequest;
    setActivePane('pdfText');
    recognizeAllPages().catch((recognitionError) => {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
      onProcessingComplete();
    });
  }, [isGeneratingAllConcepts, isRecognizingAll, isRefiningAllContent, onProcessingComplete, processingPage, recognizeAllPages, recognizeAllRequest, totalPages]);

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
          : processingPage === pageNumber ? 'Recognizing page…' : 'Mathpix MMD'}</span>
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
    : isRefiningAllContent
      ? `Refining concepts and exercises… ${refinedPageCount}/${totalPages}`
      : processingPage === pageNumber
        ? 'Generating, splitting, and saving concepts and exercises…'
        : 'Concepts and exercises';
  const conceptsPane = (): React.ReactNode => (
    <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'>
        <span>{conceptsStatus}</span>
      </div>
      {!pages.get(pageNumber)?.pageMMDZip && <p className='recognitionHint'>Recognize this page before generating concepts.</p>}
      <div className='conceptsOutput'>
        <h3>{pages.get(pageNumber)?.chapter || 'Chapter not identified'}</h3>
        {concepts.length
          ? <ul>{concepts.map((concept) => <li key={concept.id}>
            <strong><KatexSpan content={concept.title} /></strong>
            {concept.description && <p><KatexSpan content={concept.description} /></p>}
          </li>)}</ul>
          : <p className='emptyOutput'>No concepts have been generated for this page.</p>}
      </div>
    </div>
  );
  const exerciseItem = (exercise: Exercise): React.ReactNode => <li key={exercise.id}>
    <strong><KatexSpan content={exercise.title} /></strong>
    {exercise.description && <p><KatexSpan content={exercise.description} /></p>}
    {exercise.abilityMode && <p><small>{exercise.abilityMode}</small></p>}
    {exercise.solution && <p><KatexSpan content={exercise.solution} /></p>}
  </li>;

  const exercisesPane = (): React.ReactNode => {
    const conceptIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));
    const generatedWithoutConcept = exercises.filter(({ conceptId, source }) => source === 'generated' && (conceptId === undefined || !conceptIds.has(conceptId)));
    const bookExercises = exercises.filter(({ source }) => source !== 'generated');

    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'><span>Exercises grouped by concept</span></div>
      <div className='conceptsOutput'>
        <h3>{pages.get(pageNumber)?.chapter || 'Chapter not identified'}</h3>
        {concepts.map((concept) => {
          const generated = exercises.filter(({ conceptId, source }) => source === 'generated' && concept.id !== undefined && conceptId === concept.id);

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
          {bookExercises.length ? <ul>{bookExercises.map(exerciseItem)}</ul> : <p className='emptyOutput'>No exercises were copied from this book page.</p>}
        </section>
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
          <p>This extracts concepts and exercises explicitly present on the page. Refinement and generated exercises run in the next pipeline step.</p>
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
      {(pendingProcessingAction || processingPage !== undefined || isRecognizingAll || isGeneratingAllConcepts || isRefiningAllContent) && <div className='processingOverlay'>
        <RoundProgress
          total={processingPage !== undefined ? 1 : Math.max(1, totalPages)}
          value={processingPage !== undefined ? 0 : isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isRefiningAllContent || pendingProcessingAction === 'refine' ? refinedPageCount : generatedConceptsPageCount}
        />
        <strong>{processingPage !== undefined ? `Processing page ${processingPage}` : isRecognizingAll || pendingProcessingAction === 'recognize' ? 'Recognizing MMD pages' : isRefiningAllContent || pendingProcessingAction === 'refine' ? 'Refining concepts and generating exercises' : 'Extracting concepts and book exercises'}</strong>
        {processingPage === undefined && <span>{isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isRefiningAllContent || pendingProcessingAction === 'refine' ? refinedPageCount : generatedConceptsPageCount} / {totalPages}</span>}
      </div>}
      <Skills
        book={book}
        onAction={setActivePane}
        onBookChange={onBookChange}
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
          ['pdfText', 'Text', 1],
          ['textConcepts', 'Concepts', 2],
          ['conceptExercises', 'Exercises', 3],
          ['preExercisesExercises', 'Abilities', 7],
          ['skillsCourse', 'Course', 7]
        ] as Array<[ReaderPane, string, number]>).filter(([, , requiredStage]) => (book.processingStage ?? 0) >= requiredStage).map(([pane, label]) => (
          <button
            aria-selected={activePane === pane}
            className={activePane === pane ? 'active' : ''}
            id={`${pane}-tab`}
            key={pane}
            onClick={() => setActivePane(pane)}
            role='tab'
            type='button'
          >{label}</button>
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
        {(activePane === 'pdfText' || activePane === 'textConcepts' || activePane === 'conceptExercises') && <div className='pageNavigation'>
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
                      showPipeline={false}
                      view='conceptsSkills'
                    />
                  </div>
                </>
                : activePane === 'skillsPreExercises'
                  ? <div className='skillsArea'><Skills
                    book={book}
                    onAction={setActivePane}
                    onBookChange={onBookChange}
                    showPipeline={false}
                    view='skillsPreExercises'
                                                /></div>
                  : activePane === 'preExercisesExercises'
                    ? <div className='skillsArea'><Skills
                      book={book}
                      onAction={setActivePane}
                      onBookChange={onBookChange}
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
