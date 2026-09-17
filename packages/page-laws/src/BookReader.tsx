// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, BookStageSpendKey, Exercise, MathpixHeading } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { addBookStageSpend, assignBookPageChapter, deleteAbilities, deleteBookConcept, deleteExercise, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, mergeBookChapterWithPrevious, putBook, putBookPage, replaceBookChapterAssignments, replaceParsedBookPageContent, SettingKey, splitBookChapterAtPage, storeSetting, updateBookChapterTitle, updateBookProcessingStage } from '@slonigiraf/db';
import { KatexSpan, RoundProgress } from '@slonigiraf/slonig-components';
import { strFromU8, unzipSync } from 'fflate';
import MathpixLoader from 'mathpix-markdown-it/lib/components/mathpix-loader/index.js';
import MathpixMarkdown from 'mathpix-markdown-it/lib/components/mathpix-markdown/index.js';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import { parseStoredAbility } from './abilities.js';
import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import { BOOK_LANGUAGE_OPTIONS, bookLanguageLabel, getMiddleBookPageNumbers, normalizeLanguageCode, parseDetectedBookLanguage } from './bookLanguage.js';
import { BOOK_SUBJECT_OPTIONS, automaticBookSubjectForLanguage, bookSubjectLabel, normalizeBookSubject, parseDetectedBookSubject } from './bookSubject.js';
import { areAllBookPagesConceptsProcessed, countUnprocessedBookPages, processExtractedChapterContent } from './bookProcessing.js';
import { mapConcurrent } from './concurrency.js';
import { OPENROUTER_CONCURRENCY, openRouterRequestGate } from './openRouterConcurrency.js';
import { formatOpenRouterSpend, reportOpenRouterCost, type OpenRouterCostReporter } from './openRouterCost.js';
import { BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT, BOOK_LANGUAGE_DETECTION_PROMPT, BOOK_SUBJECT_DETECTION_PROMPT, MATHPIX_PDF_PAGE_PRICE_USD, OPENAI_MODELS } from './constants.js';
import { stripMarkdownImageReferences } from './bookImageRefs.js';
import { chapterAssignmentsFromBoundaries, chapterEvidenceWindows, chapterReconciliationPrompt, chapterWindowPrompt, deriveStructuralChapterCandidates, extractMathpixHeadingsFromLines, pageChapterEvidence, parseChapterBoundaries, stabilizeChapterBoundaries, type ChapterBoundaryProposal } from './chapterSegmentation.js';
import { conceptChaptersFromPages, parseGeneratedChapterConcepts, type ConceptChapterNavigationItem, type GeneratedChapterConcepts } from './conceptRecognition.js';
import { loadStandardsCatalogsForBookSubject, loadStoredBookStandards, mergeStandardsMatches, parseStandardsFixResult, parseStandardsMatches, STANDARD_FRAMEWORKS, STANDARDS_FIX_RUNS, STANDARDS_MATCH_RUNS, standardsChapterKey, standardsConceptFingerprint, standardsConceptInputs, standardsFixInputs, standardsFixPrompt, standardsMatchingPrompt, standardsPathForBookSubject, storeBookStandards, type CurriculumStandard, type StandardsCatalog, type StandardsConceptInput, type StoredBookStandards } from './standards.js';
import Skills from './Skills.js';
import SkillsCourse from './SkillsCourse.js';
import { extractPdfOutlineChapterBoundaries, loadPdfJs } from './pdf.js';
import { useTranslation } from './translate.js';

export { OPENAI_MODELS } from './constants.js';


interface ChapterConceptInputPage {
  input: MMDZipInput;
  pageNumber: number;
}


type BookConceptWriteApi = {
  putBookConcept?: (concept: BookConcept) => Promise<unknown>;
  updateBookConcept?: (id: number, changes: Pick<BookConcept, 'description' | 'title'>) => Promise<unknown>;
};

async function saveBookConceptRecord (concept: BookConcept, title: string, description: string): Promise<void> {
  if (concept.id === undefined) {
    throw new Error('Unable to edit a concept without an id.');
  }

  // Keep concept ids stable so generated exercises that reference conceptId do
  // not become orphaned. Current DB builds expose putBookConcept; the update
  // branch keeps this compatible with DB builds that expose a patch helper.
  const database = await import('@slonigiraf/db') as unknown as BookConceptWriteApi;
  const updated = { ...concept, description, title };

  if (database.putBookConcept) {
    await database.putBookConcept(updated);

    return;
  }

  if (database.updateBookConcept) {
    await database.updateBookConcept(concept.id, { description, title });

    return;
  }

  throw new Error('This database build does not expose a concept update method.');
}

function ConceptItem ({ concept, firstPage, onDelete, onGoToPage, onSave }: { concept: BookConcept; firstPage?: number; onDelete: (concept: BookConcept) => Promise<void>; onGoToPage: (pageNumber: number) => void; onSave: (concept: BookConcept, title: string, description: string) => Promise<void> }): React.ReactElement {
  const [description, setDescription] = useState(concept.description);
  const [isBusy, setIsBusy] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(concept.title);

  useEffect(() => {
    if (!isEditing) {
      setTitle(concept.title);
      setDescription(concept.description);
    }
  }, [concept.description, concept.title, isEditing]);

  const cancel = useCallback((): void => {
    setTitle(concept.title);
    setDescription(concept.description);
    setIsEditing(false);
  }, [concept.description, concept.title]);
  const remove = useCallback((): void => setIsDeleteConfirmationOpen(true), []);
  const confirmRemove = useCallback((): void => {
    setIsBusy(true);
    onDelete(concept)
      .then(() => setIsDeleteConfirmationOpen(false))
      .catch(console.error)
      .finally(() => setIsBusy(false));
  }, [concept, onDelete]);
  const save = useCallback((): void => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    setIsBusy(true);
    onSave(concept, nextTitle, description.trim())
      .then(() => setIsEditing(false))
      .catch(console.error)
      .finally(() => setIsBusy(false));
  }, [concept, description, onSave, title]);

  return <li className='conceptItem'>
    {isDeleteConfirmationOpen && <Modal
      header='Delete concept'
      onClose={() => !isBusy && setIsDeleteConfirmationOpen(false)}
      size='small'
    >
      <Modal.Content>
        <p>Delete <strong><KatexSpan content={concept.title} /></strong>?</p>
        <p>Exercises and abilities linked to this concept will also be deleted.</p>
        <Button.Group>
          <Button
            icon='times'
            isDisabled={isBusy}
            label='Cancel'
            onClick={() => setIsDeleteConfirmationOpen(false)}
          />
          <Button
            icon='trash'
            isDisabled={isBusy}
            label='Delete'
            onClick={confirmRemove}
          />
        </Button.Group>
      </Modal.Content>
    </Modal>}
    {isEditing
      ? <div className='conceptEditForm'>
        <Input
          isFull
          label='Concept title'
          onChange={setTitle}
          onEnter={save}
          value={title}
        />
        <label>Description
          <textarea
            disabled={isBusy}
            onChange={({ target }) => setDescription(target.value)}
            rows={5}
            value={description}
          />
        </label>
        <div className='conceptActions'>
          <Button
            icon='times'
            isDisabled={isBusy}
            label='Cancel'
            onClick={cancel}
          />
          <Button
            icon='save'
            isDisabled={isBusy || !title.trim() || (title.trim() === concept.title && description.trim() === concept.description)}
            label='Save'
            onClick={save}
          />
        </div>
      </div>
      : <>
        <div className='conceptHeading'>
          <div className='conceptActions'>
            <Button
              icon='edit'
              isDisabled={concept.id === undefined || isBusy}
              onClick={() => setIsEditing(true)}
            />
          </div>
          <strong><KatexSpan content={concept.title} /></strong>
          <div className='conceptActions'>
            <Button
              icon='trash'
              isDisabled={concept.id === undefined || isBusy}
              onClick={remove}
            />
          </div>
        </div>
        {firstPage !== undefined && <p><small><button
          className='conceptPageLink'
          onClick={() => onGoToPage(firstPage)}
          type='button'
        >First introduced on page {firstPage}</button></small></p>}
        {concept.description && <p><KatexSpan content={concept.description} /></p>}
      </>}
  </li>;
}

