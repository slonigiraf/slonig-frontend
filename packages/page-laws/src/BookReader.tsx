// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookExercise, BookPage, Concept } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { getBookExercisesForBookPage, getBookPages, getConceptsForBookPage, getSetting, putBookPage, replaceConceptsForBookPage, replaceParsedBookPageContent, SettingKey, storeSetting } from '@slonigiraf/db';
import { strFromU8, unzipSync } from 'fflate';
import FileSaver from 'file-saver';
import MathpixLoader from 'mathpix-markdown-it/lib/components/mathpix-loader/index.js';
import MathpixMarkdown from 'mathpix-markdown-it/lib/components/mathpix-markdown/index.js';
import OpenAI from 'openai';
import * as PDFDocumentModule from 'pdf-lib/cjs/api/PDFDocument.js';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import { OPENAI_MODELS } from './constants.js';
import Skills from './Skills.js';

export { OPENAI_MODELS } from './constants.js';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

const CONCEPTS_PROMPT = `On the provided page, identify the chapter and subchapter/section.

Extract only the concepts that are intentionally introduced or explained as new on this page. Do not include concepts that the page assumes the reader already knows, merely reviews, references from earlier sections, or uses only in exercises/examples without introducing them. Also extract every exercise, question, or problem the learner is asked to solve.

Return only valid JSON in this exact shape, keeping the original language of the input:
{"chapter":"Chapter and section name","concepts":[{"title":"New concept","description":"Explanation or example from the page"}],"exercises":[{"title":"Exercise title","description":"Complete exercise question or instructions"}]}

Use an empty string when the chapter is not shown. Use empty arrays when no concepts or exercises are present. Escape every backslash in mathematical notation so the result remains valid JSON. Do not add markdown or any text outside the JSON.`;

const SPLIT_CONCEPTS_PROMPT = `Review the identified concepts below and divide every concept that contains two or more independently learnable ideas into the smallest useful, self-contained concepts. Split named terms into individual concepts whenever they can be learned independently, even when they are introduced together in a single sentence or title. For example, a concept defining plankton and nekton becomes one concept for plankton and one for nekton; a concept describing the littoral and its supralittoral, littoral, and sublittoral subdivisions becomes four concepts. Keep a concept unchanged only when it is already atomic. Do not remove concepts or invent information that is not supported by the supplied concepts. Preserve the input language.

Return only valid JSON in this exact shape:
{"chapter":"Chapter and section name","concepts":[{"title":"Concept title","description":"Explanation or example"}]}

Use the supplied chapter unchanged. The concepts array must contain the resulting concepts in a logical learning order. Escape every backslash in mathematical notation so the result remains valid JSON. Do not add markdown or any text outside the JSON.`;

interface GeneratedConcepts {
  chapter: string;
  concepts: Array<{ description: string; title: string }>;
  exercises?: Array<{ description: string; title: string }>;
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

  if (typeof parsed.chapter !== 'string' || !Array.isArray(parsed.concepts) || parsed.concepts.some(({ description, title }) => typeof title !== 'string' || typeof description !== 'string') || (parsed.exercises !== undefined && (!Array.isArray(parsed.exercises) || parsed.exercises.some(({ description, title }) => typeof title !== 'string' || typeof description !== 'string')))) {
    throw new Error('OpenRouter returned invalid concept data.');
  }

  return {
    chapter: parsed.chapter.trim(),
    concepts: parsed.concepts.map(({ description, title }) => ({ description: description.trim(), title: title.trim() })).filter(({ title }) => title),
    exercises: (parsed.exercises ?? []).map(({ description, title }) => ({ description: description.trim(), title: title.trim() })).filter(({ title }) => title)
  };
}

const MAX_PAGES_PER_MIN = 180;
const RATE_LIMIT_WINDOW_MS = 60_000;
const PAGE_SPAWN_INTERVAL_MS = Math.ceil(RATE_LIMIT_WINDOW_MS / MAX_PAGES_PER_MIN);

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
  recognizeAllRequest: number;
}

type ReaderPane = 'pdfText' | 'textConcepts' | 'conceptsSkills';
type RecognitionTarget = 'all' | 'page';

