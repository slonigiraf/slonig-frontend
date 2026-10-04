// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage } from '@slonigiraf/db';
import { putBookPage, replaceParsedBookPageContent } from '@slonigiraf/db';
import { strFromU8, unzipSync } from 'fflate';
import OpenAI from 'openai';
import { openRouterRequestGate } from '../../openrouter/concurrency.js';
import { fixChapterConceptsPrompt, parseMissingChapterConcepts } from '../book/processing/concepts/fixConcepts.js';
import { parseSortedChapterConceptIndexes, sortChapterConceptsPrompt } from '../book/processing/concepts/sortConcepts.js';
import { conceptBelongsToChapter, parseRefinedChapterGroups, refineChapterPrompt } from '../book/processing/chapters/refineChapters.js';
import { reportOpenRouterCost, type OpenRouterCostReporter } from '../../openrouter/cost.js';
import { BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT } from '../book/prompts/concepts.js';
import { extractMathpixHeadingsFromLines, parseChapterBoundaries, type ChapterBoundaryProposal } from '../book/processing/chapters/chapterSegmentation.js';
import { parseGeneratedChapterConcepts, type ConceptChapterNavigationItem, type GeneratedChapterConcepts } from '../book/processing/concepts/conceptRecognition.js';
import { deduplicateConceptsPrompt, parseDeduplicateConceptPairs, type DeduplicateConceptCandidatePair, type DeduplicateConceptInput, type DeduplicateConceptPair } from '../book/processing/concepts/deduplicateConcepts.js';
import { mergeStandardsMatches, parseStandardsMatches, STANDARDS_MATCH_RUNS, standardsCandidatesFromEmbeddings, standardsConceptInputs, standardsMatchingPrompt, type CurriculumStandard, type StandardsCatalog } from '../book/processing/standards/standards.js';
import { type MathpixPdfRecognitionResult } from '../book/processing/source/mathpixPdf.js';

interface ChapterConceptInputPage {
  input: MMDZipInput;
  pageNumber: number;
}

function conceptGenerationErrorMessage (error: unknown): string {
  const message = error instanceof Error
    ? error.message
    : typeof error === 'string'
      ? error
      : 'Unknown concept-generation error.';

  return message.replace(/\s+/g, ' ').trim().slice(0, 320) || 'Unknown concept-generation error.';
}

function isRetryableConceptContentError (error: unknown): boolean {
  if (error instanceof SyntaxError) {
    return true;
  }

  return error instanceof Error && error.message === 'OpenRouter returned invalid chapter concept data.';
}

async function runConceptRequestWithRetry<T>(request: () => Promise<T>): Promise<T> {
  return openRouterRequestGate.run(request);
}

async function requestGeneratedChapterContent(client: OpenAI, model: string, chapterTitle: string, pages: ChapterConceptInputPage[], onCost?: OpenRouterCostReporter): Promise<GeneratedChapterConcepts> {
  const usablePages = pages.filter(({ input }) => input.text.trim() || input.images.length);

  if (!usablePages.length) {
    return { concepts: [] };
  }

  const response = await runConceptRequestWithRetry(() => client.chat.completions.create({
    messages: [{
      content: [
        {
          text: BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT(chapterTitle, usablePages.map(({ input, pageNumber }) => ({ imageNames: input.images.map(({ name }) => name), pageNumber, text: input.text }))),
          type: 'text'
        },
        ...usablePages.flatMap(({ input, pageNumber }) => input.images.length
          ? [{ text: `Attached images for page ${pageNumber}:`, type: 'text' as const }, ...input.images.map(({ image_url, type }) => ({ image_url, type }))]
          : [])
      ],
      role: 'user'
    }],
    model,
    response_format: { type: 'json_object' }
  }));
  reportOpenRouterCost(response, onCost);

  const generatedContent = response.choices[0].message?.content?.trim();

  if (!generatedContent) {
    return { concepts: [] };
  }

  return parseGeneratedChapterConcepts(generatedContent, new Set(usablePages.map(({ pageNumber }) => pageNumber)));
}