async function requestGeneratedChapterContent(client: OpenAI, model: string, chapterTitle: string, pages: ChapterConceptInputPage[], onCost?: OpenRouterCostReporter): Promise<GeneratedChapterConcepts> {
  const usablePages = pages.filter(({ input }) => input.text.trim() || input.images.length);

  if (!usablePages.length) {
    return { concepts: [] };
  }

  const response = await openRouterRequestGate.run(() => client.chat.completions.create({
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

async function requestChapterStandards(client: OpenAI, model: string, chapterTitle: string, concepts: StandardsConceptInput[], catalogs: StandardsCatalog[], onCost?: OpenRouterCostReporter): Promise<CurriculumStandard[]> {
  if (!concepts.length) {
    return [];
  }

  const populatedCatalogs = catalogs.filter(({ standards }) => standards.length);

  if (!populatedCatalogs.length) {
    return [];
  }

  const assignments = await Promise.all(populatedCatalogs.map(async (catalog): Promise<CurriculumStandard[]> => {
    const runs = await Promise.all(Array.from({ length: STANDARDS_MATCH_RUNS }, async (): Promise<CurriculumStandard[]> => {
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{
          content: standardsMatchingPrompt(chapterTitle, concepts, catalog),
          role: 'user'
        }],
        model,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, onCost);
      const content = response.choices[0].message?.content?.trim();

      if (!content) {
        throw new Error(`OpenRouter returned no ${catalog.framework} standards matching data.`);
      }

      return parseStandardsMatches(content, catalog);
    }));

    return mergeStandardsMatches(runs, Math.floor(STANDARDS_MATCH_RUNS / 2) + 1);
  }));

  return mergeStandardsMatches(assignments);
}

async function requestFixedChapterStandards(client: OpenAI, model: string, chapterTitle: string, concepts: StandardsConceptInput[], standards: CurriculumStandard[], catalogs: StandardsCatalog[], onCost?: OpenRouterCostReporter): Promise<CurriculumStandard[]> {
  const inputs = standardsFixInputs(standards, catalogs);

  if (!inputs.length) {
    return [];
  }

  const reviews = await Promise.all(Array.from({ length: STANDARDS_FIX_RUNS }, async (): Promise<CurriculumStandard[]> => {
    const response = await openRouterRequestGate.run(() => client.chat.completions.create({
      messages: [{
        content: standardsFixPrompt(chapterTitle, concepts, inputs),
        role: 'user'
      }],
      model,
      response_format: { type: 'json_object' }
    }));

    reportOpenRouterCost(response, onCost);
    const content = response.choices[0].message?.content?.trim();

    if (!content) {
      throw new Error('OpenRouter returned no fixed standards data.');
    }

    return parseStandardsFixResult(content, inputs);
  }));

  return mergeStandardsMatches(reviews, Math.floor(STANDARDS_FIX_RUNS / 2) + 1);
}

async function getChapterStandardsConcepts(bookId: number, pageNumbers: number[]): Promise<StandardsConceptInput[]> {
  const concepts = (await Promise.all(pageNumbers.map((chapterPageNumber) => getBookConceptsForBookPage(bookId, chapterPageNumber)))).flat();

  return standardsConceptInputs(concepts);
}

async function generateChapterContentWithEmptyConceptRetry(client: OpenAI, model: string, chapterTitle: string, pages: ChapterConceptInputPage[], retryEmptyConcepts: boolean, onCost?: OpenRouterCostReporter): Promise<GeneratedChapterConcepts> {
  const firstResult = await requestGeneratedChapterContent(client, model, chapterTitle, pages, onCost);

  if (firstResult.concepts.length || !retryEmptyConcepts) {
    return firstResult;
  }

  try {
    const secondResult = await requestGeneratedChapterContent(client, model, chapterTitle, pages, onCost);

    return secondResult.concepts.length ? secondResult : firstResult;
  } catch {
    // The first result was valid but empty. A failed recovery request must not
    // leave the whole chapter permanently blocking exercise generation.
    return firstResult;
  }
}

const MAX_REQUESTS_PER_MIN = 180;
const RATE_LIMIT_WINDOW_MS = 60_000;
const RECOGNITION_PAGE_SPAWN_INTERVAL_MS = Math.ceil(RATE_LIMIT_WINDOW_MS / MAX_REQUESTS_PER_MIN);

const pageSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-page`;

function getSessionPage(bookId: number): number {
  try {
    const value = Number(sessionStorage.getItem(pageSessionKey(bookId)));

    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

function storeSessionPage(bookId: number, pageNumber: number): void {
  try {
    sessionStorage.setItem(pageSessionKey(bookId), String(pageNumber));
  } catch {
    // Session storage may be unavailable in privacy-restricted browser contexts.
  }
}

const recognitionAttemptSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-recognition-attempted`;

function getSessionRecognitionAttempted(bookId: number): boolean {
  try {
    return sessionStorage.getItem(recognitionAttemptSessionKey(bookId)) === 'true';
  } catch {
    return false;
  }
}

function storeSessionRecognitionAttempted(bookId: number): void {
  try {
    sessionStorage.setItem(recognitionAttemptSessionKey(bookId), 'true');
  } catch {
    // Session storage may be unavailable in privacy-restricted browser contexts.
  }
}

const delay = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

interface MMDZipInput {
  images: Array<{ image_url: { url: string }; name: string; type: 'image_url' }>;
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
    let storedConcepts: BookConcept[] = [];

    try {
      const stored = await replaceParsedBookPageContent(bookId, storedPage.pageNumber, storedPage.chapter, pageConcepts, []);

      storedConcepts = stored.concepts;
    } catch (error) {
      // A page with no concepts can have nothing to replace. That is still a
      // valid chapter-level extraction result. Non-empty writes must succeed.
      if (pageConcepts.length) {
        throw error;
      }
    }

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

async function createSinglePagePdf(file: File, pageNumber: number): Promise<Blob> {
  const PDFDocumentModule = await import('pdf-lib/cjs/api/PDFDocument.js');
  const sourcePdf = await PDFDocumentModule.default.load(await file.arrayBuffer());
  const pagePdf = await PDFDocumentModule.default.create();
  const [page] = await pagePdf.copyPages(sourcePdf, [pageNumber - 1]);

  pagePdf.addPage(page);

  const bytes = await pagePdf.save();
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return new Blob([buffer], { type: 'application/pdf' });
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

async function recognizePageWithMathpix(apiKey: string, file: File, pageNumber: number): Promise<Pick<BookPage, 'mathpixHeadings' | 'pageMMD' | 'pageMMDZip'>> {
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

    const zipConversionFinished = !zipStatus || zipStatus.status === 'completed' || zipStatus.status === 'error';

    if (statusResult.status === 'completed' && zipConversionFinished) {
      const [mmdResponse, linesResponse] = await Promise.all([
        fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.mmd`, { headers }),
        fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.lines.json`, { headers })
      ]);

      if (!mmdResponse.ok) {
        throw new Error('Unable to download the MMD text from Mathpix.');
      }

      let mathpixHeadings: MathpixHeading[] = [];
      let pageMMDZip: Blob | undefined;

      if (linesResponse.ok) {
        try {
          mathpixHeadings = extractMathpixHeadingsFromLines(await linesResponse.json());
        } catch {
          // The normal MMD result is still usable when optional line metadata fails.
        }
      }

      // mmd.zip is useful for embedded page images, but it is not required to
      // consider the page recognized. Mathpix can fail this optional conversion
      // for genuinely blank pages even though the normal MMD result is valid.
      if (zipStatus?.status === 'completed') {
        const zipResponse = await fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.mmd.zip`, { headers });

        if (zipResponse.ok) {
          pageMMDZip = await zipResponse.blob();
        }
      }

      return {
        mathpixHeadings,
        pageMMD: (await mmdResponse.text()).trim(),
        pageMMDZip
      };
    }

    await delay(1000);
  }

  throw new Error('Mathpix timed out while recognizing the PDF page.');
}

interface Props {
  assignAllStandardsRequest: number;
  fixAllStandardsRequest: number;
  book: Book;
  file: File;
  generateAllConceptsModel: string;
  generateAllConceptsRequest: number;
  identifyChaptersRequest: number;
  languageTabRequest: number;
  subjectTabRequest: number;
  onBookChange: (book: Book) => void;
  onProcessingComplete: () => void;
  pendingProcessingAction?: 'chapters' | 'concepts' | 'recognize' | 'standards' | 'fixStandards' | 'exercises';
  processingToolbar: React.ReactNode;
  processingToolbarAfterFixImages?: (stage: number) => React.ReactNode;
  generateAllExercisesRequest: number;
  recognizeAllRequest: number;
}

type ReaderPane = 'chapters' | 'conceptExercises' | 'conceptsSkills' | 'language' | 'subject' | 'pdf' | 'preExercisesExercises' | 'skillsCourse' | 'standards' | 'text' | 'textConcepts';
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

function conceptReferenceKey({ description, id, title }: Pick<BookConcept, 'description' | 'id' | 'title'>): string {
  return id === undefined ? `content:${title}\n${description}` : `id:${id}`;
}

const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

const readerPaneSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-pane`;
const readerMaximizedSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-maximized`;
const exerciseChapterSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-exercises-chapter`;

function getSessionExerciseChapter(bookId: number): number {
  try {
    const stored = Number(sessionStorage.getItem(exerciseChapterSessionKey(bookId)));

    return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

function getSessionReaderMaximized(bookId: number): boolean {
  try {
    return sessionStorage.getItem(readerMaximizedSessionKey(bookId)) === 'true';
  } catch {
    return false;
  }
}

function getSessionReaderPane(bookId: number): ReaderPane {
  try {
    const value = sessionStorage.getItem(readerPaneSessionKey(bookId));

    if (value === 'pdfText' || value === 'pdf') {
      return 'text';
    }

    return value === 'text' || value === 'language' || value === 'subject' || value === 'chapters' || value === 'textConcepts' || value === 'standards' || value === 'conceptExercises' || value === 'preExercisesExercises' || value === 'skillsCourse' ? value : 'text';
  } catch {
    return 'text';
  }
}

function BookReader({ assignAllStandardsRequest, book, file, fixAllStandardsRequest, generateAllConceptsModel, generateAllConceptsRequest, identifyChaptersRequest, languageTabRequest, subjectTabRequest, onBookChange, onProcessingComplete, pendingProcessingAction, processingToolbar, processingToolbarAfterFixImages, recognizeAllRequest, generateAllExercisesRequest }: Props): React.ReactElement {
  const { t } = useTranslation();
  const [activePane, setActivePane] = useState<ReaderPane>(() => {
    const stage = book.processingStage ?? 0;
    const storedPane = getSessionReaderPane(book.id);

    if (stage < 1) {
      return 'text';
    }

    return storedPane === 'standards' && stage < 11 ? (stage >= 6 ? 'preExercisesExercises' : stage >= 3 ? 'textConcepts' : 'text') : storedPane;
  });
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [chapterTitleDraft, setChapterTitleDraft] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [concepts, setConcepts] = useState<BookConcept[]>([]);
  const [standardsByChapter, setStandardsByChapter] = useState<StoredBookStandards>(() => loadStoredBookStandards(book.id));
  const [standardsCatalogs, setStandardsCatalogs] = useState<StandardsCatalog[]>([]);
  const [standardsChapterIndex, setStandardsChapterIndex] = useState(0);
  const [standardsAssignedChapterCount, setStandardsAssignedChapterCount] = useState(0);
  const [standardsFixedChapterCount, setStandardsFixedChapterCount] = useState(0);
  const [isAssigningStandards, setIsAssigningStandards] = useState(false);
  const [isFixingStandards, setIsFixingStandards] = useState(false);
  const [conceptFirstPageByKey, setConceptFirstPageByKey] = useState<Map<string, number>>(new Map());
  const [exerciseChapterConcepts, setExerciseChapterConcepts] = useState<BookConcept[]>([]);
  const [exerciseChapterExercises, setExerciseChapterExercises] = useState<Exercise[]>([]);
  const [exerciseChapterIndex, setExerciseChapterIndex] = useState(() => getSessionExerciseChapter(book.id));
  const [isExerciseChapterLoading, setIsExerciseChapterLoading] = useState(false);
  const [error, setError] = useState('');
  const [entityCounts, setEntityCounts] = useState<ReaderEntityCounts>({ abilities: 0, bookExercises: 0, concepts: 0, exercises: 0 });
  const [generatedConceptsChapterCount, setGeneratedConceptsChapterCount] = useState(0);
  const [identifiedChapterPageCount, setIdentifiedChapterPageCount] = useState(0);
  const [chapterIdentificationPhase, setChapterIdentificationPhase] = useState<'bookmarks' | 'saving' | 'text'>('bookmarks');
  const [isIdentifyingChapters, setIsIdentifyingChapters] = useState(false);
  const chapterIdentificationLabel = chapterIdentificationPhase === 'bookmarks'
    ? 'Reading PDF bookmarks'
    : chapterIdentificationPhase === 'saving'
      ? 'Saving chapter assignments'
      : 'Identifying chapters from page text';
  const [isDetectingBookLanguage, setIsDetectingBookLanguage] = useState(false);
  const [isDetectingBookSubject, setIsDetectingBookSubject] = useState(false);
  const [isSubjectDetectionConfirmationOpen, setIsSubjectDetectionConfirmationOpen] = useState(false);
  const [isGeneratingAllConcepts, setIsGeneratingAllConcepts] = useState(false);
  const [isGeneratingChapterConcepts, setIsGeneratingChapterConcepts] = useState(false);
  const [isMaximized, setIsMaximized] = useState(() => getSessionReaderMaximized(book.id));
  const [isMathpixKeyPromptOpen, setIsMathpixKeyPromptOpen] = useState(false);
  const [isPageGenerationConfirmationOpen, setIsPageGenerationConfirmationOpen] = useState(false);
  const [isGeneratingAllExercises, setIsGeneratingAllExercises] = useState(false);
  const [isRecognizingAll, setIsRecognizingAll] = useState(false);
  const [mathpixApiKey, setMathpixApiKey] = useState('');
  const [openRouterSpent, setOpenRouterSpent] = useState(0);
  const [recognizedPageCount, setRecognizedPageCount] = useState(0);
  const [hasRecognitionBeenAttempted, setHasRecognitionBeenAttempted] = useState(() => getSessionRecognitionAttempted(book.id));
  const [generatedExercisesPageCount, setGeneratedExercisesPageCount] = useState(0);
  const [recognitionTarget, setRecognitionTarget] = useState<RecognitionTarget>('page');
  const [processingPage, setProcessingPage] = useState<number>();
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [renderedPageHeight, setRenderedPageHeight] = useState<number>();
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);
  const [selectedSubjectModel, setSelectedSubjectModel] = useState(OPENAI_MODELS[0].value);
  const [skillsRefreshToken, setSkillsRefreshToken] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handledAssignAllStandardsRequestRef = useRef(assignAllStandardsRequest);
  const handledFixAllStandardsRequestRef = useRef(fixAllStandardsRequest);
  const handledGenerateAllConceptsRequestRef = useRef(generateAllConceptsRequest);
  const handledLanguageTabRequestRef = useRef(languageTabRequest);
  const handledSubjectTabRequestRef = useRef(subjectTabRequest);
  const handledIdentifyChaptersRequestRef = useRef(identifyChaptersRequest);
  const handledGenerateAllExercisesRequestRef = useRef(generateAllExercisesRequest);
  const handledRecognizeAllRequestRef = useRef(recognizeAllRequest);
  const isDetectingBookLanguageRef = useRef(false);
  const isDetectingBookSubjectRef = useRef(false);
  const pageAreaRef = useRef<HTMLDivElement>(null);

  useEffect((): void => {
    setHasRecognitionBeenAttempted(getSessionRecognitionAttempted(book.id));
  }, [book.id]);

  useEffect((): void => {
    if (pendingProcessingAction !== 'recognize') {
      return;
    }

    setHasRecognitionBeenAttempted(true);
    storeSessionRecognitionAttempted(book.id);
  }, [book.id, pendingProcessingAction]);

  const addStageCost = useCallback((stage: BookStageSpendKey, costUsd: number): void => {
    setOpenRouterSpent((current) => current + costUsd);
    void addBookStageSpend(book.id, stage, costUsd).catch(console.error);
  }, [book.id]);
  const addRecognizeCost = useCallback((costUsd: number): void => addStageCost('recognize', costUsd), [addStageCost]);
  const addLanguageCost = useCallback((costUsd: number): void => addStageCost('language', costUsd), [addStageCost]);
  const addSubjectCost = useCallback((costUsd: number): void => addStageCost('subject', costUsd), [addStageCost]);
  const addChaptersCost = useCallback((costUsd: number): void => addStageCost('chapters', costUsd), [addStageCost]);
  const addConceptsCost = useCallback((costUsd: number): void => addStageCost('concepts', costUsd), [addStageCost]);
  const addExercisesCost = useCallback((costUsd: number): void => addStageCost('exercises', costUsd), [addStageCost]);
  const addStandardsCost = useCallback((costUsd: number): void => addStageCost('standards', costUsd), [addStageCost]);
  const addFixStandardsCost = useCallback((costUsd: number): void => addStageCost('fixStandards', costUsd), [addStageCost]);
  const conceptChapters = useMemo<ConceptChapterNavigationItem[]>(() => conceptChaptersFromPages(Array.from(pages.values())), [pages]);
  const currentConceptChapter = useMemo(() => conceptChapters.find(({ pageNumbers }) => pageNumbers.includes(pageNumber)), [conceptChapters, pageNumber]);
  const conceptChapterIndex = useMemo(() => Math.max(0, conceptChapters.findIndex(({ pageNumbers }) => pageNumbers.includes(pageNumber))), [conceptChapters, pageNumber]);
  const currentStandardsChapter = conceptChapters[standardsChapterIndex];
  const currentStandardsChapterKey = currentStandardsChapter ? standardsChapterKey(currentStandardsChapter.chapterId, currentStandardsChapter.title, currentStandardsChapter.pageNumbers) : undefined;
  const standardDescriptions = useMemo(() => {
    const descriptions = new Map<string, string>();

    standardsCatalogs.forEach(({ framework, standards }) => {
      standards.forEach(({ code, description }) => descriptions.set(`${framework}:${code}`, description));
    });

    return descriptions;
  }, [standardsCatalogs]);
  const chapterGenerationEstimate = useMemo(() => {
    const chapterText = currentConceptChapter?.pageNumbers.map((chapterPageNumber) => `--- page ${chapterPageNumber} ---\n${pages.get(chapterPageNumber)?.pageMMD ?? ''}`).join('\n\n') ?? '';
    const estimatedRequest = chapterText.padEnd(chapterText.length + 2_000);

    // Empty concept responses can be retried once with the same whole-chapter
    // input, so show the conservative two-request estimate.
    return formatAiInputEstimate(estimateAiInput(selectedModel, [estimatedRequest, estimatedRequest], 4_800));
  }, [currentConceptChapter, pages, selectedModel]);
  const subjectDetectionEstimate = useMemo(() => {
    if (automaticBookSubjectForLanguage(book.language)) {
      return 'Non-English books are classified as na automatically. No OpenRouter request or model cost is needed.';
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = pages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      return 'Recognition text is incomplete; subject detection cannot be estimated yet.';
    }

    return formatAiInputEstimate(estimateAiInput(selectedSubjectModel, [BOOK_SUBJECT_DETECTION_PROMPT(book.language ?? 'unknown', pageTexts)], 64));
  }, [book.language, pages, selectedSubjectModel, totalPages]);
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
  const onSkillsContentChange = useCallback((): void => {
    setSkillsRefreshToken((value) => value + 1);
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
  const changeStandardsChapter = useCallback((index: number): void => {
    setStandardsChapterIndex(Math.max(0, Math.min(index, Math.max(0, conceptChapters.length - 1))));
  }, [conceptChapters.length]);

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

  useEffect((): void => {
    if (!conceptChapters.length) {
      setStandardsChapterIndex(0);

      return;
    }

    if (standardsChapterIndex >= conceptChapters.length) {
      changeStandardsChapter(conceptChapters.length - 1);
    }
  }, [changeStandardsChapter, conceptChapters.length, standardsChapterIndex]);

  useEffect((): void => {
    setStandardsByChapter(loadStoredBookStandards(book.id));
    setStandardsChapterIndex(0);
  }, [book.id]);

  useEffect(() => {
    let cancelled = false;

    setStandardsCatalogs([]);
    loadStandardsCatalogsForBookSubject(book.subject)
      .then((catalogs) => {
        if (!cancelled) {
          setStandardsCatalogs(catalogs);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStandardsCatalogs([]);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [book.subject]);

  useEffect(() => {
    const stage = book.processingStage ?? 0;

    if (activePane === 'standards' && stage < 11) {
      setActivePane(stage >= 6 ? 'preExercisesExercises' : stage >= 3 ? 'textConcepts' : 'text');
    }
  }, [activePane, book.processingStage]);

  useEffect(() => {
    try {
      sessionStorage.setItem(readerPaneSessionKey(book.id), activePane);
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }
  }, [activePane, book.id]);

  useEffect(() => {
    try {
      sessionStorage.setItem(readerMaximizedSessionKey(book.id), String(isMaximized));
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }
  }, [book.id, isMaximized]);

  useEffect(() => {
    const recognitionIsComplete = totalPages > 0 && Array.from(
      { length: totalPages },
      (_, index) => pages.get(index + 1)?.pageMMD !== undefined
    ).every(Boolean);

    // Keep the combined PDF/Text pane available from the initial stage so
    // recognition can be watched with the source PDF on the left and OCR text
    // on the right.
    if ((book.processingStage ?? 0) < 1 && !recognitionIsComplete && activePane !== 'text') {
      setActivePane('text');
    }
  }, [activePane, book.processingStage, pages, totalPages]);

  useEffect(() => {
    if (pendingProcessingAction) {
      setOpenRouterSpent(0);
    }

    if (pendingProcessingAction === 'recognize') {
      setActivePane('text');
    } else if (pendingProcessingAction === 'chapters') {
      setActivePane('chapters');
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
  const advanceStageRef = useRef(advanceStage);

  advanceStageRef.current = advanceStage;

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

      const { getDocument } = await loadPdfJs();

      if (!active) {
        return;
      }

      loadingTask = getDocument({ data });

      const [document, storedPages, storedChapters] = await Promise.all([
        loadingTask.promise,
        getBookPages(book.id),
        getBookChapters(book.id)
      ]);

      if (!active) {
        void document.destroy();

        return;
      }

      setPdf(document);
      setTotalPages(document.numPages);
      setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
      setChapters(storedChapters);
      const hasEveryPage = storedPages.length === document.numPages;

      if (areAllBookPagesConceptsProcessed(document.numPages, storedPages)) {
        await advanceStageRef.current(3);
      } else if (hasEveryPage && storedPages.every(({ chapterId, chapter }) => chapterId !== undefined || Boolean(chapter.trim()))) {
        await advanceStageRef.current(2);
      } else if (hasEveryPage && storedPages.every(({ pageMMD }) => pageMMD !== undefined)) {
        await advanceStageRef.current(1);
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
  }, [book.id, file]);

  useEffect(() => {
    let active = true;

    const loadChapterConcepts = async (): Promise<void> => {
      if (!currentConceptChapter) {
        if (active) {
          setConcepts([]);
          setConceptFirstPageByKey(new Map());
        }

        return;
      }

      const rows = await Promise.all(currentConceptChapter.pageNumbers.map(async (chapterPageNumber) => ({
        concepts: await getBookConceptsForBookPage(book.id, chapterPageNumber),
        pageNumber: chapterPageNumber
      })));

      if (active) {
        const storedConcepts = rows.flatMap(({ concepts }) => concepts);
        const references = new Map<string, number>();

        rows.forEach(({ concepts, pageNumber: conceptPageNumber }) => concepts.forEach((concept) => references.set(conceptReferenceKey(concept), conceptPageNumber)));
        setConcepts(storedConcepts);
        setConceptFirstPageByKey(references);
      }
    };

    loadChapterConcepts().catch(() => active && setError('Unable to load chapter concepts.'));

    return () => {
      active = false;
    };
  }, [book.id, currentConceptChapter, pages]);

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

  const currentBookPage = pages.get(pageNumber);
  const currentChapter = useMemo(() => {
    if (!currentBookPage) {
      return undefined;
    }

    return chapters.find(({ id }) => id !== undefined && id === currentBookPage.chapterId) ?? chapters.find(({ title }) => title === currentBookPage.chapter);
  }, [chapters, currentBookPage]);

  useEffect(() => {
    setChapterTitleDraft(currentChapter?.title ?? '');
  }, [currentChapter?.id, currentChapter?.title]);

  const refreshChapterAssignments = useCallback(async (): Promise<void> => {
    const [storedPages, storedChapters] = await Promise.all([getBookPages(book.id), getBookChapters(book.id)]);

    setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
    setChapters(storedChapters);
  }, [book.id]);

  const synchronizeChapterProcessingStage = useCallback(async (): Promise<void> => {
    const storedPages = await getBookPages(book.id);
    const complete = totalPages > 0 && storedPages.length === totalPages && storedPages.every(({ chapterId, chapter }) => chapterId !== undefined || Boolean(chapter.trim()));
    const processingStage = complete ? Math.max(book.processingStage ?? 0, 2) : 1;
    const updated = await updateBookProcessingStage(book.id, processingStage);

    onBookChange(updated ?? { ...book, processingStage });
  }, [book, onBookChange, totalPages]);

  const saveCurrentChapterTitle = useCallback(async (): Promise<void> => {
    const title = chapterTitleDraft.trim();

    if (currentChapter?.id === undefined || !title) {
      return;
    }

    setError('');

    try {
      await updateBookChapterTitle(currentChapter.id, title);
      await refreshChapterAssignments();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to rename chapter.');
    }
  }, [chapterTitleDraft, currentChapter?.id, refreshChapterAssignments]);

  const assignCurrentPageToChapter = useCallback(async (chapterId: number): Promise<void> => {
    setError('');

    try {
      await assignBookPageChapter(book.id, pageNumber, chapterId);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to assign this page to the chapter.');
    }
  }, [book.id, pageNumber, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const startChapterHere = useCallback(async (): Promise<void> => {
    const title = newChapterTitle.trim();

    if (!title) {
      setError('Enter a chapter title first.');
      return;
    }

    setError('');

    try {
      await splitBookChapterAtPage(book.id, pageNumber, title);
      setNewChapterTitle('');
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to start a chapter here.');
    }
  }, [book.id, newChapterTitle, pageNumber, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const mergeCurrentChapterWithPrevious = useCallback(async (): Promise<void> => {
    if (currentChapter?.id === undefined) {
      return;
    }

    setError('');

    try {
      await mergeBookChapterWithPrevious(book.id, currentChapter.id);
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to merge this chapter with the previous chapter.');
    }
  }, [book.id, currentChapter?.id, refreshChapterAssignments, synchronizeChapterProcessingStage]);

  const identifyChapters = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isGeneratingAllExercises || isIdentifyingChapters) {
      return;
    }

    const recognizedPages = Array.from(pages.values()).sort((a, b) => a.pageNumber - b.pageNumber);

    if (recognizedPages.length !== totalPages || recognizedPages.some(({ pageMMD }) => pageMMD === undefined)) {
      setError('Recognize every page before identifying chapters.');
      onProcessingComplete();
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIdentifiedChapterPageCount(0);
    setChapterIdentificationPhase('bookmarks');
    setIsIdentifyingChapters(true);

    try {
      // The document outline/bookmarks are author-provided PDF metadata, so
      // prefer them over inferred headings and AI reconciliation whenever they
      // contain usable destinations.
      if (!pdf) {
        throw new Error('The PDF is still loading. Try identifying chapters again.');
      }

      const outlineBoundaries = await extractPdfOutlineChapterBoundaries(pdf);

      if (outlineBoundaries.length) {
        const boundaries = chapterAssignmentsFromBoundaries(outlineBoundaries, totalPages);

        setChapterIdentificationPhase('saving');
        await replaceBookChapterAssignments(book.id, boundaries);
        await refreshChapterAssignments();
        await advanceStage(2);
        setIdentifiedChapterPageCount(totalPages);
        return;
      }

      if (!book.language) {
        throw new Error('Set the book language after recognition before identifying chapters without PDF bookmarks.');
      }

      setChapterIdentificationPhase('text');
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
      const windows = chapterEvidenceWindows(recognizedPages);
      const windowResults = await mapConcurrent(windows, Math.min(3, OPENROUTER_CONCURRENCY), async (window) => {
        const result = await requestChapterBoundaries(client, generateAllConceptsModel, chapterWindowPrompt(window), totalPages, addChaptersCost);
        setIdentifiedChapterPageCount((current) => Math.max(current, window[window.length - 1]?.pageNumber ?? current));

        return result;
      });
      const proposals = windowResults.flat();
      const evidence = recognizedPages.map(pageChapterEvidence);
      const structural = deriveStructuralChapterCandidates(evidence);
      const reconciled = await requestChapterBoundaries(client, generateAllConceptsModel, chapterReconciliationPrompt(proposals, evidence, totalPages, structural), totalPages, addChaptersCost);
      const stable = stabilizeChapterBoundaries(reconciled.length ? reconciled : proposals, structural, totalPages, evidence);
      const boundaries = chapterAssignmentsFromBoundaries(stable, totalPages);

      setChapterIdentificationPhase('saving');
      await replaceBookChapterAssignments(book.id, boundaries);
      await refreshChapterAssignments();
      await advanceStage(2);
      setIdentifiedChapterPageCount(totalPages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to identify chapters.');
    } finally {
      setIsIdentifyingChapters(false);
      onProcessingComplete();
    }
  }, [addChaptersCost, advanceStage, book.id, book.language, generateAllConceptsModel, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, pdf, processingPage, refreshChapterAssignments, totalPages]);

  const generateConcepts = useCallback(async (): Promise<void> => {
    const storedPage = pages.get(pageNumber);

    if (!storedPage || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    if (!currentConceptChapter) {
      setError('Assign this page to a chapter before generating concepts.');
      return;
    }

    const chapterPages = currentConceptChapter.pageNumbers.flatMap((chapterPageNumber) => {
      const page = pages.get(chapterPageNumber);

      return page ? [page] : [];
    });

    if (chapterPages.length !== currentConceptChapter.pageNumbers.length) {
      setError('Recognize every page in this chapter before generating concepts.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingChapterConcepts(true);
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
      const chapterInputs = await getChapterConceptInputs(chapterPages);
      const generatedConcepts = await generateChapterContentWithEmptyConceptRetry(client, selectedModel, currentConceptChapter.title, chapterInputs, chapterInputs.length > 0, addConceptsCost);
      const stored = await storeGeneratedChapterConcepts(book.id, chapterPages, generatedConcepts);
      const updatedPages = new Map(pages);
      const references = new Map<string, number>();
      const storedConcepts: BookConcept[] = [];

      stored.pages.forEach((page) => updatedPages.set(page.pageNumber, page));
      stored.conceptsByPage.forEach((pageConcepts, conceptPageNumber) => pageConcepts.forEach((concept) => {
        storedConcepts.push(concept);
        references.set(conceptReferenceKey(concept), conceptPageNumber);
      }));

      setPages(updatedPages);
      setConcepts(storedConcepts);
      setConceptFirstPageByKey(references);
      await refreshEntityCounts();

      if (areAllBookPagesConceptsProcessed(totalPages, Array.from(updatedPages.values()))) {
        await advanceStage(3);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for this chapter.');
    } finally {
      setIsGeneratingChapterConcepts(false);
      setProcessingPage(undefined);
    }
  }, [addConceptsCost, advanceStage, book.id, currentConceptChapter, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, refreshEntityCounts, selectedModel, totalPages]);
  const closePageGenerationConfirmation = useCallback((): void => setIsPageGenerationConfirmationOpen(false), []);
  const confirmPageGeneration = useCallback((): void => {
    setIsPageGenerationConfirmationOpen(false);
    generateConcepts().catch(console.error);
  }, [generateConcepts]);

  const generateAllConcepts = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    const orderedPages = Array.from({ length: totalPages }, (_, index) => pages.get(index + 1));

    if (orderedPages.some((page) => !page)) {
      setError('Recognize every page before generating concepts.');
      onProcessingComplete();
      return;
    }

    const bookPages = orderedPages as BookPage[];

    if (bookPages.some(({ chapter, chapterId }) => chapterId === undefined && !chapter.trim())) {
      setError('Assign every page to a chapter before generating concepts.');
      onProcessingComplete();
      return;
    }

    const recognitionChapters = conceptChaptersFromPages(bookPages);

    if (!recognitionChapters.length || recognitionChapters.reduce((count, chapter) => count + chapter.pageNumbers.length, 0) !== totalPages) {
      setError('Every page must belong to exactly one chapter before generating concepts.');
      onProcessingComplete();
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingAllConcepts(true);
    setGeneratedConceptsChapterCount(0);

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
    const chapterTasks = recognitionChapters.map((chapter) => ({
      chapter,
      pages: chapter.pageNumbers.map((chapterPageNumber) => pages.get(chapterPageNumber) as BookPage)
    }));

    try {
      const generationResults = await mapConcurrent(chapterTasks, OPENROUTER_CONCURRENCY, async ({ chapter, pages: chapterPages }) => {
        try {
          const chapterInputs = await getChapterConceptInputs(chapterPages);

          return {
            chapter,
            chapterPages,
            generatedConcepts: await generateChapterContentWithEmptyConceptRetry(client, generateAllConceptsModel, chapter.title, chapterInputs, chapterInputs.length > 0, addConceptsCost),
            status: 'fulfilled' as const
          };
        } catch (reason) {
          return { chapter, chapterPages, reason, status: 'rejected' as const };
        }
      });
      let failedConceptTasks = 0;

      // Persist chapter-by-chapter. A concept is written only to the page where
      // the chapter-wide AI response says it was first introduced.
      for (const result of generationResults) {
        if (result.status === 'rejected') {
          failedConceptTasks++;
          continue;
        }

        try {
          const stored = await storeGeneratedChapterConcepts(book.id, result.chapterPages, result.generatedConcepts);

          setGeneratedConceptsChapterCount((count) => count + 1);

          if (result.chapter.pageNumbers.includes(pageNumber)) {
            const currentConcepts: BookConcept[] = [];
            const references = new Map<string, number>();

            stored.conceptsByPage.forEach((pageConcepts, conceptPageNumber) => pageConcepts.forEach((concept) => {
              currentConcepts.push(concept);
              references.set(conceptReferenceKey(concept), conceptPageNumber);
            }));
            setConcepts(currentConcepts);
            setConceptFirstPageByKey(references);
          }
        } catch {
          failedConceptTasks++;
        }
      }

      const storedPagesAfterGeneration = await getBookPages(book.id);
      const conceptsComplete = areAllBookPagesConceptsProcessed(totalPages, storedPagesAfterGeneration);

      setPages(new Map(storedPagesAfterGeneration.map((storedPage) => [storedPage.pageNumber, storedPage])));
      await refreshEntityCounts();

      if (failedConceptTasks === 0 && conceptsComplete) {
        await advanceStage(3);
      } else {
        const unprocessedPages = countUnprocessedBookPages(totalPages, storedPagesAfterGeneration);

        setError(`${failedConceptTasks} of ${recognitionChapters.length} chapters could not have concepts processed; ${unprocessedPages} pages remain unprocessed. Retry concept generation.`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
    } finally {
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();
    }
  }, [addConceptsCost, advanceStage, book.id, conceptChapters, generateAllConceptsModel, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pageNumber, pages, processingPage, refreshEntityCounts, totalPages]);

  const generateAllExercises = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isGeneratingAllExercises || isIdentifyingChapters) {
      return;
    }

    if (!book.language) {
      setError('Set the book language before generating exercises.');
      onProcessingComplete();
      return;
    }

    setError('');
    setOpenRouterSpent(0);
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
        const bookDetectedLanguage = bookLanguageLabel(book.language);
        const processedChapter = await processExtractedChapterContent(chapterInput, async (prompt) => {
          const response = await openRouterRequestGate.run(() => client.chat.completions.create({
            messages: [{ content: prompt, role: 'user' }],
            model: generateAllConceptsModel,
            response_format: { type: 'json_object' }
          }));

          reportOpenRouterCost(response, addExercisesCost);

          return response.choices[0].message?.content?.trim() ?? '{}';
        }, bookDetectedLanguage);

        for (const processed of processedChapter.pages) {
          await replaceParsedBookPageContent(book.id, processed.pageNumber, processedChapter.chapter, processed.concepts, processed.exercises);
          setGeneratedExercisesPageCount((count) => count + 1);
        }
      });

      await refreshEntityCounts();
      setSkillsRefreshToken((value) => value + 1);
      await advanceStage(4);
      setActivePane('conceptExercises');
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
    } finally {
      setIsGeneratingAllExercises(false);
      onProcessingComplete();
    }
  }, [addExercisesCost, advanceStage, book.id, book.language, generateAllConceptsModel, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, pageNumber, pages, processingPage, refreshEntityCounts, totalPages]);

  const detectAndStoreBookLanguage = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.language) || isDetectingBookLanguageRef.current) {
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = recognizedPages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      if (force) {
        throw new Error('The middle recognized pages do not contain enough text to detect a language. Choose the language manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or choose the language manually.');
      }

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

      reportOpenRouterCost(response, addLanguageCost);

      const language = parseDetectedBookLanguage(response.choices[0].message?.content?.trim() ?? '');
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const processingStage = languageChanged && (book.processingStage ?? 0) >= 4 ? 3 : book.processingStage;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      const updatedBook = { ...book, language, subject: automaticSubject ?? (languageChanged ? undefined : book.subject), processingStage };

      await putBook(updatedBook);
      onBookChange(updatedBook);
    } finally {
      isDetectingBookLanguageRef.current = false;
      setIsDetectingBookLanguage(false);
    }
  }, [addLanguageCost, book, onBookChange, selectedModel, totalPages]);

  const saveManualBookLanguage = useCallback(async (languageValue: string): Promise<void> => {
    const language = normalizeLanguageCode(languageValue);

    if (!language) {
      setError('Choose a valid ISO 639-1 book language.');
      return;
    }

    setError('');

    try {
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const processingStage = languageChanged && (book.processingStage ?? 0) >= 4 ? 3 : book.processingStage;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      const updatedBook = { ...book, language, subject: automaticSubject ?? (languageChanged ? undefined : book.subject), processingStage };

      await putBook(updatedBook);
      onBookChange(updatedBook);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book language.');
    }
  }, [book, onBookChange]);

  const isMmdConversionComplete = useMemo((): boolean => {
    if (!totalPages) {
      return false;
    }

    return Array.from({ length: totalPages }, (_, index) => pages.get(index + 1)?.pageMMD !== undefined).every(Boolean);
  }, [pages, totalPages]);

  const redetectBookLanguage = useCallback(async (): Promise<void> => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book language.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookLanguage(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine the book language from MMD text.');
    }
  }, [detectAndStoreBookLanguage, isMmdConversionComplete, pages]);

  const detectAndStoreBookSubject = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.subject) || isDetectingBookSubjectRef.current) {
      return;
    }

    if (!book.language) {
      if (force) {
        throw new Error('Set the book language before detecting its subject.');
      }

      return;
    }

    const automaticSubject = automaticBookSubjectForLanguage(book.language);

    if (automaticSubject) {
      const updatedBook: Book = { ...book, subject: automaticSubject };

      await putBook(updatedBook);
      onBookChange(updatedBook);
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = recognizedPages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      if (force) {
        throw new Error('The middle recognized pages do not contain enough text to detect a subject. Choose the subject manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or choose the subject manually.');
      }

      return;
    }

    isDetectingBookSubjectRef.current = true;
    setIsDetectingBookSubject(true);

    try {
      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }
      });
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_SUBJECT_DETECTION_PROMPT(book.language ?? 'unknown', pageTexts), role: 'user' }],
        model: selectedSubjectModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addSubjectCost);

      const subject = parseDetectedBookSubject(response.choices[0].message?.content?.trim() ?? '');
      const updatedBook: Book = { ...book, subject };

      await putBook(updatedBook);
      onBookChange(updatedBook);
    } finally {
      isDetectingBookSubjectRef.current = false;
      setIsDetectingBookSubject(false);
    }
  }, [addSubjectCost, book, onBookChange, selectedSubjectModel, totalPages]);

  const saveManualBookSubject = useCallback(async (subjectValue: string): Promise<void> => {
    const subject = normalizeBookSubject(subjectValue);

    if (!subject) {
      setError('Choose a valid book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before setting its subject.');
      return;
    }

    setError('');

    try {
      const updatedBook: Book = { ...book, subject };

      await putBook(updatedBook);
      onBookChange(updatedBook);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book subject.');
    }
  }, [book, onBookChange]);

  const redetectBookSubject = useCallback(async (): Promise<void> => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before detecting its subject.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookSubject(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine the book subject from MMD text.');
    }
  }, [book.language, detectAndStoreBookSubject, isMmdConversionComplete, pages]);

  const openSubjectDetectionConfirmation = useCallback((): void => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before detecting its subject.');
      return;
    }

    setError('');
    setIsSubjectDetectionConfirmationOpen(true);
  }, [book.language, isMmdConversionComplete]);

  const closeSubjectDetectionConfirmation = useCallback((): void => {
    setIsSubjectDetectionConfirmationOpen(false);
  }, []);

  const confirmSubjectDetection = useCallback((): void => {
    setIsSubjectDetectionConfirmationOpen(false);
    redetectBookSubject().catch(console.error);
  }, [redetectBookSubject]);

  const recognizePage = useCallback(async (): Promise<void> => {
    if (processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setProcessingPage(pageNumber);

    try {
      const apiKey = await getSetting(SettingKey.MATHPIX_API_KEY);

      if (!apiKey) {
        setMathpixApiKey(apiKey ?? '');
        setRecognitionTarget('page');
        setIsMathpixKeyPromptOpen(true);

        return;
      }

      const { mathpixHeadings, pageMMD, pageMMDZip } = await recognizePageWithMathpix(apiKey, file, pageNumber);

      addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD);

      const recognizedPage: BookPage = {
        ...pages.get(pageNumber),
        bookId: book.id,
        chapter: pages.get(pageNumber)?.chapter ?? '',
        conceptsProcessed: pages.get(pageNumber)?.conceptsProcessed ?? false,
        mathpixHeadings,
        pageMMD,
        pageMMDZip,
        pageNumber
      };

      await putBookPage(recognizedPage);
      const updatedPages = new Map(pages).set(pageNumber, recognizedPage);

      setPages(updatedPages);
      if (totalPages && Array.from({ length: totalPages }, (_, index) => updatedPages.get(index + 1)).every((page) => page?.pageMMD !== undefined)) {
        await advanceStage(1);
      }

      setActivePane('text');
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this page.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [addRecognizeCost, advanceStage, book.id, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, totalPages]);

  const recognizeAllPages = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters) {
      return;
    }

    setError('');
    setOpenRouterSpent(0);
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
    let recognitionCompleted = false;

    try {
      for (let currentPageNumber = 1; currentPageNumber <= totalPages; currentPageNumber++) {
        if (currentPageNumber > 1) {
          await delay(RECOGNITION_PAGE_SPAWN_INTERVAL_MS);
        }

        recognitionTasks.push((async () => {
          const { mathpixHeadings, pageMMD, pageMMDZip } = await recognizePageWithMathpix(apiKey, file, currentPageNumber);

          addRecognizeCost(MATHPIX_PDF_PAGE_PRICE_USD);

          const storedPage = pages.get(currentPageNumber);
          const recognizedPage: BookPage = {
            ...storedPage,
            bookId: book.id,
            chapter: storedPage?.chapter ?? '',
            conceptsProcessed: storedPage?.conceptsProcessed ?? false,
            mathpixHeadings,
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
        recognitionCompleted = true;
      }

    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
    } finally {
      setIsRecognizingAll(false);
      onProcessingComplete();

      if (recognitionCompleted) {
        setActivePane('text');
      }
    }
  }, [addRecognizeCost, advanceStage, book.id, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, processingPage, totalPages]);

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
    if (languageTabRequest === handledLanguageTabRequestRef.current) {
      return;
    }

    // Open the Language pane immediately, but keep the request pending until
    // the stored recognized pages have finished loading into the reader.
    setActivePane('language');

    if (!isMmdConversionComplete) {
      return;
    }

    handledLanguageTabRequestRef.current = languageTabRequest;

    // The pipeline Language button is an action, not only navigation: start a
    // fresh detection automatically. The pane shows progress/result and keeps
    // the manual language override available if detection cannot complete.
    redetectBookLanguage().catch(console.error);
  }, [isMmdConversionComplete, languageTabRequest, redetectBookLanguage]);

  useEffect((): void => {
    if (subjectTabRequest === handledSubjectTabRequestRef.current) {
      return;
    }

    // Subject is a separate pipeline action after language. Open its pane now,
    // then show the confirmation/model picker once recognized text is loaded.
    setActivePane('subject');

    if (!isMmdConversionComplete) {
      return;
    }

    handledSubjectTabRequestRef.current = subjectTabRequest;
    openSubjectDetectionConfirmation();
  }, [isMmdConversionComplete, openSubjectDetectionConfirmation, subjectTabRequest]);

  useEffect((): void => {
    if (
      generateAllExercisesRequest === handledGenerateAllExercisesRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledGenerateAllExercisesRequestRef.current = generateAllExercisesRequest;
    setActivePane('textConcepts');
    generateAllExercises().catch((processingError) => {
      setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
      onProcessingComplete();
    });
  }, [isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, processingPage, generateAllExercises, generateAllExercisesRequest, totalPages]);

  useEffect((): void => {
    if (
      generateAllConceptsRequest === handledGenerateAllConceptsRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledGenerateAllConceptsRequestRef.current = generateAllConceptsRequest;
    setActivePane('textConcepts');
    generateAllConcepts().catch((generationError) => {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
      onProcessingComplete();
    });
  }, [generateAllConcepts, generateAllConceptsRequest, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, totalPages]);

  useEffect((): void => {
    if (
      identifyChaptersRequest === handledIdentifyChaptersRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledIdentifyChaptersRequestRef.current = identifyChaptersRequest;
    setActivePane('chapters');
    identifyChapters().catch((chapterError) => {
      setError(chapterError instanceof Error ? chapterError.message : 'Unable to identify chapters.');
      onProcessingComplete();
    });
  }, [identifyChapters, identifyChaptersRequest, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, totalPages]);

  useEffect((): void => {
    if (
      recognizeAllRequest === handledRecognizeAllRequestRef.current ||
      !totalPages ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledRecognizeAllRequestRef.current = recognizeAllRequest;
    setActivePane('text');
    recognizeAllPages().catch((recognitionError) => {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize all pages.');
      onProcessingComplete();
    });
  }, [isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, processingPage, recognizeAllPages, recognizeAllRequest, totalPages]);

  const assignStandards = useCallback(async (force = false, model = selectedModel): Promise<void> => {
    if (!conceptChapters.length || isAssigningStandards || isFixingStandards) {
      return;
    }

    if ((book.processingStage ?? 0) < 11) {
      setError('Complete Fix images before identifying Standards.');
      return;
    }

    setError('');
    setIsAssigningStandards(true);
    setStandardsAssignedChapterCount(0);
    setOpenRouterSpent(0);

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
        },
        maxRetries: 0
      });
      const catalogs = await loadStandardsCatalogsForBookSubject(book.subject);
      const results = await mapConcurrent(conceptChapters, OPENROUTER_CONCURRENCY, async (chapter: ConceptChapterNavigationItem) => {
        const concepts = await getChapterStandardsConcepts(book.id, chapter.pageNumbers);
        const fingerprint = standardsConceptFingerprint(concepts, standardsPathForBookSubject(book.subject) ?? 'no-standards');
        const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);
        const existing = standardsByChapter[chapterKey];

        if (!force && existing?.conceptFingerprint === fingerprint) {
          setStandardsAssignedChapterCount((count) => count + 1);

          return { chapterKey, entry: existing, status: 'fulfilled' as const };
        }

        try {
          const standards = await requestChapterStandards(client, model, chapter.title, concepts, catalogs, addStandardsCost);

          setStandardsAssignedChapterCount((count) => count + 1);

          return { chapterKey, entry: { conceptFingerprint: fingerprint, standards }, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapterKey, reason, status: 'rejected' as const };
        }
      });
      const next = { ...standardsByChapter };
      let failures = 0;

      results.forEach((result) => {
        if (result.status === 'rejected') {
          failures++;
        } else {
          next[result.chapterKey] = result.entry;
        }
      });

      setStandardsByChapter(next);
      storeBookStandards(book.id, next);

      if (failures) {
        setError(`${failures} of ${conceptChapters.length} chapters could not have standards identified. Retry Standards identification.`);
      } else {
        await advanceStage(12);
      }
    } finally {
      setIsAssigningStandards(false);
    }
  }, [addStandardsCost, advanceStage, book.id, book.processingStage, book.subject, conceptChapters, isAssigningStandards, isFixingStandards, selectedModel, standardsByChapter]);

  const fixStandards = useCallback(async (model = selectedModel): Promise<void> => {
    if (!conceptChapters.length || isAssigningStandards || isFixingStandards) {
      return;
    }

    if ((book.processingStage ?? 0) < 12) {
      setError('Complete Standards before running Fix standards.');
      return;
    }

    setError('');
    setIsFixingStandards(true);
    setStandardsFixedChapterCount(0);
    setOpenRouterSpent(0);

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
        },
        maxRetries: 0
      });
      const catalogs = await loadStandardsCatalogsForBookSubject(book.subject);
      const results = await mapConcurrent(conceptChapters, OPENROUTER_CONCURRENCY, async (chapter: ConceptChapterNavigationItem) => {
        const concepts = await getChapterStandardsConcepts(book.id, chapter.pageNumbers);
        const fingerprint = standardsConceptFingerprint(concepts, standardsPathForBookSubject(book.subject) ?? 'no-standards');
        const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);
        const existing = standardsByChapter[chapterKey];

        if (!existing || existing.conceptFingerprint !== fingerprint) {
          return { chapterKey, reason: new Error('Chapter standards are missing or out of date.'), status: 'rejected' as const };
        }

        try {
          const standards = await requestFixedChapterStandards(client, model, chapter.title, concepts, existing.standards, catalogs, addFixStandardsCost);

          setStandardsFixedChapterCount((count) => count + 1);

          return { chapterKey, entry: { conceptFingerprint: fingerprint, standards }, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapterKey, reason, status: 'rejected' as const };
        }
      });
      const next = { ...standardsByChapter };
      let failures = 0;

      results.forEach((result) => {
        if (result.status === 'rejected') {
          failures++;
        } else {
          next[result.chapterKey] = result.entry;
        }
      });

      setStandardsByChapter(next);
      storeBookStandards(book.id, next);

      if (failures) {
        setError(`${failures} of ${conceptChapters.length} chapters could not have standards fixed. Retry Fix standards.`);
      } else {
        await advanceStage(13);
      }
    } finally {
      setIsFixingStandards(false);
    }
  }, [addFixStandardsCost, advanceStage, book.id, book.processingStage, book.subject, conceptChapters, isAssigningStandards, isFixingStandards, selectedModel, standardsByChapter]);

  useEffect((): void => {
    if (
      assignAllStandardsRequest === handledAssignAllStandardsRequestRef.current ||
      !conceptChapters.length ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters ||
      isAssigningStandards ||
      isFixingStandards
    ) {
      return;
    }

    handledAssignAllStandardsRequestRef.current = assignAllStandardsRequest;
    setActivePane('standards');
    assignStandards(true, generateAllConceptsModel)
      .catch((assignmentError) => setError(assignmentError instanceof Error ? assignmentError.message : 'Unable to assign chapter standards.'))
      .finally(onProcessingComplete);
  }, [assignAllStandardsRequest, assignStandards, conceptChapters.length, generateAllConceptsModel, isAssigningStandards, isFixingStandards, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage]);

  useEffect((): void => {
    if (
      fixAllStandardsRequest === handledFixAllStandardsRequestRef.current ||
      !conceptChapters.length ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters ||
      isAssigningStandards ||
      isFixingStandards
    ) {
      return;
    }

    handledFixAllStandardsRequestRef.current = fixAllStandardsRequest;
    setActivePane('standards');
    fixStandards(generateAllConceptsModel)
      .catch((fixError) => setError(fixError instanceof Error ? fixError.message : 'Unable to fix chapter standards.'))
      .finally(onProcessingComplete);
  }, [conceptChapters.length, fixAllStandardsRequest, fixStandards, generateAllConceptsModel, isAssigningStandards, isFixingStandards, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage]);

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

  const changeConceptChapter = useCallback((index: number): void => {
    if (!conceptChapters.length) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(index, conceptChapters.length - 1));
    const firstPage = conceptChapters[nextIndex]?.pageNumbers[0];

    if (firstPage !== undefined) {
      goToPage(firstPage);
    }
  }, [conceptChapters, goToPage]);
  const saveConcept = useCallback(async (concept: BookConcept, title: string, description: string): Promise<void> => {
    try {
      await saveBookConceptRecord(concept, title, description);
      const updated = { ...concept, description, title };
      const oldKey = conceptReferenceKey(concept);
      const firstPage = conceptFirstPageByKey.get(oldKey);

      setConcepts((current) => current.map((item) => item.id === concept.id ? updated : item));
      setConceptFirstPageByKey((current) => {
        const next = new Map(current);

        next.delete(oldKey);

        if (firstPage !== undefined) {
          next.set(conceptReferenceKey(updated), firstPage);
        }

        return next;
      });
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save the concept.';

      setError(message);
      throw caught;
    }
  }, [conceptFirstPageByKey]);
  const deleteConcept = useCallback(async (concept: BookConcept): Promise<void> => {
    if (concept.id === undefined) {
      return;
    }

    try {
      const pageNumbers = Array.from(pages.keys());
      const exercises = (await Promise.all(pageNumbers.map((conceptPageNumber) => getExercisesForBookPage([book.id, conceptPageNumber])))).flat();
      const referencedExercises = exercises.filter(({ conceptId, id }) => id !== undefined && conceptId === concept.id);

      for (const exercise of referencedExercises) {
        await deleteAbilities(exerciseAbilityModuleId(book.id, exercise.id as number));
        await deleteExercise(exercise.id as number);
      }

      await deleteBookConcept(concept.id);
      const referenceKey = conceptReferenceKey(concept);

      setConcepts((current) => current.filter(({ id }) => id !== concept.id));
      setConceptFirstPageByKey((current) => {
        const next = new Map(current);

        next.delete(referenceKey);

        return next;
      });
      setSkillsRefreshToken((value) => value + 1);
      await refreshEntityCounts();
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to delete the concept.';

      setError(message);
      throw caught;
    }
  }, [book.id, pages, refreshEntityCounts]);

  const submitPageInput = useCallback((): void => {
    const requestedPage = Number(pageInput);

    if (Number.isInteger(requestedPage)) {
      goToPage(requestedPage);
    } else {
      setPageInput(String(pageNumber));
    }
  }, [goToPage, pageInput, pageNumber]);

  const unrecognizedPageNumbers = useMemo(() => Array.from(
    { length: totalPages },
    (_, index) => index + 1
  ).filter((candidatePageNumber) => pages.get(candidatePageNumber)?.pageMMD === undefined), [pages, totalPages]);
  const isCurrentPageUnrecognized = unrecognizedPageNumbers.includes(pageNumber);
  const showUnrecognizedPages = hasRecognitionBeenAttempted && unrecognizedPageNumbers.length > 0;

  const recognizedTextPane = (): React.ReactNode => (
    <div className='tabPanel'>
      <div className='detailsHeader'>
        <span>{isRecognizingAll
          ? `Recognizing all pages… ${recognizedPageCount}/${totalPages}`
          : processingPage === pageNumber
            ? 'Recognizing page…'
            : 'Recognized text'}</span>
      </div>
      {pages.get(pageNumber)?.pageMMD !== undefined
        ? <div className='recognizedOutput'>
          {pages.get(pageNumber)?.pageMMD?.trim()
            ? <MathpixLoader>
              <MathpixMarkdown text={pages.get(pageNumber)?.pageMMD ?? ''} />
            </MathpixLoader>
            : <p className='emptyOutput'>No recognizable text was found on this page.</p>}
        </div>
        : <>
          <p className='emptyOutput'>This page has not been recognized yet.</p>
          {activePane === 'text' && hasRecognitionBeenAttempted && isCurrentPageUnrecognized && <div className='rerecognizePage'>
            <Button
              icon='rotate-left'
              isDisabled={processingPage !== undefined || isRecognizingAll || isGeneratingAllConcepts || isIdentifyingChapters}
              label={processingPage === pageNumber ? 'Recognizing…' : 'Rerecognize'}
              onClick={() => recognizePage().catch(console.error)}
            />
          </div>}
        </>}
    </div>
  );

  const languagePane = (): React.ReactNode => {
    const selectedLanguage = normalizeLanguageCode(book.language);

    return <div className='tabPanel languagePanel'>
      <div className='detailsHeader'>
        <span>{isDetectingBookLanguage ? 'Detecting book language…' : `Book language: ${bookLanguageLabel(book.language)}`}</span>
      </div>
      <div className='languageActions'>
        <Button
          icon='magic'
          isDisabled={!isMmdConversionComplete || isDetectingBookLanguage}
          label={isDetectingBookLanguage ? 'Detecting…' : 'Detect from text'}
          onClick={() => redetectBookLanguage().catch(console.error)}
        />
        <div
          aria-label='Choose book language'
          className='languageButtonGrid'
          role='group'
        >
          {BOOK_LANGUAGE_OPTIONS.map(({ text, value }) => <button
            aria-pressed={selectedLanguage === value}
            className={selectedLanguage === value ? 'selected' : ''}
            disabled={!isMmdConversionComplete || isDetectingBookLanguage}
            key={value}
            onClick={() => saveManualBookLanguage(value).catch(console.error)}
            type='button'
          >{text}</button>)}
        </div>
      </div>
    </div>;
  };

  const subjectPane = (): React.ReactNode => {
    const selectedSubject = normalizeBookSubject(book.subject);

    return <div className='tabPanel languagePanel'>
      <div className='detailsHeader'>
        <span>{isDetectingBookSubject ? 'Detecting book subject…' : `Book subject: ${bookSubjectLabel(book.subject)}`}</span>
      </div>
      <div className='languageActions'>
        <Button
          icon='magic'
          isDisabled={!book.language || !isMmdConversionComplete || isDetectingBookSubject}
          label={isDetectingBookSubject ? 'Detecting…' : 'Detect from text'}
          onClick={openSubjectDetectionConfirmation}
        />
        <div
          aria-label='Choose book subject'
          className='languageButtonGrid'
          role='group'
        >
          {BOOK_SUBJECT_OPTIONS.map(({ text, value }) => <button
            aria-pressed={selectedSubject === value}
            className={selectedSubject === value ? 'selected' : ''}
            disabled={!book.language || !isMmdConversionComplete || isDetectingBookSubject}
            key={value}
            onClick={() => saveManualBookSubject(value).catch(console.error)}
            type='button'
          >{text}</button>)}
        </div>
      </div>
    </div>;
  };

  const chaptersPane = (): React.ReactNode => {
    const evidence = currentBookPage ? pageChapterEvidence(currentBookPage) : undefined;
    const currentChapterPages = currentChapter?.id === undefined
      ? []
      : Array.from(pages.values()).filter(({ chapterId }) => chapterId === currentChapter.id).sort((a, b) => a.pageNumber - b.pageNumber);
    const isChapterStart = currentChapterPages[0]?.pageNumber === pageNumber;

    return <div className='tabPanel chaptersPanel'>
      <div className='detailsHeader'>
        <span>{isIdentifyingChapters ? `${chapterIdentificationLabel}… ${identifiedChapterPageCount}/${totalPages}` : 'Chapter assignment'}</span>
      </div>
      <div className='chapterEditor'>
        <h3>{currentChapter?.title || 'Unassigned page'}</h3>
        <p>Page {pageNumber} of {totalPages}. Automatic detection uses Mathpix title/section-header evidence plus a book-level AI reconciliation pass.</p>
        <label>Assign this page
          <select
            disabled={!chapters.length || isIdentifyingChapters}
            onChange={({ target }) => assignCurrentPageToChapter(Number(target.value)).catch(console.error)}
            value={currentChapter?.id ?? ''}
          >
            <option disabled value=''>Choose chapter</option>
            {chapters.flatMap((chapter) => chapter.id === undefined ? [] : [<option key={chapter.id} value={chapter.id}>{chapter.title}</option>])}
          </select>
        </label>
        <div className='chapterEditRow'>
          <Input
            isFull
            label='Chapter title'
            onChange={setChapterTitleDraft}
            onEnter={() => saveCurrentChapterTitle().catch(console.error)}
            value={chapterTitleDraft}
          />
          <Button
            icon='save'
            isDisabled={currentChapter?.id === undefined || !chapterTitleDraft.trim() || isIdentifyingChapters}
            label='Rename'
            onClick={() => saveCurrentChapterTitle().catch(console.error)}
          />
        </div>
        <div className='chapterEditRow'>
          <Input
            isFull
            label='New chapter starting on this page'
            onChange={setNewChapterTitle}
            onEnter={() => startChapterHere().catch(console.error)}
            placeholder='Chapter title'
            value={newChapterTitle}
          />
          <Button
            icon='plus'
            isDisabled={!newChapterTitle.trim() || isIdentifyingChapters}
            label='Start here'
            onClick={() => startChapterHere().catch(console.error)}
          />
        </div>
        <Button
          icon='link'
          isDisabled={!isChapterStart || chapters.findIndex(({ id }) => id === currentChapter?.id) <= 0 || isIdentifyingChapters}
          label='Merge with previous chapter'
          onClick={() => mergeCurrentChapterWithPrevious().catch(console.error)}
        />
        <section className='headingEvidence'>
          <h4>Mathpix heading evidence</h4>
          {evidence?.headings.length
            ? <ul>{evidence.headings.map(({ confidence, source, text, type }, index) => <li key={`${source}:${type}:${index}`}><strong>{type}</strong> ({source}{confidence === undefined ? '' : `, ${(confidence * 100).toFixed(0)}%`}): {text}</li>)}</ul>
            : <p className='emptyOutput'>No title or section header was detected on this page.</p>}
        </section>
        <section className='chapterList'>
          <h4>Book chapters</h4>
          <ol start={chapters[0]?.title.trim().toLocaleLowerCase().replace(/[\s-]+/g, '') === 'frontmatter' ? 0 : 1}>{chapters.map((chapter) => {
            const chapterPages = chapter.id === undefined ? [] : Array.from(pages.values()).filter(({ chapterId }) => chapterId === chapter.id).map(({ pageNumber }) => pageNumber).sort((a, b) => a - b);
            const first = chapterPages[0];
            const last = chapterPages[chapterPages.length - 1];

            return <li key={chapter.id ?? chapter.title}><button onClick={() => first && goToPage(first)} type='button'>{chapter.title}</button>{first ? ` — pages ${first}${last !== first ? `–${last}` : ''}` : ''}{chapter.source === 'manual' ? ' · manual' : chapter.confidence === undefined ? '' : ` · ${(chapter.confidence * 100).toFixed(0)}%`}</li>;
          })}</ol>
        </section>
      </div>
    </div>;
  };

  const conceptsStatus = isGeneratingAllConcepts
    ? `Generating concepts by chapter… ${generatedConceptsChapterCount}/${conceptChapters.length}`
    : isGeneratingAllExercises
      ? `Generating exercises… ${generatedExercisesPageCount}/${totalPages}`
      : isGeneratingChapterConcepts
        ? 'Extracting and saving concepts for this chapter…'
        : 'Concepts';
  const exerciseItem = (exercise: Exercise): React.ReactNode => {
    const description = stripMarkdownImageReferences(exercise.description);
    const n_a = t('N/A');

    return <li key={exercise.id}>
      <p><b>{t('Title:')} </b><KatexSpan content={exercise.title} /></p>
      
      <p><b>{t('Question:')} </b>{description ? <KatexSpan content={description} /> : n_a}</p>
      <p><b>{t('Question image:')} </b>{exercise.imageDescription ? <KatexSpan content={exercise.imageDescription} />: n_a}</p>
      <p><b>{t('Solution:')} </b>{exercise.solution ? <KatexSpan content={exercise.solution} />: n_a}</p>
      <p><b>{t('Answer image:')} </b>{exercise.solutionImageDescription ? <KatexSpan content={exercise.solutionImageDescription} /> : n_a}</p>
    </li>;
  };
  const conceptsPane = (): React.ReactNode => {
    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'>
        <span>{conceptsStatus}</span>
      </div>
      {!currentConceptChapter && <p className='recognitionHint'>Identify or assign this page to a chapter before generating concepts.</p>}
      <div className='conceptsOutput'>
        <h3>{currentConceptChapter?.title || pages.get(pageNumber)?.chapter || 'Chapter not identified'}</h3>
        <section className='conceptExerciseGroup'>
          <h3>Concepts</h3>
          {concepts.length
            ? <ul>{concepts.map((concept) => {
              const firstPage = conceptFirstPageByKey.get(conceptReferenceKey(concept));

              return <ConceptItem
                concept={concept}
                firstPage={firstPage}
                key={concept.id ?? conceptReferenceKey(concept)}
                onDelete={deleteConcept}
                onGoToPage={goToPage}
                onSave={saveConcept}
              />;
            })}</ul>
            : <p className='emptyOutput'>No concepts were parsed from this chapter.</p>}
        </section>
      </div>
    </div>;
  };

  const standardsPane = (): React.ReactNode => {
    const assignment = currentStandardsChapterKey === undefined ? undefined : standardsByChapter[currentStandardsChapterKey];
    const applicableFrameworks = STANDARD_FRAMEWORKS.map((framework) => ({
      ...framework,
      standards: assignment?.standards.filter(({ framework: standardFramework }) => standardFramework === framework.key) ?? []
    })).filter(({ standards }) => standards.length);

    return <div className='tabPanel standardsPanel'>
      <div className='detailsHeader'>
        <span>{isAssigningStandards ? `Identifying standards… ${standardsAssignedChapterCount}/${conceptChapters.length}` : isFixingStandards ? `Fixing standards… ${standardsFixedChapterCount}/${conceptChapters.length}` : 'Standards identified from chapter concepts'}</span>
      </div>
      <div className='conceptsOutput standardsOutput'>
        <h3>{currentStandardsChapter?.title || 'Chapter not identified'}</h3>
        {!currentStandardsChapter
          ? <p className='emptyOutput'>No processed chapters are available.</p>
          : (isAssigningStandards || isFixingStandards) && !assignment
            ? <p className='emptyOutput'>{isFixingStandards ? 'Standards for this chapter are being reviewed against the chapter concepts.' : 'Standards for this chapter are being matched against the chapter concepts.'}</p>
            : !assignment
              ? <p className='emptyOutput'>Standards have not been identified for this chapter yet.</p>
              : applicableFrameworks.length
                ? applicableFrameworks.map(({ key, label, standards }) => <section
                  className='standardsFramework'
                  key={key}
                >
                  <h4>{label}</h4>
                  <ul>{standards.map(({ code, framework }) => {
                    const description = standardDescriptions.get(`${framework}:${code}`);

                    return <li key={code}>
                      <code>{code}</code>
                      {description && <p>{description}</p>}
                    </li>;
                  })}</ul>
                </section>)
                : <p className='emptyOutput'>No applicable standards were identified for this chapter.</p>}
      </div>
      {(isAssigningStandards || isFixingStandards) && <small className='standardsSpend'>OpenRouter spend: {formatOpenRouterSpend(openRouterSpent)}</small>}
    </div>;
  };

  const exercisesPane = (): React.ReactNode => {
    const conceptIds = new Set(exerciseChapterConcepts.flatMap(({ id }) => id === undefined ? [] : [id]));
    const generatedWithoutConcept = exerciseChapterExercises.filter(({ conceptId, source }) => source === 'generated' && (conceptId === undefined || !conceptIds.has(conceptId)));

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
      {isSubjectDetectionConfirmationOpen && <Modal
        header='Detect book subject'
        onClose={closeSubjectDetectionConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{automaticBookSubjectForLanguage(book.language)
            ? 'This book is not in English, so its subject will be set to na automatically. You can change the stored subject manually afterward.'
            : 'Detect the primary subject from the middle recognized pages? You can change the result manually afterward.'}</p>
          <p>{subjectDetectionEstimate}</p>
          {!automaticBookSubjectForLanguage(book.language) && <Dropdown
            className='modelSelect'
            isFull
            label='Model'
            onChange={setSelectedSubjectModel}
            options={OPENAI_MODELS}
            value={selectedSubjectModel}
          />}
          <Button.Group>
            <Button
              icon='times'
              label='Cancel'
              onClick={closeSubjectDetectionConfirmation}
            />
            <Button
              icon='magic'
              label='Detect'
              onClick={confirmSubjectDetection}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isPageGenerationConfirmationOpen && <Modal
        header='Generate concepts'
        onClose={closePageGenerationConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{chapterGenerationEstimate}</p>
          <p>This sends the whole chapter to the AI in one request, deduplicates concepts across its pages, and saves each concept on the page where it was first introduced. Exercises in the book are ignored; generated exercises run in the next pipeline step.</p>
          <Dropdown
            className='modelSelect'
            isDisabled={processingPage !== undefined || isGeneratingAllConcepts || isIdentifyingChapters || isRecognizingAll}
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
      {(pendingProcessingAction || processingPage !== undefined || isDetectingBookLanguage || isDetectingBookSubject || isRecognizingAll || isIdentifyingChapters || isGeneratingAllConcepts || isAssigningStandards || isFixingStandards || isGeneratingAllExercises) && <div className='processingOverlay'>
        <RoundProgress
          total={isDetectingBookLanguage || isDetectingBookSubject || processingPage !== undefined ? 1 : isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isAssigningStandards || pendingProcessingAction === 'standards' || isFixingStandards || pendingProcessingAction === 'fixStandards' ? Math.max(1, conceptChapters.length) : Math.max(1, totalPages)}
          value={isDetectingBookLanguage || isDetectingBookSubject || processingPage !== undefined ? 0 : isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isIdentifyingChapters || pendingProcessingAction === 'chapters' ? identifiedChapterPageCount : isAssigningStandards || pendingProcessingAction === 'standards' ? standardsAssignedChapterCount : isFixingStandards || pendingProcessingAction === 'fixStandards' ? standardsFixedChapterCount : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? generatedExercisesPageCount : generatedConceptsChapterCount}
        />
        <strong>{isGeneratingChapterConcepts ? `Processing chapter ${currentConceptChapter?.title || ''}` : processingPage !== undefined ? `Processing page ${processingPage}` : isDetectingBookLanguage ? 'Detecting book language' : isDetectingBookSubject ? 'Detecting book subject' : isRecognizingAll || pendingProcessingAction === 'recognize' ? 'Recognizing MMD pages' : isIdentifyingChapters || pendingProcessingAction === 'chapters' ? chapterIdentificationLabel : isAssigningStandards || pendingProcessingAction === 'standards' ? 'Matching standards to chapter concepts' : isFixingStandards || pendingProcessingAction === 'fixStandards' ? 'Fixing standards from chapter concepts' : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? 'Generating exercises' : 'Extracting concepts by chapter'}</strong>
        {processingPage === undefined && !isDetectingBookLanguage && !isDetectingBookSubject && <span>{isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isIdentifyingChapters || pendingProcessingAction === 'chapters' ? identifiedChapterPageCount : isAssigningStandards || pendingProcessingAction === 'standards' ? standardsAssignedChapterCount : isFixingStandards || pendingProcessingAction === 'fixStandards' ? standardsFixedChapterCount : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? generatedExercisesPageCount : generatedConceptsChapterCount} / {isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isAssigningStandards || pendingProcessingAction === 'standards' || isFixingStandards || pendingProcessingAction === 'fixStandards' ? conceptChapters.length : totalPages}</span>}
        <span className='openRouterSpend'>Spent this stage: {formatOpenRouterSpend(openRouterSpent)}</span>
      </div>}
      <Skills
        book={book}
        externalRefreshToken={skillsRefreshToken}
        onAction={setActivePane}
        onBookChange={onBookChange}
        onContentChange={onSkillsContentChange}
        onEntityCountsChange={onSkillsEntityCountsChange}
        pipelineOnly
        pipelinePrefix={processingToolbar}
        pipelineSuffix={processingToolbarAfterFixImages}
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
          ['text', 'PDF/Text', 0, undefined],
          ['language', 'Language', 1, undefined],
          ['subject', 'Subject', 1, undefined],
          ['chapters', 'Chapters', 1, chapters.length],
          ['textConcepts', 'Concepts', 3, entityCounts.concepts],
          ['conceptExercises', 'Exercises', 4, entityCounts.exercises],
          ['preExercisesExercises', 'Abilities', 6, entityCounts.abilities],
          ['standards', 'Standards', 11, undefined],
          ['skillsCourse', 'Course', 8, undefined]
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
        className={`readerColumns${activePane === 'textConcepts' ? ' conceptColumns' : ''}`}
        role='tabpanel'
      >
        {(activePane === 'pdf' || activePane === 'text' || activePane === 'chapters') && <div className='pageNavigation'>
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
          {activePane === 'text' && showUnrecognizedPages && <select
            aria-label='Unrecognized pages'
            className='unrecognizedPages'
            onChange={({ target }) => {
              const requestedPage = Number(target.value);

              if (Number.isInteger(requestedPage) && requestedPage > 0) {
                goToPage(requestedPage);
              }
            }}
            value={unrecognizedPageNumbers.includes(pageNumber) ? pageNumber : ''}
          >
            <option value=''>Unrecognized pages ({unrecognizedPageNumbers.length})</option>
            {unrecognizedPageNumbers.map((unrecognizedPageNumber) => <option
              key={unrecognizedPageNumber}
              value={unrecognizedPageNumber}
            >Page {unrecognizedPageNumber}</option>)}
          </select>}
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
        {activePane === 'standards' && <div className='chapterNavigation'>
          <Button
            icon='arrow-left'
            isDisabled={standardsChapterIndex <= 0}
            onClick={() => changeStandardsChapter(standardsChapterIndex - 1)}
          />
          <label>Chapter <select
            aria-label='Navigate standards chapters'
            disabled={!conceptChapters.length}
            onChange={({ target }) => changeStandardsChapter(Number(target.value))}
            value={conceptChapters.length ? standardsChapterIndex : ''}
          >
            {conceptChapters.map(({ chapterId, pageNumbers, title }, index) => <option
              key={standardsChapterKey(chapterId, title, pageNumbers)}
              value={index}
            >{title || 'Chapter not identified'}</option>)}
          </select><span>{conceptChapters.length ? `${standardsChapterIndex + 1} of ${conceptChapters.length}` : 'No chapters'}</span></label>
          <Button
            icon='arrow-right'
            isDisabled={!conceptChapters.length || standardsChapterIndex >= conceptChapters.length - 1}
            onClick={() => changeStandardsChapter(standardsChapterIndex + 1)}
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
        {activePane === 'pdf'
          ? <div
            className='pageArea fullWidthPage'
            ref={pageAreaRef}
          ><canvas ref={canvasRef} /></div>
          : activePane === 'text'
            ? <>
              <div
                className='pageArea'
                ref={pageAreaRef}
              ><canvas ref={canvasRef} /></div>
              <div
                className={`detailsArea${renderedPageHeight ? ' hasPageHeight' : ''}`}
                style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
              >
                {recognizedTextPane()}
              </div>
            </>
            : activePane === 'language'
              ? <div className='detailsArea fullWidthDetails languageDetails'>{languagePane()}</div>
              : activePane === 'subject'
                ? <div className='detailsArea fullWidthDetails languageDetails'>{subjectPane()}</div>
              : activePane === 'chapters'
                ? <>
                  <div
                    className='pageArea'
                    ref={pageAreaRef}
                  ><canvas ref={canvasRef} /></div>
                  <div className='detailsArea'>{chaptersPane()}</div>
                </>
                : activePane === 'textConcepts'
                  ? <>
                    <div className='conceptPaneColumn'>
                      <div className='pageNavigation compactPageNavigation conceptPaneNavigation'>
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
                      </div>
                      <div
                        className={`detailsArea${renderedPageHeight ? ' hasPageHeight' : ''}`}
                        style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
                      >
                        {recognizedTextPane()}
                      </div>
                    </div>
                    <div className='conceptPaneColumn'>
                      <div className='chapterNavigation conceptPaneNavigation'>
                        <Button
                          icon='arrow-left'
                          isDisabled={!conceptChapters.length || conceptChapterIndex <= 0}
                          onClick={() => changeConceptChapter(conceptChapterIndex - 1)}
                        />
                        <label>Chapter <select
                          aria-label='Navigate chapters'
                          disabled={!conceptChapters.length}
                          onChange={({ target }) => changeConceptChapter(Number(target.value))}
                          value={conceptChapters.length ? conceptChapterIndex : ''}
                        >
                          {conceptChapters.map(({ chapterId, pageNumbers, title }, index) => <option
                            key={standardsChapterKey(chapterId, title, pageNumbers)}
                            value={index}
                          >{title || 'Chapter not identified'}</option>)}
                        </select><span>{conceptChapters.length ? `${conceptChapterIndex + 1} of ${conceptChapters.length}` : 'No chapters'}</span></label>
                        <Button
                          icon='arrow-right'
                          isDisabled={!conceptChapters.length || conceptChapterIndex >= conceptChapters.length - 1}
                          onClick={() => changeConceptChapter(conceptChapterIndex + 1)}
                        />
                      </div>
                      <div
                        className='detailsArea'
                        style={{ '--page-height': renderedPageHeight ? `${renderedPageHeight}px` : 'auto' } as React.CSSProperties}
                      >
                        {conceptsPane()}
                      </div>
                    </div>
                  </>
                  : activePane === 'standards'
                    ? <div className='detailsArea fullWidthDetails'>{standardsPane()}</div>
                    : activePane === 'conceptExercises'
                      ? <div className='detailsArea fullWidthDetails'>{exercisesPane()}</div>
                      : activePane === 'conceptsSkills'
                      ? <>
                        <div className='skillsArea'>
                          <Skills
                            book={book}
                            externalRefreshToken={skillsRefreshToken}
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
                          externalRefreshToken={skillsRefreshToken}
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
    grid-template-rows: auto minmax(0, 1fr);
    height: auto;
    min-height: 0;
  }

  &.isMaximized .readerColumns.conceptColumns {
    grid-template-rows: minmax(0, 1fr);
  }

  &.isMaximized .conceptPaneColumn {
    height: 100%;
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
    grid-template-columns: auto auto auto minmax(10rem, 1fr);
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

  .conceptPaneColumn {
    display: flex;
    flex-direction: column;
    min-height: 0;
    min-width: 0;
  }

  .conceptPaneColumn > .detailsArea {
    flex: 1;
  }

  .conceptPaneNavigation {
    grid-column: auto;
  }

  .compactPageNavigation {
    grid-template-columns: auto auto auto;
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

  .languageDetails { height: auto; min-height: 0; }
  .languagePanel { min-height: 0; }
  .languageActions { align-items: flex-start; display: flex; flex-direction: column; gap: 1rem; padding: 0.25rem 0; }
  .languageButtonGrid { display: flex; flex-wrap: wrap; gap: 0.5rem; }
  .languageButtonGrid button { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.35rem; color: var(--color-text); cursor: pointer; padding: 0.55rem 0.75rem; }
  .languageButtonGrid button:hover:not(:disabled), .languageButtonGrid button.selected { border-color: var(--color-primary, #2f6feb); }
  .languageButtonGrid button.selected { font-weight: 600; }
  .languageButtonGrid button:disabled { cursor: default; opacity: 0.5; }

  .chaptersPanel .chapterEditor { display: flex; flex-direction: column; gap: 1rem; }
  &.isMaximized .chaptersPanel .chapterEditor { flex: 1; min-height: 0; overflow-y: auto; padding-right: 0.25rem; }
  .chaptersPanel .chapterEditor > h3, .chaptersPanel .chapterEditor > p { margin: 0; }
  .chaptersPanel .chapterEditor label { display: flex; flex-direction: column; gap: 0.4rem; }
  .chaptersPanel .chapterEditor select { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.25rem; color: var(--color-text); padding: 0.55rem; width: 100%; }
  .chapterEditRow { align-items: flex-end; display: grid; gap: 0.5rem; grid-template-columns: minmax(0, 1fr) auto; }
  .headingEvidence, .chapterList { border-top: 1px solid #dde1eb; padding-top: 0.75rem; }
  .headingEvidence h4, .chapterList h4 { margin: 0 0 0.5rem; }
  .headingEvidence ul, .chapterList ol { margin: 0; padding-left: 1.4rem; }
  .chapterList li { margin: 0.35rem 0; }
  .chapterList button { background: none; border: 0; color: var(--color-link, #2f6feb); cursor: pointer; padding: 0; text-align: left; }

  .processingOverlay { align-items: center; background: color-mix(in srgb, var(--bg-page) 92%, transparent); display: flex; flex-direction: column; gap: 0.75rem; inset: 0; justify-content: center; position: fixed; z-index: 1000; }
  .openRouterSpend { font-variant-numeric: tabular-nums; opacity: 0.85; }

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

  .unrecognizedPages {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    grid-column: 4;
    grid-row: 2;
    justify-self: start;
    max-width: 14rem;
    padding: 0.55rem;
  }

  .rerecognizePage {
    display: flex;
    justify-content: flex-start;
    padding-top: 0.75rem;
  }

  .pageScroller {
    cursor: pointer;
    grid-column: 4;
    grid-row: 1;
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

  .fullWidthDetails, .fullWidthPage {
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
    flex-wrap: wrap;
    row-gap: 0;
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
    white-space: nowrap;
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

  .standardsPanel .detailsHeader {
    gap: 1rem;
  }

  .standardsPanel .generationControls {
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .standardsFramework + .standardsFramework {
    border-top: 1px solid #dde1eb;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .standardsFramework h4 {
    margin: 0 0 0.5rem;
  }

  .standardsFramework ul {
    margin: 0;
    padding-left: 1.4rem;
  }

  .standardsFramework code {
    font-size: 0.95em;
  }

  .standardsSpend {
    margin-top: 0.6rem;
    opacity: 0.8;
  }

  .conceptsOutput li + li {
    margin-top: 1rem;
  }

  .conceptsOutput p {
    margin: 0.25rem 0 0;
  }


  .conceptItem { position: relative; }
  .conceptHeading { align-items: flex-start; display: flex; gap: 0.75rem; justify-content: space-between; }
  .conceptHeading > strong { flex: 1; min-width: 0; overflow-wrap: anywhere; text-align: left; }
  .conceptActions { align-items: center; display: flex; flex-shrink: 0; gap: 0.35rem; }
  .conceptPageLink { background: none; border: 0; color: var(--color-link, #2f6feb); cursor: pointer; font: inherit; padding: 0; text-decoration: underline; }
  .conceptPageLink:hover { text-decoration-thickness: 2px; }
  .conceptEditForm { display: flex; flex-direction: column; gap: 0.65rem; }
  .conceptEditForm > label { display: flex; flex-direction: column; gap: 0.35rem; }
  .conceptEditForm textarea { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.25rem; box-sizing: border-box; color: var(--color-text); font: inherit; padding: 0.55rem; resize: vertical; width: 100%; }
  .conceptEditForm .conceptActions { justify-content: flex-end; }

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
      grid-template-columns: auto 1fr auto;
    }

    .pageScroller {
      grid-column: 1 / -1;
      grid-row: auto;
    }

    .unrecognizedPages {
      grid-column: 1 / -1;
      grid-row: auto;
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