function BookReader ({ book, file, generateAllConceptsModel, generateAllConceptsRequest, recognizeAllRequest }: Props): React.ReactElement {
  const [activePane, setActivePane] = useState<ReaderPane>('pdfText');
  const [concepts, setConcepts] = useState<Concept[]>([]);
  const [exercises, setExercises] = useState<BookExercise[]>([]);
  const [error, setError] = useState('');
  const [generatedConceptsPageCount, setGeneratedConceptsPageCount] = useState(0);
  const [isGeneratingAllConcepts, setIsGeneratingAllConcepts] = useState(false);
  const [isSplittingConcepts, setIsSplittingConcepts] = useState(false);
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMathpixKeyPromptOpen, setIsMathpixKeyPromptOpen] = useState(false);
  const [isRecognizingAll, setIsRecognizingAll] = useState(false);
  const [mathpixApiKey, setMathpixApiKey] = useState('');
  const [recognizedPageCount, setRecognizedPageCount] = useState(0);
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
  const handledRecognizeAllRequestRef = useRef(recognizeAllRequest);
  const pageAreaRef = useRef<HTMLDivElement>(null);

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
      const restoredPage = Math.min(document.numPages, getSessionPage(book.id));

      setPageNumber(restoredPage);
      setPageInput(String(restoredPage));
    };

    load().catch(() => active && setError('Unable to open this PDF.'));

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [book.id, file]);

  useEffect(() => {
    let active = true;

    Promise.all([
      getConceptsForBookPage(book.id, pageNumber),
      getBookExercisesForBookPage([pageNumber])
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

    if (!pageMMDZip || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts) {
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

      const generatedConcepts = parseGeneratedConcepts(generatedContent);

      const generatedPage: BookPage = {
        ...pages.get(pageNumber),
        bookId: book.id,
        chapter: generatedConcepts.chapter,
        conceptsProcessed: true,
        pageNumber
      };

      const stored = await replaceParsedBookPageContent(book.id, pageNumber, generatedConcepts.chapter, generatedConcepts.concepts, generatedConcepts.exercises ?? []);

      await putBookPage(generatedPage);
      setPages((current) => new Map(current).set(pageNumber, generatedPage));
      setConcepts(stored.concepts);
      setExercises(stored.exercises);
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [book.id, isGeneratingAllConcepts, isRecognizingAll, isSplittingConcepts, pageNumber, pages, processingPage, selectedModel]);

  const generateAllConcepts = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts) {
      return;
    }

    setError('');

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      setError('No OpenRouter token found. Add it in Settings.');

      return;
    }

    setIsGeneratingAllConcepts(true);
    setGeneratedConceptsPageCount(0);

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

    try {
      for (const [index, currentPageNumber] of eligiblePages.entries()) {
        if (index > 0) {
          await delay(PAGE_SPAWN_INTERVAL_MS);
        }

        conceptTasks.push((async () => {
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

          const generatedConcepts = parseGeneratedConcepts(generatedContent);

          const generatedPage: BookPage = {
            ...storedPage,
            bookId: book.id,
            chapter: generatedConcepts.chapter,
            conceptsProcessed: true,
            pageNumber: currentPageNumber
          };

          const stored = await replaceParsedBookPageContent(book.id, currentPageNumber, generatedConcepts.chapter, generatedConcepts.concepts, generatedConcepts.exercises ?? []);

          await putBookPage(generatedPage);
          setPages((current) => new Map(current).set(currentPageNumber, generatedPage));

          if (currentPageNumber === pageNumber) {
            setConcepts(stored.concepts);
            setExercises(stored.exercises);
          }

          setGeneratedConceptsPageCount((count) => count + 1);
        })());
      }

      const results = await Promise.allSettled(conceptTasks);
      const failedPages = totalPages - eligiblePages.length + results.filter(({ status }) => status === 'rejected').length;

      if (failedPages) {
        setError(`${failedPages} of ${totalPages} pages could not have concepts generated. Recognize missing pages first.`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all pages.');
    } finally {
      setIsGeneratingAllConcepts(false);
    }
  }, [book.id, generateAllConceptsModel, isGeneratingAllConcepts, isRecognizingAll, isSplittingConcepts, pageNumber, pages, processingPage, totalPages]);

  const splitConcepts = useCallback(async (): Promise<void> => {
    if (!concepts.length || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts) {
      return;
    }

    setError('');
    setIsSplittingConcepts(true);

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
      const response = await client.chat.completions.create({
        messages: [{
          content: `${SPLIT_CONCEPTS_PROMPT}\n\nChapter:\n${pages.get(pageNumber)?.chapter ?? ''}\n\nIdentified concepts:\n${JSON.stringify(concepts.map(({ description, title }) => ({ description, title })))}\n`,
          role: 'user'
        }],
        model: selectedModel,
        response_format: { type: 'json_object' }
      });
      const generatedContent = response.choices[0].message?.content?.trim();

      if (!generatedContent) {
        throw new Error('OpenRouter returned no concepts.');
      }

      const splitConcepts = parseGeneratedConcepts(generatedContent);
      const chapterId = concepts[0]?.chapterId;
      const storedConcepts = await replaceConceptsForBookPage(book.id, pageNumber, splitConcepts.concepts.map((concept) => ({ ...concept, chapterId })));

      setConcepts(storedConcepts);
    } catch (splitError) {
      setError(splitError instanceof Error ? splitError.message : 'Unable to split concepts.');
    } finally {
      setIsSplittingConcepts(false);
    }
  }, [book.id, concepts, isGeneratingAllConcepts, isRecognizingAll, isSplittingConcepts, pageNumber, pages, processingPage, selectedModel]);

  const recognizePage = useCallback(async (): Promise<void> => {
    if (processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts) {
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
      setPages((current) => new Map(current).set(pageNumber, recognizedPage));
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this page.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [book.id, file, isGeneratingAllConcepts, isRecognizingAll, isSplittingConcepts, pageNumber, pages, processingPage]);

  const recognizeAllPages = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts) {
      return;
    }

    setError('');

    const apiKey = await getSetting(SettingKey.MATHPIX_API_KEY);

    if (!apiKey) {
      setMathpixApiKey('');
      setRecognitionTarget('all');
      setIsMathpixKeyPromptOpen(true);

      return;
    }

    setIsRecognizingAll(true);
    setRecognizedPageCount(0);

    const recognitionTasks: Array<Promise<void>> = [];

    try {
      for (let currentPageNumber = 1; currentPageNumber <= totalPages; currentPageNumber++) {
        if (currentPageNumber > 1) {
          await delay(PAGE_SPAWN_INTERVAL_MS);
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
      }
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
    } finally {
      setIsRecognizingAll(false);
    }
  }, [book.id, file, isGeneratingAllConcepts, isRecognizingAll, isSplittingConcepts, pages, processingPage, totalPages]);

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

  const downloadPageMMDZip = useCallback((): void => {
    const pageMMDZip = pages.get(pageNumber)?.pageMMDZip;

    if (!pageMMDZip) {
      return;
    }

    setError('');

    try {
      const bookName = book.name.replace(/\.pdf$/i, '');

      // eslint-disable-next-line deprecation/deprecation
      FileSaver.saveAs(pageMMDZip, `${bookName}-page-${pageNumber}-mathpix.zip`);
    } catch {
      setError('Unable to download the Mathpix ZIP.');
    }
  }, [book.name, pageNumber, pages]);

  useEffect((): void => {
    if (
      generateAllConceptsRequest === handledGenerateAllConceptsRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll
    ) {
      return;
    }

    handledGenerateAllConceptsRequestRef.current = generateAllConceptsRequest;
    generateAllConcepts().catch((generationError) => {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all pages.');
    });
  }, [generateAllConcepts, generateAllConceptsRequest, isGeneratingAllConcepts, isRecognizingAll, processingPage, totalPages]);

  useEffect((): void => {
    if (
      recognizeAllRequest === handledRecognizeAllRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll
    ) {
      return;
    }

    handledRecognizeAllRequestRef.current = recognizeAllRequest;
    recognizeAllPages().catch((recognitionError) => {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
    });
  }, [isGeneratingAllConcepts, isRecognizingAll, processingPage, recognizeAllPages, recognizeAllRequest, totalPages]);

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
        <div className='recognitionControls'>
          <Button
            icon='download'
            isDisabled={!pages.get(pageNumber)?.pageMMDZip}
            label='Download ZIP'
            onClick={downloadPageMMDZip}
          />
          <Button
            icon='camera'
            isDisabled={processingPage !== undefined || isRecognizingAll}
            label={pages.get(pageNumber)?.pageMMD ? 'Recognize again' : 'Recognize page'}
            onClick={recognizePage}
          />
        </div>
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

  const conceptsPane = (): React.ReactNode => (
    <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'>
        <span>{isGeneratingAllConcepts
          ? `Generating concepts for all pages… ${generatedConceptsPageCount}/${totalPages}`
          : isSplittingConcepts ? 'Splitting concepts…'
            : processingPage === pageNumber ? 'Generating concepts and exercises…' : 'Concepts and exercises'}</span>
        <div className='generationControls'>
          <Dropdown
            className='modelSelect'
            isDisabled={processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts}
            onChange={setSelectedModel}
            options={OPENAI_MODELS}
            value={selectedModel}
          />
          <Button
            icon='magic'
            isDisabled={!pages.get(pageNumber)?.pageMMDZip || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts}
            label='Generate concepts and exercises'
            onClick={generateConcepts}
          />
          <Button
            icon='expand'
            isDisabled={!concepts.length || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isSplittingConcepts}
            label='Split concepts'
            onClick={splitConcepts}
          />
        </div>
      </div>
      {!pages.get(pageNumber)?.pageMMDZip && <p className='recognitionHint'>Recognize this page before generating concepts.</p>}
      <div className='conceptsOutput'>
        <h3>{pages.get(pageNumber)?.chapter || 'Chapter not identified'}</h3>
        {concepts.length
          ? <ul>{concepts.map((concept) => <li key={concept.id}>
            <strong>{concept.title}</strong>
            {concept.description && <p>{concept.description}</p>}
          </li>)}</ul>
          : <p className='emptyOutput'>No concepts have been generated for this page.</p>}
        <h3>Exercises</h3>
        {exercises.length
          ? <ul>{exercises.map((exercise) => <li key={exercise.id}>
            <strong>{exercise.title}</strong>
            {exercise.description && <p>{exercise.description}</p>}
          </li>)}</ul>
          : <p className='emptyOutput'>No exercises have been generated for this page.</p>}
      </div>
    </div>
  );

  return (
    <StyledReader className={isMaximized ? 'isMaximized' : ''}>
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
      <div className='pageNavigation'>
        <Button
          icon='arrow-left'
          isDisabled={pageNumber <= 1}
          onClick={() => goToPage(pageNumber - 1)}
        />
        <label>
          Page
          <input
            max={totalPages || 1}
            min={1}
            onBlur={submitPageInput}
            onChange={({ target }) => setPageInput(target.value)}
            onKeyDown={({ key }) => key === 'Enter' && submitPageInput()}
            type='number'
            value={pageInput}
          />
          <span>of {totalPages || '…'}</span>
        </label>
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
        <div className='previewButton'>
          <Button
            icon={isMaximized ? 'compress' : 'search-plus'}
            onClick={() => setIsMaximized((value) => !value)}
          />
        </div>
      </div>
      {error && <p
        className='readerError'
        role='alert'
                >{error}</p>}
      <div className='readerTabs' role='tablist'>
        {([
          ['pdfText', 'Pdf/Text'],
          ['textConcepts', 'Text/Concepts'],
          ['conceptsSkills', 'Concepts/Skills']
        ] as Array<[ReaderPane, string]>).map(([pane, label]) => (
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
      </div>
      <div
        aria-labelledby={`${activePane}-tab`}
        className='readerColumns'
        role='tabpanel'
      >
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
            : <>
            <div className='skillsArea'>
              <Skills book={book} />
            </div>
          </>}
      </div>
    </StyledReader>
  );
}

const StyledReader = styled.div`
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
  }

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
    border-bottom: 1px solid #dde1eb;
    display: flex;
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