async function requestMissingChapterConcepts(client: OpenAI, model: string, chapterTitle: string, chapterMmd: string, concepts: BookConcept[], allowedPageNumbers: number[], book: Pick<Book, 'age' | 'language' | 'subject'>, onCost?: OpenRouterCostReporter) {
  const prompt = fixChapterConceptsPrompt(chapterTitle, chapterMmd, concepts, book.subject, book.language, book.age);
  const response = await runConceptRequestWithRetry(() => client.chat.completions.create({
    messages: [{ content: prompt, role: 'user' }],
    model,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, onCost);
  const content = response.choices[0].message?.content?.trim();

  if (!content) {
    throw new Error('OpenRouter returned no Fix Concepts data.');
  }

  return parseMissingChapterConcepts(content, concepts, new Set(allowedPageNumbers));
}

async function requestDeduplicateConceptPairs(client: OpenAI, model: string, concepts: DeduplicateConceptInput[], candidates: DeduplicateConceptCandidatePair[], book: Pick<Book, 'age' | 'language' | 'subject'>, onCost?: OpenRouterCostReporter): Promise<DeduplicateConceptPair[]> {
  const prompt = deduplicateConceptsPrompt(concepts, candidates, book.subject, book.language, book.age);
  const response = await runConceptRequestWithRetry(() => client.chat.completions.create({
    messages: [{ content: prompt, role: 'user' }],
    model,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, onCost);
  const content = response.choices[0].message?.content?.trim();

  if (!content) {
    throw new Error('OpenRouter returned no Deduplicate Concepts data.');
  }

  return parseDeduplicateConceptPairs(content, concepts, candidates);
}

async function requestSortedChapterConceptIndexes(client: OpenAI, model: string, chapterTitle: string, concepts: BookConcept[], book: Pick<Book, 'age' | 'language' | 'subject'>, onCost?: OpenRouterCostReporter): Promise<number[]> {
  const prompt = sortChapterConceptsPrompt(chapterTitle, concepts, book.subject, book.language, book.age);
  const response = await runConceptRequestWithRetry(() => client.chat.completions.create({
    messages: [{ content: prompt, role: 'user' }],
    model,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, onCost);
  const content = response.choices[0].message?.content?.trim();

  if (!content) {
    throw new Error('OpenRouter returned no Sort Concepts data.');
  }

  return parseSortedChapterConceptIndexes(content, concepts.length).conceptIndexes;
}

async function requestRefinedChapterGroups(client: OpenAI, model: string, chapterTitle: string, concepts: BookConcept[], pageCount: number, book: Pick<Book, 'age' | 'language' | 'subject'>, onCost?: OpenRouterCostReporter): Promise<ReturnType<typeof parseRefinedChapterGroups>['chapters']> {
  const prompt = refineChapterPrompt(chapterTitle, concepts, pageCount, book.subject, book.language, book.age);
  const response = await runConceptRequestWithRetry(() => client.chat.completions.create({
    messages: [{ content: prompt, role: 'user' }],
    model,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, onCost);
  const content = response.choices[0].message?.content?.trim();

  if (!content) {
    throw new Error('OpenRouter returned no Refine Chapters data.');
  }

  return parseRefinedChapterGroups(content, concepts.length, pageCount).chapters;
}

async function requestChapterStandards(client: OpenAI, model: string, chapterTitle: string, concepts: ReturnType<typeof standardsConceptInputs>, conceptEmbeddings: number[][], catalogs: StandardsCatalog[], standardEmbeddings: ReadonlyMap<string, number[]>, onCost?: OpenRouterCostReporter): Promise<CurriculumStandard[]> {
  if (!concepts.length || !conceptEmbeddings.length) {
    return [];
  }

  const populatedCatalogs = catalogs.filter(({ standards }) => standards.length);

  if (!populatedCatalogs.length) {
    return [];
  }

  const assignments = await Promise.all(populatedCatalogs.map(async (catalog): Promise<CurriculumStandard[]> => {
    const { catalog: candidateCatalog, matches: embeddingMatches } = standardsCandidatesFromEmbeddings(conceptEmbeddings, catalog, standardEmbeddings);

    if (!candidateCatalog.standards.length) {
      return [];
    }

    const prompt = standardsMatchingPrompt(chapterTitle, concepts, candidateCatalog);
    const runs = await Promise.all(Array.from({ length: STANDARDS_MATCH_RUNS }, async (): Promise<CurriculumStandard[]> => {
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: prompt, role: 'user' }],
        model,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, onCost);
      const content = response.choices[0].message?.content?.trim();

      if (!content) {
        throw new Error(`OpenRouter returned no ${catalog.framework} standards matching data.`);
      }

      return parseStandardsMatches(content, candidateCatalog);
    }));
    const reconciled = mergeStandardsMatches(runs, Math.floor(STANDARDS_MATCH_RUNS / 2) + 1);
    const distanceByCode = new Map(embeddingMatches.map(({ code, distance }) => [code, distance] as const));

    return reconciled.map((standard) => {
      const distance = distanceByCode.get(standard.code);

      return distance === undefined ? standard : { ...standard, distance };
    });
  }));

  return mergeStandardsMatches(assignments);
}

function getChapterStandardsConceptRows(concepts: BookConcept[], chapter: ConceptChapterNavigationItem): BookConcept[] {
  const seen = new Set<string>();

  return concepts.filter((concept) => {
    if (!conceptBelongsToChapter(concept, chapter)) {
      return false;
    }

    const title = concept.title.trim();
    const description = concept.description.trim();
    const key = `${title}${description}`;

    if (!title || seen.has(key)) {
      return false;
    }

    seen.add(key);

    return true;
  });
}

async function generateChapterContentWithEmptyConceptRetry(client: OpenAI, model: string, chapterTitle: string, pages: ChapterConceptInputPage[], retryEmptyConcepts: boolean, onCost?: OpenRouterCostReporter): Promise<GeneratedChapterConcepts> {
  let firstResult: GeneratedChapterConcepts;

  try {
    firstResult = await requestGeneratedChapterContent(client, model, chapterTitle, pages, onCost);
  } catch (error) {
    // A structurally invalid model response is nondeterministic and worth one
    // fresh attempt. API transport/provider failures are already retried inside
    // requestGeneratedChapterContent, while non-retryable 4xx errors propagate.
    if (!isRetryableConceptContentError(error)) {
      throw error;
    }

    return requestGeneratedChapterContent(client, model, chapterTitle, pages, onCost);
  }

  if (firstResult.concepts.length || !retryEmptyConcepts) {
    return firstResult;
  }

  try {
    const secondResult = await requestGeneratedChapterContent(client, model, chapterTitle, pages, onCost);

    return secondResult.concepts.length ? secondResult : firstResult;
  } catch (error) {
    if (isRetryableConceptContentError(error)) {
      return firstResult;
    }

    // The first result was valid but empty. A failed recovery request must not
    // leave the whole chapter permanently blocking exercise generation.
    return firstResult;
  }
}

function abortError (): DOMException {
  return new DOMException('Processing aborted.', 'AbortError');
}

async function fetchWithProcessingSignal (input: RequestInfo | URL, init: RequestInit | undefined, processingSignal?: AbortSignal): Promise<Response> {
  const requestSignal = init?.signal;

  if (!processingSignal) {
    return fetch(input, init);
  }

  if (processingSignal.aborted || requestSignal?.aborted) {
    throw abortError();
  }

  if (!requestSignal || requestSignal === processingSignal) {
    return fetch(input, { ...init, signal: processingSignal });
  }

  const controller = new AbortController();
  const onProcessingAbort = (): void => controller.abort();
  const onRequestAbort = (): void => controller.abort();

  processingSignal.addEventListener('abort', onProcessingAbort, { once: true });
  requestSignal.addEventListener('abort', onRequestAbort, { once: true });

  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    processingSignal.removeEventListener('abort', onProcessingAbort);
    requestSignal.removeEventListener('abort', onRequestAbort);
  }
}

function createOpenRouterClient (apiKey: string, signal?: AbortSignal): OpenAI {
  return new OpenAI({
    apiKey,
    baseURL: 'https://openrouter.ai/api/v1',
    dangerouslyAllowBrowser: true,
    defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' },
    maxRetries: 0,
    ...(signal ? { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetchWithProcessingSignal(input, init, signal) } : {})
  });
}

interface MMDZipInput {
  images: Array<{ image_url: { detail: 'low'; url: string }; name: string; type: 'image_url' }>;
  text: string;
}

function bytesToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';

  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }

  return window.btoa(binary);
}

async function extractMMDZipInput(blob: Blob): Promise<MMDZipInput> {
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
        // Mathpix text is the primary concept signal. Images supplement diagrams
        // and other visual-only information, so low-detail vision is sufficient
        // here and greatly reduces the risk that chapter-wide requests exhaust
        // the model's context window with high-resolution image tokens.
        image_url: { detail: 'low', url: `data:${imageType};base64,${bytesToBase64(bytes)}` },
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

async function getPageConceptInput(page: BookPage): Promise<MMDZipInput | undefined> {
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

async function getChapterConceptInputs(chapterPages: BookPage[]): Promise<ChapterConceptInputPage[]> {
  const inputs = await Promise.all(chapterPages.map(async (page) => {
    const input = await getPageConceptInput(page);

    return input ? { input, pageNumber: page.pageNumber } : undefined;
  }));

  return inputs.filter((input): input is ChapterConceptInputPage => input !== undefined);
}

interface StoredChapterConcepts {
  conceptsByPage: Map<number, BookConcept[]>;
  pages: BookPage[];
}

async function storeGeneratedChapterConcepts(bookId: number, chapterPages: BookPage[], generatedConcepts: GeneratedChapterConcepts): Promise<StoredChapterConcepts> {
  const conceptsByPageInput = new Map<number, Array<{ description: string; title: string }>>();

  generatedConcepts.concepts.forEach(({ description, pageNumber, title }) => {
    const pageConcepts = conceptsByPageInput.get(pageNumber) ?? [];

    pageConcepts.push({ description, title });
    conceptsByPageInput.set(pageNumber, pageConcepts);
  });

  const storedPages: BookPage[] = [];
  const conceptsByPage = new Map<number, BookConcept[]>();

  for (const storedPage of [...chapterPages].sort((a, b) => a.pageNumber - b.pageNumber)) {
    const pageConcepts = conceptsByPageInput.get(storedPage.pageNumber) ?? [];
    const stored = await replaceParsedBookPageContent(bookId, storedPage.pageNumber, storedPage.chapter, pageConcepts, []);
    const storedConcepts = stored.concepts;

    const processedPage: BookPage = {
      ...storedPage,
      bookId,
      conceptsProcessed: true
    };

    await putBookPage(processedPage);
    storedPages.push(processedPage);
    conceptsByPage.set(storedPage.pageNumber, storedConcepts);
  }

  return { conceptsByPage, pages: storedPages };
}

async function requestChapterBoundaries(client: OpenAI, model: string, prompt: string, totalPages: number, onCost?: OpenRouterCostReporter): Promise<ChapterBoundaryProposal[]> {
  const response = await openRouterRequestGate.run(() => client.chat.completions.create({
    messages: [{ content: prompt, role: 'user' }],
    model,
    response_format: { type: 'json_object' }
  }));

  reportOpenRouterCost(response, onCost);
  const content = response.choices[0].message?.content?.trim();

  if (!content) {
    return [];
  }

  return parseChapterBoundaries(content, totalPages);
}

async function createPdfPageSliceFactory (file: File): Promise<(startPage: number, endPage: number) => Promise<File>> {
  const { PDFDocument } = await import('pdf-lib');
  const sourcePdf = await PDFDocument.load(await file.arrayBuffer());
  const baseName = file.name.replace(/\.pdf$/i, '');

  return async (startPage: number, endPage: number): Promise<File> => {
    if (!Number.isInteger(startPage) || !Number.isInteger(endPage) || startPage < 1 || endPage < startPage || endPage > sourcePdf.getPageCount()) {
      throw new Error(`Invalid PDF page range ${startPage}-${endPage}.`);
    }

    const pagePdf = await PDFDocument.create();
    const pageIndexes = Array.from({ length: endPage - startPage + 1 }, (_, index) => startPage + index - 1);
    const copiedPages = await pagePdf.copyPages(sourcePdf, pageIndexes);

    copiedPages.forEach((page) => pagePdf.addPage(page));

    const bytes = await pagePdf.save();
    const buffer = new ArrayBuffer(bytes.byteLength);

    new Uint8Array(buffer).set(bytes);

    return new File([buffer], `${baseName}-pages-${startPage}-${endPage}.pdf`, { type: 'application/pdf' });
  };
}

function mathpixHeadingsForRecognitionPage (recognition: MathpixPdfRecognitionResult, pageIndex: number): ReturnType<typeof extractMathpixHeadingsFromLines> {
  const linePages = recognition.lines.pages ?? [];
  const zeroBasedLinePages = linePages.some(({ page }) => page === 0);
  const expectedLinePage = zeroBasedLinePages ? pageIndex : pageIndex + 1;
  const linesPage = linePages.find(({ page }) => page === expectedLinePage) ?? linePages[pageIndex];

  return linesPage ? extractMathpixHeadingsFromLines({ pages: [linesPage] }) : [];
}

export { abortError, bytesToBase64, conceptGenerationErrorMessage, createOpenRouterClient, createPdfPageSliceFactory, extractMMDZipInput, fetchWithProcessingSignal, generateChapterContentWithEmptyConceptRetry, getChapterConceptInputs, getChapterStandardsConceptRows, getPageConceptInput, isRetryableConceptContentError, mathpixHeadingsForRecognitionPage, requestChapterBoundaries, requestChapterStandards, requestDeduplicateConceptPairs, requestGeneratedChapterContent, requestMissingChapterConcepts, requestRefinedChapterGroups, requestSortedChapterConceptIndexes, runConceptRequestWithRetry, storeGeneratedChapterConcepts };
export type { ChapterConceptInputPage, MMDZipInput, StoredChapterConcepts };
