// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, BookProcessingStageKey, BookStageSpendKey, Exercise, MathpixHeading } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { addBookStageSpend, assignBookPageChapter, completeBookProcessingStage, createBookConcept, deleteAbilities, deleteBookChapters, deleteBookConcept, deleteExercise, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, incrementBookFixConceptsAttempts, isBookProcessingStageComplete, mergeBookChapterWithPrevious, putBook, putBookPage, reorderBookConcepts, replaceAbilities, replaceBookChapterAssignments, replaceExercisesForBookPage, replaceParsedBookPageContent, resetBookProcessingStagesFrom, SettingKey, splitBookChapterAtPage, storeSetting, updateBookChapterTitle, updateBookConcept, withBookProcessingStagesResetFrom, withCompletedBookProcessingStage } from '@slonigiraf/db';
import { Confirmation, KatexSpan, RoundProgress, SelectableList } from '@slonigiraf/slonig-components';
import { strFromU8, unzipSync } from 'fflate';
import MathpixLoader from 'mathpix-markdown-it/lib/components/mathpix-loader/index.js';
import MathpixMarkdown from 'mathpix-markdown-it/lib/components/mathpix-markdown/index.js';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, Input, Modal, styled } from '@polkadot/react-components';

import { parseStoredAbility } from './abilities.js';
import { estimateAiInput } from './aiEstimate.js';
import { bookAgeLabel, getBookAgeSamplePageNumbers, MAX_BOOK_LEARNER_AGE, MIN_BOOK_LEARNER_AGE, normalizeBookAge, parseDetectedBookAge } from './bookAge.js';
import { BOOK_LANGUAGE_OPTIONS, bookLanguageLabel, getMiddleBookPageNumbers, normalizeLanguageCode, parseDetectedBookLanguage } from './bookLanguage.js';
import { BOOK_SUBJECT_OPTIONS, automaticBookSubjectForLanguage, bookSubjectLabel, normalizeBookSubject, parseDetectedBookSubject } from './bookSubject.js';
import { areAllBookPagesConceptsProcessed, countUnprocessedBookPages, processExtractedChapterContent } from './bookProcessing.js';
import { mapConcurrent } from './concurrency.js';
import { OPENROUTER_CONCURRENCY, openRouterRequestGate } from './openRouterConcurrency.js';
import OpenRouterModelSelector from './OpenRouterModelSelector.js';
import { chapterLevelMissingConcept, fixChapterConceptsPrompt, parseMissingChapterConcepts, type MissingChapterConcept } from './fixConcepts.js';
import { clearFixConceptsChapterStatuses, fixConceptsChapterKey, loadFixConceptsChapterStatuses, storeFixConceptsChapterStatuses, type FixConceptsChapterStatuses } from './fixConceptsProgress.js';
import { formatOpenRouterSpend, reportOpenRouterCost, type OpenRouterCostReporter } from './openRouterCost.js';
import { BOOK_AGE_DETECTION_PROMPT, BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT, BOOK_LANGUAGE_DETECTION_PROMPT, BOOK_SUBJECT_DETECTION_PROMPT, MATHPIX_PDF_PAGE_PRICE_USD, OPENAI_MODELS } from './constants.js';
import { stripMarkdownImageReferences } from './bookImageRefs.js';
import { chapterAssignmentsFromBoundaries, chapterEvidenceWindows, chapterReconciliationPrompt, chapterWindowPrompt, deriveStructuralChapterCandidates, extractMathpixHeadingsFromLines, pageChapterEvidence, parseChapterBoundaries, stabilizeChapterBoundaries, type ChapterBoundaryProposal } from './chapterSegmentation.js';
import { getSharedChapterSelection, resolveSharedChapterIndex, storeSharedChapterSelection, subscribeSharedChapterSelection, type SharedChapterSelection } from './chapterSelection.js';
import { conceptChaptersFromPages, parseGeneratedChapterConcepts, type ConceptChapterNavigationItem, type GeneratedChapterConcepts } from './conceptRecognition.js';
import { missingGeneratedExerciseConceptIndexes } from './exercises.js';
import { loadStandardsCatalogsForBookSubject, loadStoredBookStandards, mergeStandardsMatches, parseStandardsFixResult, parseStandardsMatches, STANDARD_FRAMEWORKS, STANDARDS_FIX_RUNS, STANDARDS_MATCH_RUNS, standardsChapterKey, standardsConceptFingerprint, standardsConceptInputs, standardsFixInputs, standardsFixPrompt, standardsMatchingPrompt, standardsPathForBookSubject, storeBookStandards, type CurriculumStandard, type StandardsCatalog, type StandardsConceptInput, type StoredBookStandards } from './standards.js';
import Skills, { type PipelineAction } from './Skills.js';
import SkillsCourse from './SkillsCourse.js';
import { extractPdfOutlineChapterBoundaries, loadPdfJs } from './pdf.js';
import { AiPriceEstimate } from './PriceEstimate.js';
import { useTranslation } from './translate.js';

export { OPENAI_MODELS } from './constants.js';


interface ChapterConceptInputPage {
  input: MMDZipInput;
  pageNumber: number;
}


function conceptDisplayOrder (concept: BookConcept): number | undefined {
  return Number.isFinite(concept.displayOrder) ? concept.displayOrder : undefined;
}

function sortConceptsForDisplay (concepts: BookConcept[]): BookConcept[] {
  return concepts
    .map((concept, index) => ({ concept, index, order: conceptDisplayOrder(concept) }))
    .sort((a, b) => (a.order ?? a.index) - (b.order ?? b.index) || a.index - b.index)
    .map(({ concept }) => concept);
}

function conceptInsertionDisplayOrder (concepts: BookConcept[], insertionIndex: number): number {
  const previousIndex = insertionIndex - 1;
  const previousOrder = previousIndex >= 0
    ? conceptDisplayOrder(concepts[previousIndex]) ?? previousIndex
    : undefined;
  const nextOrder = insertionIndex < concepts.length
    ? conceptDisplayOrder(concepts[insertionIndex]) ?? insertionIndex
    : undefined;

  if (previousOrder === undefined) {
    return (nextOrder ?? 0) - 1;
  }

  if (nextOrder === undefined) {
    return previousOrder + 1;
  }

  return previousOrder + ((nextOrder - previousOrder) / 2);
}

function conceptDisplayPage (concept: BookConcept): number | undefined {
  const pageNumber = concept.bookPage[1];

  return pageNumber > 0 ? pageNumber : undefined;
}

function analysisPageNumbers (pages: BookPage[]): number[] {
  return pages.flatMap(({ excludedFromAnalysis, pageNumber }) => excludedFromAnalysis ? [] : [pageNumber]);
}

function ConceptItem ({ concept, conceptNumber, firstPage, onDelete, onGoToPage, onReorderPointerCancel, onReorderPointerDown, onReorderPointerMove, onReorderPointerUp, onSave }: { concept: BookConcept; conceptNumber: number; firstPage?: number; onDelete: (concept: BookConcept) => Promise<void>; onGoToPage: (pageNumber: number) => void; onReorderPointerCancel?: (event: React.PointerEvent<HTMLLIElement>) => void; onReorderPointerDown?: (event: React.PointerEvent<HTMLLIElement>) => void; onReorderPointerMove?: (event: React.PointerEvent<HTMLLIElement>) => void; onReorderPointerUp?: (event: React.PointerEvent<HTMLLIElement>) => void; onSave: (concept: BookConcept, title: string, description: string) => Promise<void> }): React.ReactElement {
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
    if (isBusy) {
      return;
    }

    setTitle(concept.title);
    setDescription(concept.description);
    setIsEditing(false);
  }, [concept.description, concept.title, isBusy]);
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

  const canReorder = concept.id !== undefined && !isBusy && !isEditing;

  return <li
    className='conceptItem'
    data-concept-id={concept.id}
    onLostPointerCapture={canReorder ? onReorderPointerCancel : undefined}
    onPointerCancel={canReorder ? onReorderPointerCancel : undefined}
    onPointerDown={canReorder ? onReorderPointerDown : undefined}
    onPointerMove={canReorder ? onReorderPointerMove : undefined}
    onPointerUp={canReorder ? onReorderPointerUp : undefined}
    tabIndex={-1}
  >
    <strong className='conceptDragTitle'><span className='conceptNumber'>{conceptNumber}.</span> <KatexSpan content={concept.title} /></strong>
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
    {isEditing && <Modal
      header='Edit concept'
      onClose={cancel}
      size='small'
    >
      <Modal.Content>
        <ConceptForm>
          <Input
            autoFocus
            isDisabled={isBusy}
            isFull
            label='Concept title'
            onChange={setTitle}
            onEnter={save}
            value={title}
          />
          <label>
            <span>Description</span>
            <textarea
              disabled={isBusy}
              onChange={({ target }) => setDescription(target.value)}
              rows={5}
              value={description}
            />
          </label>
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isBusy}
              label='Cancel'
              onClick={cancel}
            />
            <Button
              icon='save'
              isDisabled={isBusy || !title.trim() || (title.trim() === concept.title && description.trim() === concept.description)}
              label={isBusy ? 'Saving…' : 'Save'}
              onClick={save}
            />
          </Button.Group>
        </ConceptForm>
      </Modal.Content>
    </Modal>}
    <div className='conceptHeading'>
      <span
        className='conceptDragHandle'
        title='Drag to reorder'
      >⋮⋮</span>
      <strong><span className='conceptNumber'>{conceptNumber}.</span> <KatexSpan content={concept.title} /></strong>
      <div className='conceptActions'>
        <Button
          icon='edit'
          isDisabled={concept.id === undefined || isBusy}
          onClick={() => setIsEditing(true)}
        />
        <Button
          icon='trash'
          isDisabled={concept.id === undefined || isBusy}
          onClick={remove}
        />
      </div>
    </div>
    <div className='conceptMeta'>
      <span
        aria-label={`Fix Concepts attempt ${concept.attempt ?? 0}`}
        className='conceptAttemptLabel'
        title={`Fix Concepts attempt ${concept.attempt ?? 0}`}
      >{concept.attempt ?? 0} attempt</span>
      {firstPage !== undefined && <button
        className='conceptPageLink'
        onClick={() => onGoToPage(firstPage)}
        type='button'
      >{concept.manuallyAdded ? `Page ${firstPage}` : `Introduced at page ${firstPage}`}</button>}
    </div>
    {concept.description && <p className='conceptDescription'><KatexSpan content={concept.description} /></p>}
  </li>;
}

const ConceptForm = styled.div`
  box-sizing: border-box;
  display: grid;
  gap: 1rem;
  margin: 0 auto;
  max-width: 42rem;
  padding: 0.25rem 0;
  width: 100%;

  > .ui--Labelled,
  > .ui--Dropdown,
  > label {
    margin: 0;
    width: 100%;
  }

  > label {
    color: var(--color-text);
    display: grid;
    font-weight: 600;
    gap: 0.4rem;
    text-align: left;
    text-transform: none;
  }

  > label > span {
    line-height: 1.25;
    text-transform: none;
  }

  textarea {
    background: var(--bg-input, #fff);
    border: 1px solid var(--border-table, #cfd5e1);
    border-radius: 0.45rem;
    box-sizing: border-box;
    color: var(--color-text);
    font: inherit;
    font-weight: 400;
    line-height: 1.45;
    margin: 0;
    min-height: 6.5rem;
    outline: none;
    padding: 0.65rem 0.75rem;
    resize: vertical;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  textarea:focus {
    border-color: var(--color-primary, #1682d4);
    box-shadow: 0 0 0 2px rgba(22, 130, 212, 0.12);
  }

  textarea:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  @media only screen and (max-width: 600px) {
    gap: 0.8rem;
  }
`;

const FixConceptsReviewContent = styled.div`
  .fixConceptsReviewIntro {
    align-items: flex-end;
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem 1rem;
    justify-content: space-between;
    margin-bottom: 1rem;
  }

  .fixConceptsReviewIntro > p {
    flex: 1 1 28rem;
    margin: 0;
  }

  .fixConceptsReviewIntro > label {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .fixConceptsReviewIntro select {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    font: inherit;
    max-width: 24rem;
    padding: 0.5rem;
  }

  .fixConceptsReviewComparison {
    min-width: 0;
  }

  .fixConceptsReviewRow {
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }

  .fixConceptsReviewRow.isUnchanged {
    grid-template-columns: minmax(0, 1fr);
  }

  .fixConceptsReviewChangeLabel {
    display: block;
    font-size: 0.82rem;
    font-weight: 600;
    line-height: 1.2;
    margin: 0;
    opacity: 0.72;
    padding-left: 0.1rem;
  }

  .fixConceptsDifference h3 {
    margin: 0 0 0.6rem;
  }

  .fixConceptsDifference h4 {
    margin: 0.8rem 0 0.2rem;
  }

  .fixConceptsReviewConcepts {
    border: 1px solid #dde1eb;
    border-radius: 0.5rem;
    box-sizing: border-box;
    display: grid;
    gap: 0.7rem;
    max-height: min(48vh, 36rem);
    min-height: 14rem;
    overflow: auto;
    padding: 0.75rem;
  }

  .fixConceptsReviewRow {
    align-items: stretch;
  }

  .fixConceptsReviewCell {
    min-width: 0;
  }

  .fixConceptsReviewCell.isBefore,
  .fixConceptsReviewCell.isAfter {
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
  }

  .fixConceptsReviewCell.isBefore > .fixConceptsReviewCard,
  .fixConceptsReviewCell.isAfter > .fixConceptsReviewCard,
  .fixConceptsReviewCell.isBefore > .fixConceptsReviewMissingBefore,
  .fixConceptsReviewCell.isAfter > .fixConceptsReviewMissingBefore {
    flex: 1 1 auto;
  }

  .fixConceptsReviewCard {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.6rem;
    box-sizing: border-box;
    padding: 0.8rem 0.9rem;
  }

  .fixConceptsReviewCard.isProposed {
    border-color: var(--color-primary, #1682d4);
    box-shadow: inset 3px 0 0 var(--color-primary, #1682d4);
  }

  .fixConceptsReviewCard p {
    line-height: 1.5;
    margin: 0.45rem 0 0;
  }

  .fixConceptsReviewMissingBefore {
    align-items: center;
    border: 1px dashed #dde1eb;
    border-radius: 0.6rem;
    box-sizing: border-box;
    display: flex;
    justify-content: center;
    min-height: 4.5rem;
    opacity: 0.65;
    padding: 0.8rem 0.9rem;
    text-align: center;
  }

  .fixConceptsReviewRemovedAfter {
    align-items: center;
    border: 1px dashed rgba(180, 70, 70, 0.45);
    border-radius: 0.6rem;
    box-sizing: border-box;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    min-height: 4.5rem;
    padding: 0.8rem 0.9rem;
  }

  .fixConceptsReviewRemovedAfter > span:first-child {
    font-weight: 600;
    opacity: 0.75;
  }

  .fixConceptsReviewConceptHeading {
    align-items: flex-start;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }

  .fixConceptsReviewConceptHeading > strong {
    line-height: 1.35;
    min-width: 0;
    overflow-wrap: anywhere;
  }

  .fixConceptsReviewMeta {
    align-items: center;
    display: flex;
    flex-shrink: 0;
    gap: 0.35rem;
  }

  .fixConceptsReviewPage,
  .fixConceptsReviewProposed {
    border-radius: 999px;
    font-size: 0.78em;
    line-height: 1.2;
    padding: 0.25rem 0.5rem;
    white-space: nowrap;
  }

  .fixConceptsReviewPage {
    background: rgba(47, 111, 235, 0.08);
    border: 1px solid rgba(47, 111, 235, 0.18);
  }

  .fixConceptsReviewProposed {
    background: rgba(22, 130, 212, 0.12);
    border: 1px solid rgba(22, 130, 212, 0.28);
    font-weight: 600;
  }

  .fixConceptsReviewEmpty {
    margin: 0;
    opacity: 0.7;
  }

  .fixConceptsDifference {
    border-top: 1px solid #dde1eb;
    margin-top: 1rem;
    padding-top: 1rem;
  }

  .fixConceptsDifference p {
    margin: 0.25rem 0;
  }

  .fixConceptsDifference ul {
    margin: 0.6rem 0 0;
    padding-left: 1.4rem;
  }

  .fixConceptsReviewWarning {
    border: 1px solid rgba(180, 120, 20, 0.35);
    border-radius: 0.5rem;
    margin: 1rem 0 0;
    padding: 0.7rem 0.8rem;
  }

  @media (max-width: 760px) {
    .fixConceptsReviewRow {
      gap: 0.6rem;
      grid-template-columns: 1fr;
    }

    .fixConceptsReviewConcepts {
      max-height: 44vh;
    }

    .fixConceptsReviewIntro > label {
      align-items: stretch;
      flex: 1 1 100%;
      flex-wrap: wrap;
      white-space: normal;
    }

    .fixConceptsReviewIntro select {
      flex: 1;
      max-width: none;
      min-width: 12rem;
    }
  }

`;


const CONCEPT_REQUEST_MAX_ATTEMPTS = 4;
const CONCEPT_RETRY_BASE_DELAY_MS = 1_000;

function conceptRequestErrorStatus (error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === 'number' ? status : undefined;
}

function conceptRetryAfterMs (error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('headers' in error)) {
    return undefined;
  }

  const headers = (error as { headers?: unknown }).headers;
  let retryAfter: unknown;

  if (typeof headers === 'object' && headers !== null && 'get' in headers && typeof (headers as { get?: unknown }).get === 'function') {
    retryAfter = (headers as { get: (name: string) => unknown }).get('retry-after');
  } else if (typeof headers === 'object' && headers !== null) {
    const record = headers as Record<string, unknown>;

    retryAfter = record['retry-after'] ?? record['Retry-After'];
  }

  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
    return Math.max(0, retryAfter * 1_000);
  }

  if (typeof retryAfter !== 'string' || !retryAfter.trim()) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const date = Date.parse(retryAfter);

  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isRetryableConceptRequestError (error: unknown): boolean {
  const status = conceptRequestErrorStatus(error);

  if (status !== undefined) {
    return status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 599);
  }

  if (typeof error !== 'object' || error === null || !('name' in error)) {
    return false;
  }

  const name = (error as { name?: unknown }).name;

  return name === 'APIConnectionError' || name === 'APITimeoutError';
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

async function waitForConceptRetry (milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function runConceptRequestWithRetry<T>(request: () => Promise<T>): Promise<T> {
  let lastError: unknown;

  for (let attempt = 0; attempt < CONCEPT_REQUEST_MAX_ATTEMPTS; attempt++) {
    try {
      return await openRouterRequestGate.run(request);
    } catch (error) {
      lastError = error;

      if (!isRetryableConceptRequestError(error) || attempt === CONCEPT_REQUEST_MAX_ATTEMPTS - 1) {
        throw error;
      }

      const backoff = conceptRetryAfterMs(error) ?? CONCEPT_RETRY_BASE_DELAY_MS * (2 ** attempt);

      openRouterRequestGate.pause(backoff);
      await waitForConceptRetry(backoff);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('OpenRouter concept request failed after retries.');
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

type ExerciseEditableFields = Pick<Exercise, 'description' | 'imageDescription' | 'solution' | 'solutionImageDescription' | 'title'>;

function exerciseForPageReplacement ({ conceptId, description, imageDescription, solution, solutionImageDescription, source, title }: Exercise): Omit<Exercise, 'bookPage' | 'id'> {
  return {
    conceptId,
    description: stripMarkdownImageReferences(description),
    imageDescription,
    solution,
    solutionImageDescription,
    source,
    title
  };
}

function EditableExerciseItem ({ exercise, onError, onSave }: { exercise: Exercise; onError: (message: string) => void; onSave: (exerciseId: number, value: ExerciseEditableFields) => Promise<void> }): React.ReactElement {
  const { t } = useTranslation();
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draftTitle, setDraftTitle] = useState(exercise.title);
  const [draftDescription, setDraftDescription] = useState(stripMarkdownImageReferences(exercise.description));
  const [draftImageDescription, setDraftImageDescription] = useState(exercise.imageDescription ?? '');
  const [draftSolution, setDraftSolution] = useState(exercise.solution ?? '');
  const [draftSolutionImageDescription, setDraftSolutionImageDescription] = useState(exercise.solutionImageDescription ?? '');
  const n_a = t('N/A');

  const openEdit = useCallback((): void => {
    setDraftTitle(exercise.title);
    setDraftDescription(stripMarkdownImageReferences(exercise.description));
    setDraftImageDescription(exercise.imageDescription ?? '');
    setDraftSolution(exercise.solution ?? '');
    setDraftSolutionImageDescription(exercise.solutionImageDescription ?? '');
    setIsEditing(true);
  }, [exercise.description, exercise.imageDescription, exercise.solution, exercise.solutionImageDescription, exercise.title]);
  const closeEdit = useCallback((): void => {
    if (!isSaving) {
      setIsEditing(false);
    }
  }, [isSaving]);
  const save = useCallback((): void => {
    if (exercise.id === undefined || !draftTitle.trim()) {
      return;
    }

    setIsSaving(true);
    onSave(exercise.id, {
      description: draftDescription.trim(),
      imageDescription: draftImageDescription.trim(),
      solution: draftSolution.trim(),
      solutionImageDescription: draftSolutionImageDescription.trim(),
      title: draftTitle.trim()
    })
      .then(() => setIsEditing(false))
      .catch((error) => onError(error instanceof Error ? error.message : 'Unable to save the Exercise.'))
      .finally(() => setIsSaving(false));
  }, [draftDescription, draftImageDescription, draftSolution, draftSolutionImageDescription, draftTitle, exercise.id, onError, onSave]);

  const description = stripMarkdownImageReferences(exercise.description);

  return <li className='exerciseItem'>
    <div className='exerciseHeading'>
      <p><b>{t('Title:')} </b><KatexSpan content={exercise.title} /></p>
      <Button
        icon='edit'
        isDisabled={exercise.id === undefined}
        label='Edit'
        onClick={openEdit}
      />
    </div>
    <p><b>{t('Question:')} </b>{description ? <KatexSpan content={description} /> : n_a}</p>
    <p><b>{t('Question image:')} </b>{exercise.imageDescription ? <KatexSpan content={exercise.imageDescription} /> : n_a}</p>
    <p><b>{t('Solution:')} </b>{exercise.solution ? <KatexSpan content={exercise.solution} /> : n_a}</p>
    <p><b>{t('Answer image:')} </b>{exercise.solutionImageDescription ? <KatexSpan content={exercise.solutionImageDescription} /> : n_a}</p>
    {isEditing && <Modal
      header='Edit Exercise'
      onClose={closeEdit}
      size='small'
    >
      <Modal.Content>
        <ExerciseEditForm>
          <label>
            <span>Title</span>
            <input
              disabled={isSaving}
              onChange={({ target }) => setDraftTitle(target.value)}
              type='text'
              value={draftTitle}
            />
          </label>
          <label>
            <span>Task</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftDescription(target.value)}
              rows={5}
              value={draftDescription}
            />
          </label>
          <label>
            <span>Required visual description</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftImageDescription(target.value)}
              rows={3}
              value={draftImageDescription}
            />
          </label>
          <label>
            <span>Solution</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftSolution(target.value)}
              rows={5}
              value={draftSolution}
            />
          </label>
          <label>
            <span>Solution visual description</span>
            <textarea
              disabled={isSaving}
              onChange={({ target }) => setDraftSolutionImageDescription(target.value)}
              rows={3}
              value={draftSolutionImageDescription}
            />
          </label>
          <div className='exerciseEditActions'>
            <Button
              icon='times'
              isDisabled={isSaving}
              label='Cancel'
              onClick={closeEdit}
            />
            <Button
              icon='save'
              isDisabled={isSaving || !draftTitle.trim()}
              label={isSaving ? 'Saving…' : 'Save'}
              onClick={save}
            />
          </div>
        </ExerciseEditForm>
      </Modal.Content>
    </Modal>}
  </li>;
}


const ExerciseEditForm = styled.div`
  box-sizing: border-box;
  display: grid;
  gap: 1rem;
  margin: 0 auto;
  max-width: 48rem;
  padding: 0.25rem 0;
  width: 100%;

  > label {
    color: var(--color-text);
    display: grid;
    font-weight: 600;
    gap: 0.4rem;
    margin: 0;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  > label > span {
    line-height: 1.25;
    text-transform: none;
  }

  input, textarea {
    background: var(--bg-input, #fff);
    border: 1px solid var(--border-table, #cfd5e1);
    border-radius: 0.45rem;
    box-sizing: border-box;
    color: var(--color-text);
    font: inherit;
    font-weight: 400;
    line-height: 1.45;
    margin: 0;
    outline: none;
    padding: 0.65rem 0.75rem;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  input {
    min-height: 2.75rem;
  }

  textarea {
    min-height: 5.5rem;
    resize: vertical;
  }

  input:focus, textarea:focus {
    border-color: var(--color-primary, #1682d4);
    box-shadow: 0 0 0 2px rgba(22, 130, 212, 0.12);
  }

  input:disabled, textarea:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .exerciseEditActions {
    align-items: center;
    display: flex;
    gap: 0.65rem;
    justify-content: flex-end;
    padding-top: 0.25rem;
  }

  @media only screen and (max-width: 600px) {
    gap: 0.8rem;

    .exerciseEditActions {
      flex-wrap: wrap;
    }
  }
`;

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
  ageTabRequest: number;
  assignAllStandardsRequest: number;
  fixAllStandardsRequest: number;
  fixAllConceptsRequest: number;
  fixOnlyFailedConcepts: boolean;
  book: Book;
  file: File;
  generateAllConceptsModel: string;
  generateAllConceptsRequest: number;
  generateOnlyMissingConcepts: boolean;
  identifyChaptersRequest: number;
  languageTabRequest: number;
  subjectTabRequest: number;
  onBookChange: (book: Book) => void;
  onPrice: () => void;
  onProcessingComplete: () => void;
  isPriceDisabled?: boolean;
  pendingProcessingAction?: 'chapters' | 'concepts' | 'fixConcepts' | 'recognize' | 'standards' | 'fixStandards' | 'exercises';
  processingToolbar: PipelineAction[];
  processingToolbarAfterFixImages?: PipelineAction[];
  generateAllExercisesRequest: number;
  generateOnlyMissingExercises: boolean;
  recognizeAllRequest: number;
}

type ReaderPane = 'age' | 'chapters' | 'conceptExercises' | 'conceptsSkills' | 'language' | 'subject' | 'pdf' | 'preExercisesExercises' | 'skillsCourse' | 'standards' | 'text' | 'textConcepts';
type RecognitionTarget = 'all' | 'page';

interface ReaderEntityCounts {
  abilities: number;
  bookExercises: number;
  concepts: number;
  exercises: number;
}

interface FixConceptsReviewChapter {
  before: BookConcept[];
  chapter: ConceptChapterNavigationItem;
  missing: MissingChapterConcept[];
  removed: BookConcept[];
}

interface FixConceptsReview {
  baseStatuses: FixConceptsChapterStatuses;
  chapters: FixConceptsReviewChapter[];
  failedChapters: Array<{ chapter: ConceptChapterNavigationItem; reason: string }>;
  targetChapterCount: number;
}

interface ExerciseChapterNavigationItem {
  pageNumbers: number[];
  title: string;
}

function exerciseChapterNavigationKey ({ pageNumbers, title }: ExerciseChapterNavigationItem): string {
  return `${title}\n${pageNumbers.join(',')}`;
}

function conceptReferenceKey({ description, id, title }: Pick<BookConcept, 'description' | 'id' | 'title'>): string {
  return id === undefined ? `content:${title}\n${description}` : `id:${id}`;
}

const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

async function deleteConceptAndDependencies (bookId: number, concept: BookConcept, pageNumbers: number[]): Promise<void> {
  if (concept.id === undefined) {
    throw new Error('Unable to delete a concept without an id.');
  }

  const exercises = (await Promise.all(pageNumbers.map((conceptPageNumber) => getExercisesForBookPage([bookId, conceptPageNumber])))).flat();
  const referencedExercises = exercises.filter(({ conceptId, id }) => id !== undefined && conceptId === concept.id);

  for (const exercise of referencedExercises) {
    await deleteAbilities(exerciseAbilityModuleId(bookId, exercise.id as number));
    await deleteExercise(exercise.id as number);
  }

  await deleteBookConcept(concept.id);
}

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

    return value === 'text' || value === 'language' || value === 'subject' || value === 'age' || value === 'chapters' || value === 'textConcepts' || value === 'standards' || value === 'conceptExercises' || value === 'preExercisesExercises' || value === 'skillsCourse' ? value : 'text';
  } catch {
    return 'text';
  }
}

function BookReader({ ageTabRequest, assignAllStandardsRequest, book, file, fixAllConceptsRequest, fixOnlyFailedConcepts, fixAllStandardsRequest, generateAllConceptsModel, generateAllConceptsRequest, generateAllExercisesRequest, generateOnlyMissingConcepts, generateOnlyMissingExercises, identifyChaptersRequest, isPriceDisabled = false, languageTabRequest, subjectTabRequest, onBookChange, onPrice, onProcessingComplete, pendingProcessingAction, processingToolbar, processingToolbarAfterFixImages, recognizeAllRequest }: Props): React.ReactElement {
  const { t } = useTranslation();
  const [activePane, setActivePane] = useState<ReaderPane>(() => {
    const storedPane = getSessionReaderPane(book.id);

    if (!isBookProcessingStageComplete(book, 'recognize')) {
      return 'text';
    }

    if (storedPane === 'standards' && !isBookProcessingStageComplete(book, 'fixImages')) {
      return isBookProcessingStageComplete(book, 'fixExercises')
        ? 'preExercisesExercises'
        : isBookProcessingStageComplete(book, 'concepts') ? 'textConcepts' : 'text';
    }

    return storedPane;
  });
  const [chapters, setChapters] = useState<BookChapter[]>([]);
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<number>>(new Set());
  const [isDeletingChapters, setIsDeletingChapters] = useState(false);
  const [isDeleteChaptersConfirmationOpen, setIsDeleteChaptersConfirmationOpen] = useState(false);
  const [chapterTitleDraft, setChapterTitleDraft] = useState('');
  const [newChapterTitle, setNewChapterTitle] = useState('');
  const [concepts, setConcepts] = useState<BookConcept[]>([]);
  const [isAddingConcept, setIsAddingConcept] = useState(false);
  const [isReorderingConcepts, setIsReorderingConcepts] = useState(false);
  const [isSavingNewConcept, setIsSavingNewConcept] = useState(false);
  const [newConceptAfterIndex, setNewConceptAfterIndex] = useState(-1);
  const [newConceptDescription, setNewConceptDescription] = useState('');
  const [newConceptPage, setNewConceptPage] = useState('');
  const [newConceptTitle, setNewConceptTitle] = useState('');
  const [conceptCountsByChapter, setConceptCountsByChapter] = useState<Map<string, number>>(new Map());
  const [standardsByChapter, setStandardsByChapter] = useState<StoredBookStandards>(() => loadStoredBookStandards(book.id));
  const [fixConceptsChapterStatuses, setFixConceptsChapterStatuses] = useState<FixConceptsChapterStatuses>(() => loadFixConceptsChapterStatuses(book.id));
  const [fixConceptsReview, setFixConceptsReview] = useState<FixConceptsReview>();
  const [fixConceptsReviewChapterIndex, setFixConceptsReviewChapterIndex] = useState(0);
  const [isApplyingFixConceptsReview, setIsApplyingFixConceptsReview] = useState(false);
  const [standardsCatalogs, setStandardsCatalogs] = useState<StandardsCatalog[]>([]);
  const [standardsChapterIndex, setStandardsChapterIndex] = useState(0);
  const [standardsAssignedChapterCount, setStandardsAssignedChapterCount] = useState(0);
  const [standardsFixedChapterCount, setStandardsFixedChapterCount] = useState(0);
  const [fixConceptsTargetChapterCount, setFixConceptsTargetChapterCount] = useState(0);
  const [isAssigningStandards, setIsAssigningStandards] = useState(false);
  const [isFixingStandards, setIsFixingStandards] = useState(false);
  const [conceptFirstPageByKey, setConceptFirstPageByKey] = useState<Map<string, number>>(new Map());
  const [exerciseChapterConcepts, setExerciseChapterConcepts] = useState<BookConcept[]>([]);
  const [exerciseChapterExercises, setExerciseChapterExercises] = useState<Exercise[]>([]);
  const [exerciseChapterMissingCounts, setExerciseChapterMissingCounts] = useState<Map<string, number>>(new Map());
  const [exerciseChapterIndex, setExerciseChapterIndex] = useState(() => getSessionExerciseChapter(book.id));
  const [isExerciseChapterLoading, setIsExerciseChapterLoading] = useState(false);
  const [error, setError] = useState('');
  const [entityCounts, setEntityCounts] = useState<ReaderEntityCounts>({ abilities: 0, bookExercises: 0, concepts: 0, exercises: 0 });
  const [generatedConceptsChapterCount, setGeneratedConceptsChapterCount] = useState(0);
  const [fixedConceptsChapterCount, setFixedConceptsChapterCount] = useState(0);
  const [isFixingConcepts, setIsFixingConcepts] = useState(false);
  const [identifiedChapterPageCount, setIdentifiedChapterPageCount] = useState(0);
  const [chapterIdentificationPhase, setChapterIdentificationPhase] = useState<'bookmarks' | 'saving' | 'text'>('bookmarks');
  const [isIdentifyingChapters, setIsIdentifyingChapters] = useState(false);
  const chapterIdentificationLabel = chapterIdentificationPhase === 'bookmarks'
    ? 'Reading PDF bookmarks'
    : chapterIdentificationPhase === 'saving'
      ? 'Saving chapter assignments'
      : 'Identifying chapters from page text';
  const [isDetectingBookLanguage, setIsDetectingBookLanguage] = useState(false);
  const [isLanguageDetectionConfirmationOpen, setIsLanguageDetectionConfirmationOpen] = useState(false);
  const [isDetectingBookSubject, setIsDetectingBookSubject] = useState(false);
  const [isDetectingBookAge, setIsDetectingBookAge] = useState(false);
  const [isSubjectDetectionConfirmationOpen, setIsSubjectDetectionConfirmationOpen] = useState(false);
  const [isAgeDetectionConfirmationOpen, setIsAgeDetectionConfirmationOpen] = useState(false);
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
  const [revealedPanes, setRevealedPanes] = useState<Set<ReaderPane>>(new Set());
  const [generatedExercisesPageCount, setGeneratedExercisesPageCount] = useState(0);
  const [recognitionTarget, setRecognitionTarget] = useState<RecognitionTarget>('page');
  const [processingPage, setProcessingPage] = useState<number>();
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [renderedPageHeight, setRenderedPageHeight] = useState<number>();
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);
  const [selectedLanguageModel, setSelectedLanguageModel] = useState(OPENAI_MODELS[0].value);
  const [selectedSubjectModel, setSelectedSubjectModel] = useState(OPENAI_MODELS[0].value);
  const [selectedAgeModel, setSelectedAgeModel] = useState(OPENAI_MODELS[0].value);
  const [ageInput, setAgeInput] = useState(book.age === undefined ? '' : String(book.age));
  const [skillsRefreshToken, setSkillsRefreshToken] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const handledAssignAllStandardsRequestRef = useRef(assignAllStandardsRequest);
  const handledFixAllStandardsRequestRef = useRef(fixAllStandardsRequest);
  const handledFixAllConceptsRequestRef = useRef(fixAllConceptsRequest);
  const handledGenerateAllConceptsRequestRef = useRef(generateAllConceptsRequest);
  const handledLanguageTabRequestRef = useRef(languageTabRequest);
  const handledSubjectTabRequestRef = useRef(subjectTabRequest);
  const handledAgeTabRequestRef = useRef(ageTabRequest);
  const handledIdentifyChaptersRequestRef = useRef(identifyChaptersRequest);
  const handledGenerateAllExercisesRequestRef = useRef(generateAllExercisesRequest);
  const handledRecognizeAllRequestRef = useRef(recognizeAllRequest);
  const isDetectingBookLanguageRef = useRef(false);
  const isDetectingBookSubjectRef = useRef(false);
  const isDetectingBookAgeRef = useRef(false);
  const pageAreaRef = useRef<HTMLDivElement>(null);
  const conceptsOutputRef = useRef<HTMLDivElement>(null);
  const exerciseConceptsOutputRef = useRef<HTMLDivElement>(null);
  const draggedConceptIndexRef = useRef<number | undefined>(undefined);
  const conceptDropTargetIndexRef = useRef<number | undefined>(undefined);
  const conceptDragPointerIdRef = useRef<number | undefined>(undefined);
  const conceptDragPointerYRef = useRef<number | undefined>(undefined);
  const conceptAutoScrollFrameRef = useRef<number | undefined>(undefined);
  const reorderedConceptFocusIdRef = useRef<BookConcept['id']>(undefined);

  useEffect((): void => {
    setHasRecognitionBeenAttempted(getSessionRecognitionAttempted(book.id));
  }, [book.id]);

  useEffect((): void => {
    setAgeInput(book.age === undefined ? '' : String(book.age));
  }, [book.age]);

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
  const addAgeCost = useCallback((costUsd: number): void => addStageCost('age', costUsd), [addStageCost]);
  const addChaptersCost = useCallback((costUsd: number): void => addStageCost('chapters', costUsd), [addStageCost]);
  const addConceptsCost = useCallback((costUsd: number): void => addStageCost('concepts', costUsd), [addStageCost]);
  const addFixConceptsCost = useCallback((costUsd: number): void => addStageCost('fixConcepts', costUsd), [addStageCost]);
  const addExercisesCost = useCallback((costUsd: number): void => addStageCost('exercises', costUsd), [addStageCost]);
  const addStandardsCost = useCallback((costUsd: number): void => addStageCost('standards', costUsd), [addStageCost]);
  const addFixStandardsCost = useCallback((costUsd: number): void => addStageCost('fixStandards', costUsd), [addStageCost]);
  const conceptChapters = useMemo<ConceptChapterNavigationItem[]>(() => conceptChaptersFromPages(Array.from(pages.values())), [pages]);
  useEffect(() => {
    if (!isBookProcessingStageComplete(book, 'concepts')) {
      setFixConceptsChapterStatuses(clearFixConceptsChapterStatuses(book.id));
      return;
    }

    // Existing books may already have a completed Fix concepts stage from
    // before per-chapter progress was recorded. Treat that persisted stage as
    // authoritative and backfill chapter checkmarks.
    if (isBookProcessingStageComplete(book, 'fixConcepts') && conceptChapters.length) {
      const completedStatuses = Object.fromEntries(conceptChapters.map((chapter) => [fixConceptsChapterKey(chapter), 'fixed' as const]));

      storeFixConceptsChapterStatuses(book.id, completedStatuses);
      setFixConceptsChapterStatuses(completedStatuses);
    }
  }, [book, conceptChapters]);
  const loadConceptCountsByChapter = useCallback(async (targetChapters: ConceptChapterNavigationItem[]): Promise<Map<string, number>> => {
    const pageNumbers = Array.from(new Set(targetChapters.flatMap(({ pageNumbers: chapterPageNumbers }) => chapterPageNumbers)));
    const [pageConceptRows, pageLessConcepts] = await Promise.all([
      Promise.all(pageNumbers.map(async (chapterPageNumber) => [chapterPageNumber, await getBookConceptsForBookPage(book.id, chapterPageNumber)] as const)),
      getBookConceptsForBookPage(book.id, 0)
    ]);
    const conceptsByPage = new Map(pageConceptRows);

    return new Map(targetChapters.map((chapter) => {
      const pageConceptCount = chapter.pageNumbers.reduce((count, chapterPageNumber) => count + (conceptsByPage.get(chapterPageNumber)?.length ?? 0), 0);
      const pageLessConceptCount = chapter.chapterId === undefined ? 0 : pageLessConcepts.filter(({ chapterId }) => chapterId === chapter.chapterId).length;

      return [standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers), pageConceptCount + pageLessConceptCount] as const;
    }));
  }, [book.id]);
  const refreshConceptCounts = useCallback(async (): Promise<void> => {
    setConceptCountsByChapter(await loadConceptCountsByChapter(conceptChapters));
  }, [conceptChapters, loadConceptCountsByChapter]);
  const currentConceptChapter = useMemo(() => conceptChapters.find(({ pageNumbers }) => pageNumbers.includes(pageNumber)), [conceptChapters, pageNumber]);
  const conceptChapterIndex = useMemo(() => Math.max(0, conceptChapters.findIndex(({ pageNumbers }) => pageNumbers.includes(pageNumber))), [conceptChapters, pageNumber]);
  useEffect(() => {
    refreshConceptCounts().catch(() => setConceptCountsByChapter(new Map()));
  }, [refreshConceptCounts]);
  useEffect(() => {
    setIsAddingConcept(false);
    setNewConceptAfterIndex(-1);
    setNewConceptDescription('');
    setNewConceptPage('');
    setNewConceptTitle('');
  }, [currentConceptChapter?.chapterId, currentConceptChapter?.title]);
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
    return estimateAiInput(selectedModel, [estimatedRequest, estimatedRequest], 4_800);
  }, [currentConceptChapter, pages, selectedModel]);
  const languageDetectionEstimate = useMemo(() => {
    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = pages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      return 'Recognition text is incomplete; language detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedLanguageModel, [BOOK_LANGUAGE_DETECTION_PROMPT(pageTexts)], 32);
  }, [pages, selectedLanguageModel, totalPages]);
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

    return estimateAiInput(selectedSubjectModel, [BOOK_SUBJECT_DETECTION_PROMPT(book.language ?? 'unknown', pageTexts)], 64);
  }, [book.language, pages, selectedSubjectModel, totalPages]);
  const ageSamplePageNumbers = useMemo(() => getBookAgeSamplePageNumbers(totalPages, Array.from(pages.values()).flatMap(({ pageMMD, pageNumber }) => pageMMD?.trim() ? [pageNumber] : [])), [pages, totalPages]);
  const ageSamplePageTexts = useMemo(() => ageSamplePageNumbers.flatMap((samplePageNumber) => {
    const text = pages.get(samplePageNumber)?.pageMMD?.trim();

    return text ? [{ pageNumber: samplePageNumber, text }] : [];
  }), [ageSamplePageNumbers, pages]);
  const ageDetectionEstimate = useMemo(() => {
    if (!ageSamplePageNumbers.length || ageSamplePageNumbers.length !== Math.min(3, totalPages) || ageSamplePageTexts.length !== ageSamplePageNumbers.length) {
      return 'Representative recognition text is incomplete; age detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedAgeModel, [BOOK_AGE_DETECTION_PROMPT(book.language ?? 'unknown', book.subject ?? 'unknown', ageSamplePageTexts)], 32);
  }, [ageSamplePageNumbers, ageSamplePageTexts, book.language, book.subject, selectedAgeModel, totalPages]);
  const exerciseChapters = useMemo<ExerciseChapterNavigationItem[]>(() => {
    const grouped = new Map<string, ExerciseChapterNavigationItem>();

    Array.from(pages.values())
      .filter(({ chapter, chapterId, conceptsProcessed, excludedFromAnalysis }) => conceptsProcessed && !excludedFromAnalysis && (chapterId !== undefined || Boolean(chapter.trim())))
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
    refreshConceptCounts().catch(() => undefined);
  }, [refreshConceptCounts]);
  const changeExerciseChapter = useCallback((index: number): void => {
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, exerciseChapters.length - 1)));
    const chapter = exerciseChapters[nextIndex];
    const conceptChapterIndex = chapter
      ? conceptChapters.findIndex(({ title }) => title.trim() === chapter.title.trim())
      : -1;
    const conceptChapter = conceptChapterIndex >= 0 ? conceptChapters[conceptChapterIndex] : undefined;

    setExerciseChapterIndex(nextIndex);

    try {
      sessionStorage.setItem(exerciseChapterSessionKey(book.id), String(nextIndex));
    } catch {
      // Session storage may be unavailable in privacy-restricted contexts.
    }

    storeSharedChapterSelection(book.id, {
      chapterId: conceptChapter?.chapterId,
      index: conceptChapterIndex >= 0 ? conceptChapterIndex : nextIndex,
      title: chapter?.title
    });
  }, [book.id, conceptChapters, exerciseChapters]);
  const changeStandardsChapter = useCallback((index: number): void => {
    const nextIndex = Math.max(0, Math.min(index, Math.max(0, conceptChapters.length - 1)));
    const chapter = conceptChapters[nextIndex];

    setStandardsChapterIndex(nextIndex);
    storeSharedChapterSelection(book.id, { chapterId: chapter?.chapterId, index: nextIndex, title: chapter?.title });
  }, [book.id, conceptChapters]);

  useEffect(() => {
    refreshEntityCounts().catch(() => undefined);
  }, [book.completedStages, refreshEntityCounts]);

  useEffect((): void => {
    if (!exerciseChapters.length) {
      setExerciseChapterIndex(0);

      return;
    }

    if (exerciseChapterIndex >= exerciseChapters.length) {
      const nextIndex = exerciseChapters.length - 1;

      setExerciseChapterIndex(nextIndex);

      try {
        sessionStorage.setItem(exerciseChapterSessionKey(book.id), String(nextIndex));
      } catch {
        // Session storage may be unavailable in privacy-restricted contexts.
      }
    }
  }, [book.id, exerciseChapterIndex, exerciseChapters.length]);

  useEffect((): void => {
    if (!conceptChapters.length) {
      setStandardsChapterIndex(0);

      return;
    }

    if (standardsChapterIndex >= conceptChapters.length) {
      setStandardsChapterIndex(conceptChapters.length - 1);
    }
  }, [conceptChapters.length, standardsChapterIndex]);

  useEffect(() => {
    const applySelection = (selection: SharedChapterSelection): void => {
      if (conceptChapters.length) {
        setStandardsChapterIndex(resolveSharedChapterIndex(selection, conceptChapters.map(({ chapterId, title }) => ({ id: chapterId, title }))));
      }

      if (exerciseChapters.length) {
        const nextExerciseIndex = resolveSharedChapterIndex(selection, exerciseChapters);

        setExerciseChapterIndex(nextExerciseIndex);

        try {
          sessionStorage.setItem(exerciseChapterSessionKey(book.id), String(nextExerciseIndex));
        } catch {
          // Session storage may be unavailable in privacy-restricted contexts.
        }
      }
    };
    const storedSelection = getSharedChapterSelection(book.id);

    if (storedSelection) {
      applySelection(storedSelection);
    }

    return subscribeSharedChapterSelection(book.id, applySelection);
  }, [book.id, conceptChapters, exerciseChapters]);

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
    if (activePane === 'standards' && !isBookProcessingStageComplete(book, 'fixImages')) {
      setActivePane(isBookProcessingStageComplete(book, 'fixExercises')
        ? 'preExercisesExercises'
        : isBookProcessingStageComplete(book, 'concepts') ? 'textConcepts' : 'text');
    }
  }, [activePane, book]);

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
    if (!isBookProcessingStageComplete(book, 'recognize') && !recognitionIsComplete && activePane !== 'text') {
      setActivePane('text');
    }
  }, [activePane, book, pages, totalPages]);

  const revealPane = useCallback((pane: ReaderPane): void => {
    setRevealedPanes((current) => {
      if (current.has(pane)) {
        return current;
      }

      const next = new Set(current);

      next.add(pane);
      return next;
    });
    setActivePane(pane);
  }, []);

  useEffect(() => {
    if (pendingProcessingAction) {
      setOpenRouterSpent(0);
    }

    if (pendingProcessingAction === 'recognize') {
      // Recognition resets the conversion pipeline, so no downstream result
      // tab should remain exposed from an earlier run.
      setRevealedPanes(new Set());
      setActivePane('text');
    }
  }, [pendingProcessingAction]);

  const completeStage = useCallback(async (stage: BookProcessingStageKey): Promise<void> => {
    if (isBookProcessingStageComplete(book, stage)) {
      return;
    }

    const updatedBook = await completeBookProcessingStage(book.id, stage);

    onBookChange(updatedBook ?? withCompletedBookProcessingStage(book, stage));
  }, [book, onBookChange]);
  const completeStageRef = useRef(completeStage);

  completeStageRef.current = completeStage;

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

      if (areAllBookPagesConceptsProcessed(document.numPages, storedPages, analysisPageNumbers(storedPages))) {
        await completeStageRef.current('concepts');
      } else if (hasEveryPage && storedPages.every(({ chapterId, chapter, excludedFromAnalysis }) => excludedFromAnalysis || chapterId !== undefined || Boolean(chapter.trim()))) {
        await completeStageRef.current('chapters');
      } else if (hasEveryPage && storedPages.every(({ pageMMD }) => pageMMD !== undefined)) {
        await completeStageRef.current('recognize');
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

      const [pageRows, pageLessConcepts] = await Promise.all([
        Promise.all(currentConceptChapter.pageNumbers.map(async (chapterPageNumber) => ({
          concepts: await getBookConceptsForBookPage(book.id, chapterPageNumber),
          pageNumber: chapterPageNumber
        }))),
        getBookConceptsForBookPage(book.id, 0)
      ]);
      const rows = [
        ...pageRows,
        {
          concepts: pageLessConcepts.filter(({ chapterId }) => chapterId === currentConceptChapter.chapterId),
          pageNumber: 0
        }
      ];

      if (active) {
        const storedConcepts = sortConceptsForDisplay(rows.flatMap(({ concepts }) => concepts));
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
        setExerciseChapterConcepts(sortConceptsForDisplay(pageRows.flatMap(({ concepts }) => concepts)));
        setExerciseChapterExercises(pageRows.flatMap(({ exercises }) => exercises));
      }
    };

    loadChapterLearningContent()
      .catch(() => active && setError('Unable to load this chapter’s exercises.'))
      .finally(() => active && setIsExerciseChapterLoading(false));

    return () => {
      active = false;
    };
  }, [activePane, book.id, currentExerciseChapter, skillsRefreshToken]);

  useEffect(() => {
    if (activePane !== 'conceptExercises') {
      return;
    }

    let active = true;

    setExerciseChapterMissingCounts(new Map());

    Promise.all(exerciseChapters.map(async (chapter) => {
      const pageRows = await Promise.all(chapter.pageNumbers.map(async (chapterPageNumber) => {
        const [storedConcepts, storedExercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, chapterPageNumber),
          getExercisesForBookPage([book.id, chapterPageNumber])
        ]);

        return { concepts: storedConcepts, exercises: storedExercises };
      }));
      const concepts = sortConceptsForDisplay(pageRows.flatMap(({ concepts: pageConcepts }) => pageConcepts));
      const exercises = pageRows.flatMap(({ exercises: pageExercises }) => pageExercises);

      return [exerciseChapterNavigationKey(chapter), missingGeneratedExerciseConceptIndexes(concepts, exercises).length] as const;
    }))
      .then((counts) => active && setExerciseChapterMissingCounts(new Map(counts)))
      .catch(() => active && setExerciseChapterMissingCounts(new Map()));

    return () => {
      active = false;
    };
  }, [activePane, book.id, exerciseChapters, skillsRefreshToken]);

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

  useEffect(() => {
    const availableIds = new Set(chapters.flatMap(({ id }) => id === undefined ? [] : [id]));

    setSelectedChapterIds((current) => new Set(Array.from(current).filter((id) => availableIds.has(id))));
  }, [chapters]);

  const toggleChapterSelection = useCallback((chapterId: number): void => {
    setSelectedChapterIds((current) => {
      const next = new Set(current);

      if (next.has(chapterId)) {
        next.delete(chapterId);
      } else {
        next.add(chapterId);
      }

      return next;
    });
  }, []);

  const synchronizeChapterProcessingStage = useCallback(async (): Promise<void> => {
    const storedPages = await getBookPages(book.id);
    const complete = totalPages > 0 && storedPages.length === totalPages && storedPages.every(({ chapterId, chapter, excludedFromAnalysis }) => excludedFromAnalysis || chapterId !== undefined || Boolean(chapter.trim()));
    const updated = complete
      ? await completeBookProcessingStage(book.id, 'chapters')
      : await resetBookProcessingStagesFrom(book.id, 'chapters');

    onBookChange(updated ?? (complete ? withCompletedBookProcessingStage(book, 'chapters') : withBookProcessingStagesResetFrom(book, 'chapters')));
  }, [book, onBookChange, totalPages]);

  const deleteSelectedChapters = useCallback(async (): Promise<void> => {
    const chapterIds = Array.from(selectedChapterIds);

    if (!chapterIds.length || isDeletingChapters) {
      return;
    }

    setError('');
    setIsDeletingChapters(true);

    try {
      const selected = new Set(chapterIds);
      const selectedPageNumbers = Array.from(pages.values()).flatMap(({ chapterId, pageNumber }) => chapterId !== undefined && selected.has(chapterId) ? [pageNumber] : []);
      const selectedExercises = (await Promise.all(selectedPageNumbers.map((selectedPageNumber) => getExercisesForBookPage([book.id, selectedPageNumber])))).flat();

      await Promise.all(selectedExercises.flatMap(({ id }) => id === undefined ? [] : [deleteAbilities(exerciseAbilityModuleId(book.id, id))]));
      await deleteBookChapters(book.id, chapterIds);
      setSelectedChapterIds(new Set());
      await refreshChapterAssignments();
      await synchronizeChapterProcessingStage();
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to delete the selected chapters.');
    } finally {
      setIsDeletingChapters(false);
    }
  }, [book.id, isDeletingChapters, pages, refreshChapterAssignments, refreshConceptCounts, refreshEntityCounts, selectedChapterIds, synchronizeChapterProcessingStage]);

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
        await completeStage('chapters');
        revealPane('chapters');
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
      await completeStage('chapters');
      revealPane('chapters');
      setIdentifiedChapterPageCount(totalPages);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to identify chapters.');
    } finally {
      setIsIdentifyingChapters(false);
      onProcessingComplete();
    }
  }, [addChaptersCost, completeStage, book.id, book.language, generateAllConceptsModel, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, pdf, processingPage, refreshChapterAssignments, revealPane, totalPages]);

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
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);

      if (areAllBookPagesConceptsProcessed(totalPages, Array.from(updatedPages.values()), analysisPageNumbers(Array.from(updatedPages.values())))) {
        await completeStage('concepts');
        revealPane('textConcepts');
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for this chapter.');
    } finally {
      setIsGeneratingChapterConcepts(false);
      setProcessingPage(undefined);
    }
  }, [addConceptsCost, completeStage, book.id, currentConceptChapter, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, refreshConceptCounts, refreshEntityCounts, revealPane, selectedModel, totalPages]);
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

    const activePages = bookPages.filter(({ excludedFromAnalysis }) => !excludedFromAnalysis);

    if (activePages.some(({ chapter, chapterId }) => chapterId === undefined && !chapter.trim())) {
      setError('Assign every included page to a chapter before generating concepts. Deleted chapters stay excluded from analysis.');
      onProcessingComplete();
      return;
    }

    const recognitionChapters = conceptChaptersFromPages(bookPages);

    if (!recognitionChapters.length || recognitionChapters.reduce((count, chapter) => count + chapter.pageNumbers.length, 0) !== activePages.length) {
      setError('Every included page must belong to exactly one chapter before generating concepts.');
      onProcessingComplete();
      return;
    }

    // An explicit Concepts action is a regeneration request, not merely a
    // completion check. Re-run every chapter even when its persisted
    // conceptsProcessed flag is already true; otherwise a manual rerun can
    // return immediately without sending any concept request.
    setError('');
    setOpenRouterSpent(0);
    setIsGeneratingAllConcepts(true);
    setGeneratedConceptsChapterCount(0);

    const allChapterTasks = recognitionChapters.map((chapter) => ({
      chapter,
      pages: chapter.pageNumbers.map((chapterPageNumber) => pages.get(chapterPageNumber) as BookPage)
    }));
    let chapterTasks = allChapterTasks;

    if (generateOnlyMissingConcepts) {
      try {
        const conceptCounts = await loadConceptCountsByChapter(recognitionChapters);

        chapterTasks = allChapterTasks.filter(({ chapter }) => (conceptCounts.get(standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers)) ?? 0) === 0);
      } catch {
        setError('Unable to determine which chapters are missing concepts.');
        setIsGeneratingAllConcepts(false);
        onProcessingComplete();

        return;
      }
    }

    if (!chapterTasks.length) {
      await completeStage('concepts');
      revealPane('textConcepts');
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();

      return;
    }

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
      const failedConceptDetails: string[] = [];

      // Persist chapter-by-chapter. A concept is written only to the page where
      // the chapter-wide AI response says it was first introduced.
      for (const result of generationResults) {
        const chapterLabel = result.chapter.title.trim() || `pages ${result.chapter.pageNumbers[0]}-${result.chapter.pageNumbers[result.chapter.pageNumbers.length - 1]}`;

        if (result.status === 'rejected') {
          failedConceptTasks++;
          failedConceptDetails.push(`${chapterLabel}: ${conceptGenerationErrorMessage(result.reason)}`);
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
        } catch (reason) {
          failedConceptTasks++;
          failedConceptDetails.push(`${chapterLabel}: saving generated concepts failed (${conceptGenerationErrorMessage(reason)})`);
        }
      }

      const storedPagesAfterGeneration = await getBookPages(book.id);
      const analyzedPageNumbers = analysisPageNumbers(storedPagesAfterGeneration);
      const conceptsComplete = areAllBookPagesConceptsProcessed(totalPages, storedPagesAfterGeneration, analyzedPageNumbers);

      setPages(new Map(storedPagesAfterGeneration.map((storedPage) => [storedPage.pageNumber, storedPage])));
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);

      // Keep successful chapter results and let the pipeline continue even if
      // individual chapters failed. Chapters with no stored concepts remain
      // eligible for the "missing concepts only" rerun from the Concepts popup.
      const successfulConceptTasks = chapterTasks.length - failedConceptTasks;

      if (successfulConceptTasks > 0) {
        await completeStage('concepts');
        revealPane('textConcepts');
      }

      if (failedConceptTasks > 0 || !conceptsComplete) {
        const unprocessedPages = countUnprocessedBookPages(totalPages, storedPagesAfterGeneration, analyzedPageNumbers);

        const failureDetails = failedConceptDetails.length ? ` ${failedConceptDetails.join(' | ')}` : '';

        setError(successfulConceptTasks > 0
          ? `Concept generation completed with ${failedConceptTasks} of ${chapterTasks.length} attempted chapters failing; ${unprocessedPages} pages remain unprocessed. Successful chapter results were kept. Rerun Concepts to retry, optionally only for chapters missing concepts.${failureDetails}`
          : `Concept generation failed for all ${chapterTasks.length} attempted chapters; ${unprocessedPages} pages remain unprocessed. The Concepts stage remains incomplete. Retry concept generation.${failureDetails}`);
      }
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
    } finally {
      setIsGeneratingAllConcepts(false);
      onProcessingComplete();
    }
  }, [addConceptsCost, completeStage, book.id, conceptChapters, generateAllConceptsModel, generateOnlyMissingConcepts, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, loadConceptCountsByChapter, onProcessingComplete, pageNumber, pages, processingPage, refreshConceptCounts, refreshEntityCounts, revealPane, totalPages]);

  const fixAllConcepts = useCallback(async (model = generateAllConceptsModel, onlyFailed = false): Promise<void> => {
    if (!conceptChapters.length || isFixingConcepts || isGeneratingAllConcepts || isRecognizingAll || isIdentifyingChapters || isGeneratingAllExercises || fixConceptsReview) {
      return;
    }

    const previousStatuses = loadFixConceptsChapterStatuses(book.id);
    const targetChapters = onlyFailed
      ? conceptChapters.filter((chapter) => previousStatuses[fixConceptsChapterKey(chapter)] === 'failed')
      : conceptChapters;

    if (!targetChapters.length) {
      setError(onlyFailed ? 'There are no failed Fix concepts chapters to retry.' : 'No chapters are available for Fix concepts.');
      return;
    }

    if (!book.language || !book.subject || book.age === undefined) {
      setError('Set the book language, subject, and learner age before running Fix concepts.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);
    setIsFixingConcepts(true);
    setFixedConceptsChapterCount(0);
    setFixConceptsTargetChapterCount(targetChapters.length);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' },
        maxRetries: 0
      });
      const pageLessConcepts = await getBookConceptsForBookPage(book.id, 0);
      const results = await mapConcurrent(targetChapters, OPENROUTER_CONCURRENCY, async (chapter) => {
        try {
          const before = sortConceptsForDisplay([
            ...(await Promise.all(chapter.pageNumbers.map((chapterPageNumber) => getBookConceptsForBookPage(book.id, chapterPageNumber)))).flat(),
            ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.chapterId)
          ]);
          const chapterMmd = chapter.pageNumbers.map((chapterPageNumber) => `--- page ${chapterPageNumber} ---\n${pages.get(chapterPageNumber)?.pageMMD ?? ''}`).join('\n\n');
          const fixes = await requestMissingChapterConcepts(client, model, chapter.title, chapterMmd, before, chapter.pageNumbers, book, addFixConceptsCost);
          const removed = fixes.removeConceptIndexes.flatMap((conceptIndex): BookConcept[] => {
            const concept = before[conceptIndex];

            return concept?.id === undefined ? [] : [concept];
          });

          return { before, chapter, missing: fixes.concepts, removed, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapter, reason, status: 'rejected' as const };
        } finally {
          setFixedConceptsChapterCount((count) => count + 1);
        }
      });
      const successfulChapters = results.flatMap((result): FixConceptsReviewChapter[] => result.status === 'fulfilled'
        ? [{ before: result.before, chapter: result.chapter, missing: result.missing, removed: result.removed }]
        : []);
      const failedChapters = results.flatMap((result): FixConceptsReview['failedChapters'] => result.status === 'rejected'
        ? [{ chapter: result.chapter, reason: conceptGenerationErrorMessage(result.reason) }]
        : []);

      if (!successfulChapters.length) {
        const failureDetails = failedChapters.map(({ chapter, reason }) => `${chapter.title || 'Untitled chapter'}: ${reason}`);

        setError(`Fix concepts could not prepare any changes for review.${failureDetails.length ? ` ${failureDetails.join(' | ')}` : ''}`);
        return;
      }

      setFixConceptsReviewChapterIndex(0);
      setFixConceptsReview({
        baseStatuses: onlyFailed ? previousStatuses : {},
        chapters: successfulChapters,
        failedChapters,
        targetChapterCount: targetChapters.length
      });
      revealPane('textConcepts');
    } finally {
      setIsFixingConcepts(false);
    }
  }, [addFixConceptsCost, book, conceptChapters, fixConceptsReview, generateAllConceptsModel, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, pages, revealPane]);

  const discardFixConceptsReview = useCallback((): void => {
    if (isApplyingFixConceptsReview) {
      return;
    }

    setFixConceptsReview(undefined);
    setFixConceptsReviewChapterIndex(0);
  }, [isApplyingFixConceptsReview]);

  const removeFixConceptsReviewConcept = useCallback((chapterIndex: number, missingIndex: number): void => {
    if (isApplyingFixConceptsReview) {
      return;
    }

    setFixConceptsReview((review) => {
      if (!review || !review.chapters[chapterIndex]?.missing[missingIndex]) {
        return review;
      }

      return {
        ...review,
        chapters: review.chapters.map((reviewChapter, reviewChapterIndex) => reviewChapterIndex === chapterIndex
          ? { ...reviewChapter, missing: reviewChapter.missing.filter((_, index) => index !== missingIndex) }
          : reviewChapter)
      };
    });
  }, [isApplyingFixConceptsReview]);

  const toggleFixConceptsReviewRemoval = useCallback((chapterIndex: number, concept: BookConcept): void => {
    if (isApplyingFixConceptsReview || concept.id === undefined) {
      return;
    }

    setFixConceptsReview((review) => {
      const reviewChapter = review?.chapters[chapterIndex];

      if (!review || !reviewChapter) {
        return review;
      }

      const conceptKey = conceptReferenceKey(concept);
      const isRemoved = reviewChapter.removed.some((candidate) => conceptReferenceKey(candidate) === conceptKey);

      return {
        ...review,
        chapters: review.chapters.map((chapter, reviewChapterIndex) => reviewChapterIndex === chapterIndex
          ? {
            ...chapter,
            removed: isRemoved
              ? chapter.removed.filter((candidate) => conceptReferenceKey(candidate) !== conceptKey)
              : [...chapter.removed, concept]
          }
          : chapter)
      };
    });
  }, [isApplyingFixConceptsReview]);

  const applyFixConceptsReview = useCallback(async (): Promise<void> => {
    if (!fixConceptsReview || isApplyingFixConceptsReview) {
      return;
    }

    setIsApplyingFixConceptsReview(true);
    setError('');

    try {
      const resetBook = await resetBookProcessingStagesFrom(book.id, 'fixConcepts');
      const bookAfterReset = resetBook ?? withBookProcessingStagesResetFrom(book, 'fixConcepts');

      onBookChange(bookAfterReset);

      const attempt = await incrementBookFixConceptsAttempts(book.id);
      const nextStatuses: FixConceptsChapterStatuses = { ...fixConceptsReview.baseStatuses };
      const failureDetails = fixConceptsReview.failedChapters.map(({ chapter, reason }) => {
        nextStatuses[fixConceptsChapterKey(chapter)] = 'failed';
        return `${chapter.title || 'Untitled chapter'}: ${reason}`;
      });
      let added = 0;
      let removed = 0;
      const pageNumbers = Array.from(pages.keys());

      for (const { chapter, missing, removed: conceptsToRemove } of fixConceptsReview.chapters) {
        try {
          for (const concept of conceptsToRemove) {
            await deleteConceptAndDependencies(book.id, concept, pageNumbers);
            removed++;
          }

          for (const concept of missing) {
            await createBookConcept(chapterLevelMissingConcept(book.id, chapter.chapterId, concept, attempt));
            added++;
          }

          nextStatuses[fixConceptsChapterKey(chapter)] = 'fixed';
        } catch (reason) {
          nextStatuses[fixConceptsChapterKey(chapter)] = 'failed';
          failureDetails.push(`${chapter.title || 'Untitled chapter'}: saving reviewed concept changes failed (${conceptGenerationErrorMessage(reason)})`);
        }
      }

      storeFixConceptsChapterStatuses(book.id, nextStatuses);
      setFixConceptsChapterStatuses(nextStatuses);
      // The reviewed proposal has now been consumed. Close it before any
      // post-save refresh work so a refresh failure cannot cause duplicate
      // concept inserts if the user retries the same review.
      setFixConceptsReview(undefined);
      setFixConceptsReviewChapterIndex(0);

      const allChaptersFixed = conceptChapters.every((chapter) => nextStatuses[fixConceptsChapterKey(chapter)] === 'fixed');

      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setSkillsRefreshToken((value) => value + 1);

      if (currentConceptChapter) {
        const [pageRows, pageLess] = await Promise.all([
          Promise.all(currentConceptChapter.pageNumbers.map(async (chapterPageNumber) => ({
            concepts: await getBookConceptsForBookPage(book.id, chapterPageNumber),
            pageNumber: chapterPageNumber
          }))),
          getBookConceptsForBookPage(book.id, 0)
        ]);
        const rows = [...pageRows, { concepts: pageLess.filter(({ chapterId }) => chapterId === currentConceptChapter.chapterId), pageNumber: 0 }];
        const references = new Map<string, number>();

        rows.forEach(({ concepts: pageConcepts, pageNumber: conceptPageNumber }) => pageConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), conceptPageNumber)));
        setConcepts(sortConceptsForDisplay(rows.flatMap(({ concepts: pageConcepts }) => pageConcepts)));
        setConceptFirstPageByKey(references);
      }

      if (allChaptersFixed) {
        const completedBook = await completeBookProcessingStage(book.id, 'fixConcepts');

        onBookChange(completedBook ?? withCompletedBookProcessingStage(bookAfterReset, 'fixConcepts'));
        setError('');
      } else {
        const failureCount = conceptChapters.filter((chapter) => nextStatuses[fixConceptsChapterKey(chapter)] === 'failed').length;

        const savedSummary = [added ? `${added} concept${added === 1 ? '' : 's'} added` : '', removed ? `${removed} concept${removed === 1 ? '' : 's'} removed` : ''].filter(Boolean).join(', ');

        setError(`${failureCount} chapter${failureCount === 1 ? '' : 's'} still need Fix concepts attention. Approved changes were saved${savedSummary ? ` (${savedSummary})` : ''}.${failureDetails.length ? ` ${failureDetails.join(' | ')}` : ''}`);
      }

    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : 'Unable to apply the reviewed Fix concepts changes.');
    } finally {
      setIsApplyingFixConceptsReview(false);
      onProcessingComplete();
    }
  }, [book, conceptChapters, currentConceptChapter, fixConceptsReview, isApplyingFixConceptsReview, onBookChange, onProcessingComplete, pages, refreshConceptCounts, refreshEntityCounts]);

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
        .filter(({ chapter, chapterId, conceptsProcessed, excludedFromAnalysis }) => conceptsProcessed && !excludedFromAnalysis && (chapterId !== undefined || Boolean(chapter.trim())))
        .sort((a, b) => a.pageNumber - b.pageNumber);
      const pageRows = await Promise.all(storedPages.map(async (storedPage) => {
        const [concepts, exercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, storedPage.pageNumber),
          generateOnlyMissingExercises ? getExercisesForBookPage([book.id, storedPage.pageNumber]) : Promise.resolve([] as Exercise[])
        ]);

        if (generateOnlyMissingExercises && concepts.some(({ id }) => id === undefined)) {
          throw new Error(`Every Concept must have an id before missing Exercises can be generated (page ${storedPage.pageNumber}).`);
        }

        return { concepts, exercises, storedPage };
      }));
      const exerciseConceptIds = new Set(pageRows.flatMap(({ exercises }) => exercises.flatMap(({ conceptId }) => conceptId === undefined ? [] : [conceptId])));
      const existingExercisesByPage = new Map(pageRows.map(({ exercises, storedPage }) => [storedPage.pageNumber, exercises] as const));
      const pageInputs = pageRows.map(({ concepts, storedPage }) => ({
        chapter: storedPage.chapter,
        concepts: concepts.flatMap(({ description, id, title }) => generateOnlyMissingExercises && id !== undefined && exerciseConceptIds.has(id)
          ? []
          : [{ description, ...(generateOnlyMissingExercises ? { sourceId: id } : {}), title }]),
        pageNumber: storedPage.pageNumber
      }));
      const generationPages = generateOnlyMissingExercises ? pageInputs.filter(({ concepts }) => concepts.length > 0) : pageInputs;
      const groupedPages = generationPages.reduce((grouped, { chapter, ...page }) => {
        const chapterPages = grouped.get(chapter) ?? [];

        chapterPages.push(page);
        grouped.set(chapter, chapterPages);

        return grouped;
      }, new Map<string, Array<Omit<typeof generationPages[number], 'chapter'>>>());
      const chapterInputs = Array.from(groupedPages, ([chapter, chapterPages]) => ({ chapter, pages: chapterPages }));

      if (generateOnlyMissingExercises) {
        setGeneratedExercisesPageCount(Math.max(0, totalPages - generationPages.length));
      }

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
        }, bookDetectedLanguage, book.age);

        for (const processed of processedChapter.pages) {
          if (!generateOnlyMissingExercises) {
            await replaceParsedBookPageContent(book.id, processed.pageNumber, processedChapter.chapter, processed.concepts, processed.exercises);
            setGeneratedExercisesPageCount((count) => count + 1);
            continue;
          }

          const generatedExercises = processed.exercises.flatMap((exercise): Array<Omit<Exercise, 'bookPage' | 'id'>> => {
            const sourceConcept = exercise.conceptIndex === undefined ? undefined : processed.concepts[exercise.conceptIndex];
            const conceptId = sourceConcept?.sourceId;

            if (conceptId === undefined) {
              return [];
            }

            return [{
              conceptId,
              description: stripMarkdownImageReferences(exercise.description),
              imageDescription: exercise.imageDescription,
              solution: exercise.solution,
              solutionImageDescription: exercise.solutionImageDescription,
              source: exercise.source,
              title: exercise.title
            }];
          });

          if (generatedExercises.length) {
            const originalExercises = existingExercisesByPage.get(processed.pageNumber) ?? [];
            const abilityContentsByExerciseId = new Map<number, string[]>();

            await Promise.all(originalExercises.map(async ({ id }) => {
              if (id !== undefined) {
                abilityContentsByExerciseId.set(id, (await getAbilities(exerciseAbilityModuleId(book.id, id))).map(({ content }) => content));
              }
            }));

            await replaceExercisesForBookPage(
              [book.id, processed.pageNumber],
              [...originalExercises.map(exerciseForPageReplacement), ...generatedExercises]
            );

            const storedExercises = await getExercisesForBookPage([book.id, processed.pageNumber]);

            if (storedExercises.length !== originalExercises.length + generatedExercises.length || storedExercises.some(({ id }) => id === undefined)) {
              throw new Error(`Unable to preserve existing Exercises while adding missing Exercises on page ${processed.pageNumber}.`);
            }

            for (let index = 0; index < originalExercises.length; index++) {
              const oldId = originalExercises[index].id;
              const newId = storedExercises[index].id as number;

              if (oldId === undefined || oldId === newId) {
                continue;
              }

              const contents = abilityContentsByExerciseId.get(oldId) ?? [];

              if (contents.length) {
                await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
              }

              await deleteAbilities(exerciseAbilityModuleId(book.id, oldId));
            }

            existingExercisesByPage.set(processed.pageNumber, storedExercises);
          }

          setGeneratedExercisesPageCount((count) => count + 1);
        }
      });

      await refreshEntityCounts();
      setSkillsRefreshToken((value) => value + 1);
      await completeStage('exercises');
      revealPane('conceptExercises');
    } catch (processingError) {
      setError(processingError instanceof Error ? processingError.message : 'Unable to generate exercises.');
    } finally {
      setIsGeneratingAllExercises(false);
      onProcessingComplete();
    }
  }, [addExercisesCost, completeStage, book.age, book.id, book.language, generateAllConceptsModel, generateOnlyMissingExercises, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isGeneratingAllExercises, onProcessingComplete, pages, processingPage, refreshEntityCounts, revealPane, totalPages]);

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
        model: selectedLanguageModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addLanguageCost);

      const language = parseDetectedBookLanguage(response.choices[0].message?.content?.trim() ?? '');
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      let updatedBook: Book = { ...book, age: languageChanged ? undefined : book.age, language, subject: automaticSubject ?? (languageChanged ? undefined : book.subject) };

      if (languageChanged) {
        updatedBook = withBookProcessingStagesResetFrom(updatedBook, 'language');
      }

      updatedBook = withCompletedBookProcessingStage(updatedBook, 'language');

      if (automaticSubject) {
        updatedBook = withCompletedBookProcessingStage(updatedBook, 'subject');
      }

      await putBook(updatedBook);
      onBookChange(updatedBook);
      revealPane('language');
    } finally {
      isDetectingBookLanguageRef.current = false;
      setIsDetectingBookLanguage(false);
    }
  }, [addLanguageCost, book, onBookChange, revealPane, selectedLanguageModel, totalPages]);

  const saveManualBookLanguage = useCallback(async (languageValue: string): Promise<void> => {
    const language = normalizeLanguageCode(languageValue);

    if (!language) {
      setError('Choose a valid ISO 639-1 book language.');
      return;
    }

    setError('');

    try {
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      let updatedBook: Book = { ...book, age: languageChanged ? undefined : book.age, language, subject: automaticSubject ?? (languageChanged ? undefined : book.subject) };

      if (languageChanged) {
        updatedBook = withBookProcessingStagesResetFrom(updatedBook, 'language');
      }

      updatedBook = withCompletedBookProcessingStage(updatedBook, 'language');

      if (automaticSubject) {
        updatedBook = withCompletedBookProcessingStage(updatedBook, 'subject');
      }

      await putBook(updatedBook);
      onBookChange(updatedBook);
      revealPane('language');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book language.');
    }
  }, [book, onBookChange, revealPane]);

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

  const openLanguageDetectionConfirmation = useCallback((): void => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book language.');
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const hasAllMiddleText = middlePageNumbers.length > 0 && middlePageNumbers.every((middlePageNumber) => Boolean(pages.get(middlePageNumber)?.pageMMD?.trim()));

    if (!hasAllMiddleText) {
      setError('The middle recognized pages do not contain enough text to detect a language. Choose the language manually.');
      return;
    }

    setError('');
    setIsLanguageDetectionConfirmationOpen(true);
  }, [isMmdConversionComplete, pages, totalPages]);

  const closeLanguageDetectionConfirmation = useCallback((): void => {
    setIsLanguageDetectionConfirmationOpen(false);
  }, []);

  const confirmLanguageDetection = useCallback((): void => {
    setIsLanguageDetectionConfirmationOpen(false);
    redetectBookLanguage().catch(console.error);
  }, [redetectBookLanguage]);

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
      const subjectChanged = book.subject !== automaticSubject;
      let updatedBook: Book = { ...book, age: subjectChanged ? undefined : book.age, subject: automaticSubject };

      if (subjectChanged) {
        updatedBook = withBookProcessingStagesResetFrom(updatedBook, 'subject');
      }

      updatedBook = withCompletedBookProcessingStage(updatedBook, 'subject');
      await putBook(updatedBook);
      onBookChange(updatedBook);
      revealPane('subject');
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
      const subjectChanged = book.subject !== subject;
      let updatedBook: Book = { ...book, age: subjectChanged ? undefined : book.age, subject };

      if (subjectChanged) {
        updatedBook = withBookProcessingStagesResetFrom(updatedBook, 'subject');
      }

      updatedBook = withCompletedBookProcessingStage(updatedBook, 'subject');
      await putBook(updatedBook);
      onBookChange(updatedBook);
      revealPane('subject');
    } finally {
      isDetectingBookSubjectRef.current = false;
      setIsDetectingBookSubject(false);
    }
  }, [addSubjectCost, book, onBookChange, revealPane, selectedSubjectModel, totalPages]);

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
      const subjectChanged = book.subject !== subject;
      let updatedBook: Book = { ...book, age: subjectChanged ? undefined : book.age, subject };

      if (subjectChanged) {
        updatedBook = withBookProcessingStagesResetFrom(updatedBook, 'subject');
      }

      updatedBook = withCompletedBookProcessingStage(updatedBook, 'subject');
      await putBook(updatedBook);
      onBookChange(updatedBook);
      revealPane('subject');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book subject.');
    }
  }, [book, onBookChange, revealPane]);

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

  const detectAndStoreBookAge = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.age !== undefined) || isDetectingBookAgeRef.current) {
      return;
    }

    if (!book.language || !book.subject) {
      if (force) {
        throw new Error('Set the book language and subject before detecting learner age.');
      }

      return;
    }

    const samplePageNumbers = getBookAgeSamplePageNumbers(totalPages, Array.from(recognizedPages.values()).flatMap(({ pageMMD, pageNumber }) => pageMMD?.trim() ? [pageNumber] : []));
    const pageTexts = samplePageNumbers.flatMap((samplePageNumber) => {
      const text = recognizedPages.get(samplePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: samplePageNumber, text }] : [];
    });

    if (!samplePageNumbers.length || samplePageNumbers.length !== Math.min(3, totalPages) || pageTexts.length !== samplePageNumbers.length) {
      if (force) {
        throw new Error('The representative recognized pages do not contain enough text to detect learner age. Enter the age manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or enter the learner age manually.');
      }

      return;
    }

    isDetectingBookAgeRef.current = true;
    setIsDetectingBookAge(true);

    try {
      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }
      });
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_AGE_DETECTION_PROMPT(book.language ?? 'unknown', book.subject ?? 'unknown', pageTexts), role: 'user' }],
        model: selectedAgeModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addAgeCost);

      const age = parseDetectedBookAge(response.choices[0].message?.content?.trim() ?? '');
      const ageChanged = book.age !== age;
      let updatedBook: Book = { ...book, age };

      if (ageChanged) {
        updatedBook = withBookProcessingStagesResetFrom(updatedBook, 'age');
      }

      updatedBook = withCompletedBookProcessingStage(updatedBook, 'age');
      await putBook(updatedBook);
      onBookChange(updatedBook);
      revealPane('age');
    } finally {
      isDetectingBookAgeRef.current = false;
      setIsDetectingBookAge(false);
    }
  }, [addAgeCost, book, onBookChange, revealPane, selectedAgeModel, totalPages]);

  const saveManualBookAge = useCallback(async (): Promise<void> => {
    const age = normalizeBookAge(ageInput);

    if (age === undefined) {
      setError(`Enter a whole-number learner age from ${MIN_BOOK_LEARNER_AGE} through ${MAX_BOOK_LEARNER_AGE}.`);
      return;
    }

    setError('');

    try {
      const ageChanged = book.age !== age;
      let updatedBook: Book = { ...book, age };

      if (ageChanged) {
        updatedBook = withBookProcessingStagesResetFrom(updatedBook, 'age');
      }

      updatedBook = withCompletedBookProcessingStage(updatedBook, 'age');
      await putBook(updatedBook);
      onBookChange(updatedBook);
      revealPane('age');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the learner age.');
    }
  }, [ageInput, book, onBookChange, revealPane]);

  const redetectBookAge = useCallback(async (): Promise<void> => {
    if (!book.language || !book.subject) {
      setError('Set the book language and subject before detecting learner age.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookAge(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine learner age from the representative text pages.');
    }
  }, [book.language, book.subject, detectAndStoreBookAge, pages]);

  const openAgeDetectionConfirmation = useCallback((): void => {
    if (!book.language || !book.subject) {
      setError('Set the book language and subject before detecting learner age.');
      return;
    }

    const hasAllSampleText = ageSamplePageNumbers.length === Math.min(3, totalPages) && ageSamplePageTexts.length === ageSamplePageNumbers.length;

    if (!hasAllSampleText) {
      setError('Recognize the representative sample pages before detecting learner age. You can still enter the age manually.');
      return;
    }

    setError('');
    setIsAgeDetectionConfirmationOpen(true);
  }, [ageSamplePageNumbers, ageSamplePageTexts, book.language, book.subject, totalPages]);

  const closeAgeDetectionConfirmation = useCallback((): void => {
    setIsAgeDetectionConfirmationOpen(false);
  }, []);

  const confirmAgeDetection = useCallback((): void => {
    setIsAgeDetectionConfirmationOpen(false);
    redetectBookAge().catch(console.error);
  }, [redetectBookAge]);

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
        await completeStage('recognize');
      }

      setActivePane('text');
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this page.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [addRecognizeCost, completeStage, book.id, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, pageNumber, pages, processingPage, totalPages]);

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
        await completeStage('recognize');
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
  }, [addRecognizeCost, completeStage, book.id, file, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, pages, processingPage, totalPages]);

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

    if (!isMmdConversionComplete) {
      return;
    }

    handledLanguageTabRequestRef.current = languageTabRequest;

    // Language uses OpenRouter, so the pipeline action must stop at the same
    // estimate/model confirmation gate as the other AI-backed stages.
    openLanguageDetectionConfirmation();
  }, [isMmdConversionComplete, languageTabRequest, openLanguageDetectionConfirmation]);

  useEffect((): void => {
    if (subjectTabRequest === handledSubjectTabRequestRef.current) {
      return;
    }

    if (!isMmdConversionComplete) {
      return;
    }

    handledSubjectTabRequestRef.current = subjectTabRequest;
    openSubjectDetectionConfirmation();
  }, [isMmdConversionComplete, openSubjectDetectionConfirmation, subjectTabRequest]);

  useEffect((): void => {
    if (ageTabRequest === handledAgeTabRequestRef.current) {
      return;
    }

    const hasAllSampleText = ageSamplePageNumbers.length === Math.min(3, totalPages) && ageSamplePageTexts.length === ageSamplePageNumbers.length;

    if (!hasAllSampleText) {
      return;
    }

    handledAgeTabRequestRef.current = ageTabRequest;
    openAgeDetectionConfirmation();
  }, [ageSamplePageNumbers, ageSamplePageTexts, ageTabRequest, openAgeDetectionConfirmation, totalPages]);

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
    generateAllConcepts().catch((generationError) => {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts for all chapters.');
      onProcessingComplete();
    });
  }, [generateAllConcepts, generateAllConceptsRequest, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage, totalPages]);

  useEffect((): void => {
    if (
      fixAllConceptsRequest === handledFixAllConceptsRequestRef.current ||
      !conceptChapters.length ||
      processingPage !== undefined ||
      isGeneratingAllConcepts ||
      isFixingConcepts ||
      isRecognizingAll ||
      isGeneratingAllExercises ||
      isIdentifyingChapters
    ) {
      return;
    }

    handledFixAllConceptsRequestRef.current = fixAllConceptsRequest;
    fixAllConcepts(generateAllConceptsModel, fixOnlyFailedConcepts)
      .catch((fixError) => setError(fixError instanceof Error ? fixError.message : 'Unable to fix chapter concepts.'))
      .finally(onProcessingComplete);
  }, [conceptChapters.length, fixAllConcepts, fixAllConceptsRequest, fixOnlyFailedConcepts, generateAllConceptsModel, isFixingConcepts, isGeneratingAllConcepts, isGeneratingAllExercises, isIdentifyingChapters, isRecognizingAll, onProcessingComplete, processingPage]);

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

    if (!isBookProcessingStageComplete(book, 'fixImages')) {
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
        await completeStage('standards');
        revealPane('standards');
      }
    } finally {
      setIsAssigningStandards(false);
    }
  }, [addStandardsCost, completeStage, book, book.id, book.subject, conceptChapters, isAssigningStandards, isFixingStandards, revealPane, selectedModel, standardsByChapter]);

  const fixStandards = useCallback(async (model = selectedModel): Promise<void> => {
    if (!conceptChapters.length || isAssigningStandards || isFixingStandards) {
      return;
    }

    if (!isBookProcessingStageComplete(book, 'standards')) {
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
        await completeStage('fixStandards');
        revealPane('standards');
      }
    } finally {
      setIsFixingStandards(false);
    }
  }, [addFixStandardsCost, completeStage, book, book.id, book.subject, conceptChapters, isAssigningStandards, isFixingStandards, revealPane, selectedModel, standardsByChapter]);

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

  const goToConceptPage = useCallback((requestedPage: number): void => {
    goToPage(requestedPage);

    const chapterIndex = conceptChapters.findIndex(({ pageNumbers }) => pageNumbers.includes(requestedPage));
    const chapter = chapterIndex >= 0 ? conceptChapters[chapterIndex] : undefined;

    if (chapter) {
      storeSharedChapterSelection(book.id, { chapterId: chapter.chapterId, index: chapterIndex, title: chapter.title });
    }
  }, [book.id, conceptChapters, goToPage]);

  const changeConceptChapter = useCallback((index: number): void => {
    if (!conceptChapters.length) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(index, conceptChapters.length - 1));
    const firstPage = conceptChapters[nextIndex]?.pageNumbers[0];

    if (firstPage !== undefined) {
      goToConceptPage(firstPage);
    }
  }, [conceptChapters, goToConceptPage]);

  useEffect(() => {
    if (activePane !== 'textConcepts' || !conceptChapters.length) {
      return;
    }

    const applySelection = (selection: SharedChapterSelection): void => {
      const nextIndex = resolveSharedChapterIndex(selection, conceptChapters.map(({ chapterId, title }) => ({ id: chapterId, title })));
      const chapter = conceptChapters[nextIndex];

      if (chapter && !chapter.pageNumbers.includes(pageNumber)) {
        const firstPage = chapter.pageNumbers[0];

        if (firstPage !== undefined) {
          goToPage(firstPage);
        }
      }
    };
    const storedSelection = getSharedChapterSelection(book.id);

    if (storedSelection) {
      applySelection(storedSelection);
    }

    return subscribeSharedChapterSelection(book.id, applySelection);
  }, [activePane, book.id, conceptChapters, goToPage, pageNumber]);
  const loadCurrentChapterConcepts = useCallback(async (): Promise<{ concepts: BookConcept[]; references: Map<string, number> }> => {
    if (!currentConceptChapter) {
      return { concepts: [], references: new Map() };
    }

    const [pageRows, pageLessConcepts] = await Promise.all([
      Promise.all(currentConceptChapter.pageNumbers.map(async (chapterPageNumber) => ({
        concepts: await getBookConceptsForBookPage(book.id, chapterPageNumber),
        pageNumber: chapterPageNumber
      }))),
      getBookConceptsForBookPage(book.id, 0)
    ]);
    const rows = [
      ...pageRows,
      {
        concepts: pageLessConcepts.filter(({ chapterId }) => chapterId === currentConceptChapter.chapterId),
        pageNumber: 0
      }
    ];
    const references = new Map<string, number>();

    rows.forEach(({ concepts: pageConcepts, pageNumber: conceptPageNumber }) => pageConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), conceptPageNumber)));

    return {
      concepts: sortConceptsForDisplay(rows.flatMap(({ concepts: pageConcepts }) => pageConcepts)),
      references
    };
  }, [book.id, currentConceptChapter]);

  const reloadCurrentChapterConcepts = useCallback(async (): Promise<void> => {
    const loaded = await loadCurrentChapterConcepts();

    setConcepts(loaded.concepts);
    setConceptFirstPageByKey(loaded.references);
  }, [loadCurrentChapterConcepts]);

  const addConcept = useCallback(async (): Promise<void> => {
    const title = newConceptTitle.trim();

    if (!title || !currentConceptChapter || isSavingNewConcept) {
      return;
    }

    const selectedPage = newConceptPage ? Number(newConceptPage) : undefined;

    if (selectedPage !== undefined && !currentConceptChapter.pageNumbers.includes(selectedPage)) {
      setError('Choose a page from the current chapter or leave Page empty.');

      return;
    }

    if (!Number.isInteger(newConceptAfterIndex) || newConceptAfterIndex < -1 || newConceptAfterIndex >= concepts.length) {
      setError('Choose where the new concept should be inserted.');

      return;
    }

    const insertionIndex = newConceptAfterIndex + 1;
    const chapterPage = pages.get(selectedPage ?? currentConceptChapter.pageNumbers[0]);
    const concept: Omit<BookConcept, 'id'> = {
      bookPage: [book.id, selectedPage ?? 0],
      chapterId: chapterPage?.chapterId ?? currentConceptChapter.chapterId,
      description: newConceptDescription.trim(),
      displayOrder: conceptInsertionDisplayOrder(concepts, insertionIndex),
      manuallyAdded: true,
      title
    };
    const existingIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));

    setIsSavingNewConcept(true);

    try {
      await createBookConcept(concept);

      // Normalize displayOrder after insertion so future drag-and-drop operations
      // start from a simple 0..n order. The preliminary fractional order above
      // still puts the new row in the requested position if normalization cannot
      // run for an unexpected row without an id.
      const loaded = await loadCurrentChapterConcepts();
      const created = loaded.concepts.find(({ description, id, manuallyAdded, title: loadedTitle }) =>
        id !== undefined &&
        !existingIds.has(id) &&
        manuallyAdded === true &&
        loadedTitle === title &&
        description === newConceptDescription.trim()
      ) ?? loaded.concepts.find(({ id }) => id !== undefined && !existingIds.has(id));
      const existingConceptIds = concepts.flatMap(({ id }) => id === undefined ? [] : [id]);

      if (created?.id !== undefined && existingConceptIds.length === concepts.length) {
        const orderedIds = [...existingConceptIds];

        orderedIds.splice(insertionIndex, 0, created.id);
        await reorderBookConcepts(orderedIds);
      }

      await reloadCurrentChapterConcepts();
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setNewConceptAfterIndex(-1);
      setNewConceptDescription('');
      setNewConceptPage('');
      setNewConceptTitle('');
      setIsAddingConcept(false);
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add the concept.');
      throw caught;
    } finally {
      setIsSavingNewConcept(false);
    }
  }, [book.id, concepts, currentConceptChapter, isSavingNewConcept, loadCurrentChapterConcepts, newConceptAfterIndex, newConceptDescription, newConceptPage, newConceptTitle, pages, refreshConceptCounts, refreshEntityCounts, reloadCurrentChapterConcepts]);

  const reorderConcepts = useCallback(async (fromIndex: number, toIndex: number): Promise<void> => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= concepts.length || toIndex >= concepts.length || isReorderingConcepts) {
      return;
    }

    const previous = concepts;
    const reordered = [...concepts];
    const [moved] = reordered.splice(fromIndex, 1);

    reordered.splice(toIndex, 0, moved);

    const orderedConcepts = reordered.map((concept, index) => ({ ...concept, displayOrder: index }));
    const sortedIds = orderedConcepts.flatMap(({ id }) => id === undefined ? [] : [id]);

    if (sortedIds.length !== orderedConcepts.length) {
      setError('Unable to reorder a concept without an id.');

      return;
    }

    reorderedConceptFocusIdRef.current = moved.id;
    setConcepts(orderedConcepts);
    setIsReorderingConcepts(true);

    try {
      await reorderBookConcepts(sortedIds);
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      setConcepts(previous);
      setError(caught instanceof Error ? caught.message : 'Unable to reorder concepts.');
    } finally {
      setIsReorderingConcepts(false);
    }
  }, [concepts, isReorderingConcepts]);

  useLayoutEffect((): void => {
    const conceptId = reorderedConceptFocusIdRef.current;
    const scroller = conceptsOutputRef.current;

    if (conceptId === undefined || !scroller) {
      return;
    }

    const movedRow = Array.from(scroller.querySelectorAll<HTMLElement>('.conceptItem'))
      .find((row) => row.dataset.conceptId === String(conceptId));

    if (!movedRow) {
      return;
    }

    reorderedConceptFocusIdRef.current = undefined;
    movedRow.scrollIntoView({ block: 'nearest' });
    movedRow.focus({ preventScroll: true });
  }, [concepts]);
  const clearConceptDropMarker = useCallback((): void => {
    const scroller = conceptsOutputRef.current;

    scroller?.querySelector('.conceptItem.conceptDropBefore')?.classList.remove('conceptDropBefore');
    scroller?.querySelector('.conceptItem.conceptDropAfter')?.classList.remove('conceptDropAfter');
  }, []);

  const updateConceptDropTarget = useCallback((pointerY: number): void => {
    const scroller = conceptsOutputRef.current;
    const sourceIndex = draggedConceptIndexRef.current;

    if (!scroller || sourceIndex === undefined) {
      return;
    }

    const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.conceptItem'));
    const otherRows = rows.filter((_, index) => index !== sourceIndex);

    clearConceptDropMarker();

    if (!otherRows.length) {
      conceptDropTargetIndexRef.current = sourceIndex;

      return;
    }

    let insertionIndex = otherRows.length;

    for (let index = 0; index < otherRows.length; index++) {
      const bounds = otherRows[index].getBoundingClientRect();

      if (pointerY < bounds.top + (bounds.height / 2)) {
        insertionIndex = index;
        break;
      }
    }

    conceptDropTargetIndexRef.current = insertionIndex;

    if (insertionIndex < otherRows.length) {
      otherRows[insertionIndex].classList.add('conceptDropBefore');
    } else {
      otherRows[otherRows.length - 1].classList.add('conceptDropAfter');
    }
  }, [clearConceptDropMarker]);

  const stopConceptAutoScroll = useCallback((): void => {
    conceptDragPointerYRef.current = undefined;

    if (conceptAutoScrollFrameRef.current !== undefined) {
      window.cancelAnimationFrame(conceptAutoScrollFrameRef.current);
      conceptAutoScrollFrameRef.current = undefined;
    }
  }, []);

  const startConceptAutoScroll = useCallback((): void => {
    if (conceptAutoScrollFrameRef.current !== undefined) {
      return;
    }

    const scroll = (): void => {
      conceptAutoScrollFrameRef.current = undefined;

      const scroller = conceptsOutputRef.current;
      const pointerY = conceptDragPointerYRef.current;

      if (!scroller || pointerY === undefined) {
        return;
      }

      const bounds = scroller.getBoundingClientRect();
      const edgeSize = Math.min(96, Math.max(48, bounds.height * 0.22));
      const topDistance = pointerY - bounds.top;
      const bottomDistance = bounds.bottom - pointerY;
      let scrollAmount = 0;

      if (topDistance < edgeSize && scroller.scrollTop > 0) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, topDistance)) / edgeSize));

        scrollAmount = -(4 + (20 * strength));
      } else if (bottomDistance < edgeSize && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, bottomDistance)) / edgeSize));

        scrollAmount = 4 + (20 * strength);
      }

      if (scrollAmount !== 0) {
        scroller.scrollTop += scrollAmount;
        updateConceptDropTarget(pointerY);
      }

      conceptAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };

    conceptAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
  }, [updateConceptDropTarget]);

  const finishConceptDrag = useCallback((): void => {
    stopConceptAutoScroll();
    draggedConceptIndexRef.current = undefined;
    conceptDropTargetIndexRef.current = undefined;
    conceptDragPointerIdRef.current = undefined;
    clearConceptDropMarker();
    conceptsOutputRef.current?.classList.remove('conceptDragging');
    conceptsOutputRef.current?.querySelector('.conceptItem.dragging')?.classList.remove('dragging');
  }, [clearConceptDropMarker, stopConceptAutoScroll]);

  const beginConceptPointerDrag = useCallback((index: number, event: React.PointerEvent<HTMLLIElement>): void => {
    if (isReorderingConcepts || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    const target = event.target as HTMLElement;

    // Only start reordering from the dedicated drag handle. This keeps clicks,
    // text selection, and scrolling on the title/description from starting a drag.
    if (!target.closest('.conceptDragHandle')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }

    draggedConceptIndexRef.current = index;
    conceptDropTargetIndexRef.current = index;
    conceptDragPointerIdRef.current = event.pointerId;
    conceptDragPointerYRef.current = event.clientY;
    event.currentTarget.classList.add('dragging');
    conceptsOutputRef.current?.classList.add('conceptDragging');
    updateConceptDropTarget(event.clientY);
    startConceptAutoScroll();
  }, [isReorderingConcepts, startConceptAutoScroll, updateConceptDropTarget]);

  const moveConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId || draggedConceptIndexRef.current === undefined) {
      return;
    }

    event.preventDefault();
    conceptDragPointerYRef.current = event.clientY;
    updateConceptDropTarget(event.clientY);
    startConceptAutoScroll();
  }, [startConceptAutoScroll, updateConceptDropTarget]);

  const cancelConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    finishConceptDrag();
  }, [finishConceptDrag]);

  const endConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const sourceIndex = draggedConceptIndexRef.current;
    const targetIndex = conceptDropTargetIndexRef.current;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore browsers that release capture automatically before pointerup.
    }

    finishConceptDrag();

    if (sourceIndex !== undefined && targetIndex !== undefined && sourceIndex !== targetIndex) {
      void reorderConcepts(sourceIndex, targetIndex);
    }
  }, [finishConceptDrag, reorderConcepts]);

  useEffect(() => finishConceptDrag, [finishConceptDrag]);

  const openConceptInsertion = useCallback((): void => {
    setNewConceptAfterIndex(concepts.length - 1);
    setIsAddingConcept(true);
  }, [concepts.length]);

  const closeConceptInsertion = useCallback((): void => {
    if (isSavingNewConcept) {
      return;
    }

    setIsAddingConcept(false);
    setNewConceptAfterIndex(-1);
    setNewConceptDescription('');
    setNewConceptPage('');
    setNewConceptTitle('');
  }, [isSavingNewConcept]);

  const conceptInsertionOptions = useMemo(() => [
    { text: 'Beginning of chapter', value: -1 },
    ...concepts.map((concept, index) => ({
      text: concept.title || `Concept ${index + 1}`,
      value: index
    }))
  ], [concepts]);

  const saveConcept = useCallback(async (concept: BookConcept, title: string, description: string): Promise<void> => {
    if (concept.id === undefined) {
      setError('Unable to edit a concept without an id.');

      return;
    }

    try {
      await updateBookConcept(concept.id, { description, title });
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
      await deleteConceptAndDependencies(book.id, concept, Array.from(pages.keys()));
      const referenceKey = conceptReferenceKey(concept);

      setConcepts((current) => current.filter(({ id }) => id !== concept.id));
      setConceptFirstPageByKey((current) => {
        const next = new Map(current);

        next.delete(referenceKey);

        return next;
      });
      setSkillsRefreshToken((value) => value + 1);
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to delete the concept.';

      setError(message);
      throw caught;
    }
  }, [book.id, pages, refreshConceptCounts, refreshEntityCounts]);

  const saveExercise = useCallback(async (exerciseId: number, value: ExerciseEditableFields): Promise<void> => {
    if (!currentExerciseChapter) {
      throw new Error('Unable to find the chapter containing this Exercise.');
    }

    try {
      const pageRows = await Promise.all(currentExerciseChapter.pageNumbers.map(async (chapterPageNumber) => ({
        exercises: await getExercisesForBookPage([book.id, chapterPageNumber]),
        pageNumber: chapterPageNumber
      })));
      const row = pageRows.find(({ exercises }) => exercises.some(({ id }) => id === exerciseId));

      if (!row) {
        throw new Error('Unable to find the page containing this Exercise.');
      }

      const originalExercises = row.exercises;
      const updatedExercises = originalExercises.map((exercise) => exercise.id === exerciseId ? { ...exercise, ...value } : exercise);
      const abilityContentsByExerciseId = new Map<number, string[]>();

      await Promise.all(originalExercises.map(async ({ id }) => {
        if (id !== undefined) {
          abilityContentsByExerciseId.set(id, (await getAbilities(exerciseAbilityModuleId(book.id, id))).map(({ content }) => content));
        }
      }));

      await replaceExercisesForBookPage([book.id, row.pageNumber], updatedExercises.map(exerciseForPageReplacement));

      const storedExercises = await getExercisesForBookPage([book.id, row.pageNumber]);

      if (storedExercises.length !== originalExercises.length || storedExercises.some(({ id }) => id === undefined)) {
        throw new Error('Unable to remap Exercises after saving the edit.');
      }

      for (let index = 0; index < originalExercises.length; index++) {
        const oldId = originalExercises[index].id;
        const newId = storedExercises[index].id as number;

        if (oldId === undefined || oldId === newId) {
          continue;
        }

        const contents = abilityContentsByExerciseId.get(oldId) ?? [];

        if (contents.length) {
          await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
        }

        await deleteAbilities(exerciseAbilityModuleId(book.id, oldId));
      }

      const refreshedExercises = (await Promise.all(currentExerciseChapter.pageNumbers.map((chapterPageNumber) => getExercisesForBookPage([book.id, chapterPageNumber])))).flat();

      setExerciseChapterExercises(refreshedExercises);
      setSkillsRefreshToken((token) => token + 1);
      await refreshEntityCounts();
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save the Exercise.';

      setError(message);
      throw caught;
    }
  }, [book.id, currentExerciseChapter, refreshEntityCounts]);

  const submitPageInput = useCallback((): void => {
    const requestedPage = Number(pageInput);

    if (Number.isInteger(requestedPage)) {
      if (activePane === 'textConcepts') {
        goToConceptPage(requestedPage);
      } else {
        goToPage(requestedPage);
      }
    } else {
      setPageInput(String(pageNumber));
    }
  }, [activePane, goToConceptPage, goToPage, pageInput, pageNumber]);

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

  const agePane = (): React.ReactNode => {
    const manualAge = normalizeBookAge(ageInput);

    return <div className='tabPanel languagePanel'>
      <div className='detailsHeader'>
        <span>{isDetectingBookAge ? 'Detecting learner age…' : `Learner age: ${bookAgeLabel(book.age)}`}</span>
      </div>
      <div className='languageActions'>
        <div className='ageManualEditor'>
          <label>
            <span>Age in years</span>
            <input
              aria-label='Learner age in years'
              disabled={isDetectingBookAge}
              max={MAX_BOOK_LEARNER_AGE}
              min={MIN_BOOK_LEARNER_AGE}
              onChange={({ target }) => setAgeInput(target.value)}
              onKeyDown={({ key }) => key === 'Enter' && saveManualBookAge().catch(console.error)}
              step={1}
              type='number'
              value={ageInput}
            />
          </label>
          <Button
            icon='save'
            isDisabled={isDetectingBookAge || manualAge === undefined}
            label='Save age'
            onClick={() => saveManualBookAge().catch(console.error)}
          />
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
          <div className='chapterListHeader'>
            <h4>Book chapters</h4>
            <Button
              icon='trash-can'
              isDisabled={!selectedChapterIds.size || isDeletingChapters || isIdentifyingChapters}
              label={isDeletingChapters ? 'Deleting…' : `Delete selected${selectedChapterIds.size ? ` (${selectedChapterIds.size})` : ''}`}
              onClick={() => setIsDeleteChaptersConfirmationOpen(true)}
            />
          </div>
          <p className='chapterListHint'>Deleting a chapter excludes its pages from Concepts and later analysis. The recognized page text stays in the book.</p>
          <div className='chapterRows'>
            <SelectableList<BookChapter>
              items={chapters}
              allSelected={false}
              renderItem={(chapter, _isSelected, isSelectionAllowed) => {
                const chapterPages = chapter.id === undefined ? [] : Array.from(pages.values()).filter(({ chapterId }) => chapterId === chapter.id).map(({ pageNumber }) => pageNumber).sort((a, b) => a - b);
                const first = chapterPages[0];
                const last = chapterPages[chapterPages.length - 1];
                const chapterNumber = chapters.indexOf(chapter) + (chapters[0]?.title.trim().toLocaleLowerCase().replace(/[\s-]+/g, '') === 'frontmatter' ? 0 : 1);
                const isSelected = chapter.id !== undefined && selectedChapterIds.has(chapter.id);

                return <div className='chapterListRow' key={chapter.id ?? chapter.title}>
                  {chapter.id !== undefined && <Button
                    className='inList'
                    icon={isSelected ? 'check' : 'square'}
                    isDisabled={!isSelectionAllowed}
                    onClick={() => toggleChapterSelection(chapter.id!)}
                  />}
                  <span className='chapterNumber'>{chapterNumber}.</span>
                  <span><button className='chapterLink' onClick={() => first && goToPage(first)} type='button'>{chapter.title}</button>{first ? ` — pages ${first}${last !== first ? `–${last}` : ''}` : ''}{chapter.source === 'manual' ? ' · manual' : chapter.confidence === undefined ? '' : ` · ${(chapter.confidence * 100).toFixed(0)}%`}</span>
                </div>;
              }}
              onSelectionChange={() => {}}
              isSelectionAllowed={!isDeletingChapters && !isIdentifyingChapters}
              keyExtractor={(chapter) => String(chapter.id ?? chapter.title)}
              key={chapters.map(({ id, title }) => String(id ?? title)).join(':')}
            />
          </div>
          {isDeleteChaptersConfirmationOpen && <Confirmation
            onClose={() => !isDeletingChapters && setIsDeleteChaptersConfirmationOpen(false)}
            onConfirm={() => {
              setIsDeleteChaptersConfirmationOpen(false);
              deleteSelectedChapters().catch(console.error);
            }}
            question={`Delete ${selectedChapterIds.size} selected chapter${selectedChapterIds.size === 1 ? '' : 's'}?`}
          />}
        </section>
      </div>
    </div>;
  };

  const conceptsStatus = isGeneratingAllConcepts
    ? `Generating concepts by chapter… ${generatedConceptsChapterCount}/${conceptChapters.length}`
    : isFixingConcepts
      ? `Fixing concepts by chapter… ${fixedConceptsChapterCount}/${conceptChapters.length}`
      : isGeneratingAllExercises
      ? `Generating exercises… ${generatedExercisesPageCount}/${totalPages}`
      : isGeneratingChapterConcepts
        ? 'Extracting and saving concepts for this chapter…'
        : 'Concepts';
  const exerciseItem = (exercise: Exercise): React.ReactNode => <EditableExerciseItem
    exercise={exercise}
    key={exercise.id}
    onError={setError}
    onSave={saveExercise}
  />;
  const focusExerciseConcept = (conceptIndex: number): void => {
    const conceptSection = exerciseConceptsOutputRef.current?.querySelector<HTMLElement>(`[data-concept-rank="${conceptIndex + 1}"]`);

    if (!conceptSection) {
      return;
    }

    conceptSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    conceptSection.focus({ preventScroll: true });
  };
  const conceptsPane = (): React.ReactNode => {
    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'>
        <span>{conceptsStatus}</span>
        <Button
          icon='plus'
          isDisabled={!currentConceptChapter || isAddingConcept || isReorderingConcepts || isSavingNewConcept}
          label='Add concept'
          onClick={openConceptInsertion}
        />
      </div>
      {isAddingConcept && currentConceptChapter && <Modal
        header='Add concept'
        onClose={closeConceptInsertion}
        size='small'
      >
        <Modal.Content>
          <ConceptForm>
            <Input
              autoFocus
              isDisabled={isSavingNewConcept}
              isFull
              label='Concept title'
              onChange={setNewConceptTitle}
              onEnter={() => { void addConcept().catch(console.error); }}
              value={newConceptTitle}
            />
            <label>
              <span>Description</span>
              <textarea
                disabled={isSavingNewConcept}
                onChange={({ target }) => setNewConceptDescription(target.value)}
                rows={5}
                value={newConceptDescription}
              />
            </label>
            <Dropdown
              isDisabled={isSavingNewConcept}
              isFull
              label='Page (optional)'
              onChange={setNewConceptPage}
              options={[
                { text: 'No page', value: '' },
                ...currentConceptChapter.pageNumbers.map((chapterPageNumber) => ({ text: String(chapterPageNumber), value: String(chapterPageNumber) }))
              ]}
              value={newConceptPage}
            />
            <Dropdown
              isDisabled={isSavingNewConcept}
              isFull
              label='Insert after concept'
              onChange={setNewConceptAfterIndex}
              options={conceptInsertionOptions}
              value={newConceptAfterIndex}
            />
            <Button.Group>
              <Button
                icon='times'
                isDisabled={isSavingNewConcept}
                label='Cancel'
                onClick={closeConceptInsertion}
              />
              <Button
                icon='save'
                isDisabled={isSavingNewConcept || !newConceptTitle.trim()}
                label={isSavingNewConcept ? 'Adding…' : 'Add'}
                onClick={() => addConcept().catch(console.error)}
              />
            </Button.Group>
          </ConceptForm>
        </Modal.Content>
      </Modal>}
      {!currentConceptChapter && <p className='recognitionHint'>Identify or assign this page to a chapter before generating concepts.</p>}
      <div
        className='conceptsOutput'
        ref={conceptsOutputRef}
      >
        <section className='conceptExerciseGroup'>
          {concepts.length
            ? <ul className='conceptList'>{concepts.map((concept, index) => {
              const displayPage = conceptDisplayPage(concept);

              return <ConceptItem
                concept={concept}
                conceptNumber={index + 1}
                firstPage={displayPage}
                key={concept.id ?? conceptReferenceKey(concept)}
                onDelete={deleteConcept}
                onReorderPointerCancel={cancelConceptPointerDrag}
                onReorderPointerDown={(event) => beginConceptPointerDrag(index, event)}
                onReorderPointerMove={moveConceptPointerDrag}
                onReorderPointerUp={endConceptPointerDrag}
                onGoToPage={goToConceptPage}
                onSave={saveConcept}
              />;
            })}</ul>
            : <p className='emptyOutput'>No concepts in this chapter.</p>}
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
    const missingConceptIndexes = missingGeneratedExerciseConceptIndexes(exerciseChapterConcepts, exerciseChapterExercises);

    return <div className='tabPanel conceptsPanel'>
      <div className='detailsHeader'><span>{isExerciseChapterLoading ? 'Loading chapter exercises…' : 'Exercises grouped by concept'}</span></div>
      {!isExerciseChapterLoading && !!missingConceptIndexes.length && <div className='missingExerciseNavigation'>
        <span>Missing exercises for concepts:</span>
        <span className='missingExerciseLinks'>{missingConceptIndexes.map((conceptIndex, missingIndex) => <React.Fragment key={conceptReferenceKey(exerciseChapterConcepts[conceptIndex])}>
          {missingIndex > 0 && <span aria-hidden='true'>, </span>}
          <button
            aria-label={`Go to concept ${conceptIndex + 1}, missing an exercise`}
            onClick={() => focusExerciseConcept(conceptIndex)}
            type='button'
          >{conceptIndex + 1}</button>
        </React.Fragment>)}</span>
      </div>}
      <div
        className='conceptsOutput'
        ref={exerciseConceptsOutputRef}
      >
        <h3>{currentExerciseChapter?.title || 'Chapter not identified'}</h3>
        {!currentExerciseChapter
          ? <p className='emptyOutput'>No processed chapters are available.</p>
          : <>
            {exerciseChapterConcepts.map((concept, conceptIndex) => {
              const generated = exerciseChapterExercises.filter(({ conceptId, source }) => source === 'generated' && concept.id !== undefined && conceptId === concept.id);

              return <section
                className='conceptExerciseGroup exerciseConceptCard'
                data-concept-rank={conceptIndex + 1}
                key={conceptReferenceKey(concept)}
                tabIndex={-1}
              >
                <h4><span className='conceptExerciseRank'>{conceptIndex + 1}.</span> <KatexSpan content={concept.title} /></h4>
                {concept.description && <p><KatexSpan content={concept.description} /></p>}
                {generated.length ? <ul>{generated.map(exerciseItem)}</ul> : <p className='emptyOutput'>No generated exercises for this concept.</p>}
              </section>;
            })}
            {!!generatedWithoutConcept.length && <section className='conceptExerciseGroup exerciseConceptCard'>
              <h4>Other generated exercises</h4>
              <ul>{generatedWithoutConcept.map(exerciseItem)}</ul>
            </section>}
          </>}
      </div>
    </div>;
  };

  const currentFixConceptsReviewChapter = fixConceptsReview?.chapters[Math.min(fixConceptsReviewChapterIndex, Math.max(0, fixConceptsReview.chapters.length - 1))];
  const fixConceptsReviewConceptCard = (concept: BookConcept, conceptNumber: number, action?: React.ReactNode): React.ReactNode => {
    const displayPage = conceptDisplayPage(concept);

    return <div className='fixConceptsReviewCard'>
      <div className='fixConceptsReviewConceptHeading'>
        <strong><span className='conceptNumber'>{conceptNumber}.</span> <KatexSpan content={concept.title} /></strong>
        {(displayPage !== undefined || action) && <span className='fixConceptsReviewMeta'>
          {displayPage !== undefined && <span className='fixConceptsReviewPage'>Page {displayPage}</span>}
          {action}
        </span>}
      </div>
      {concept.description && <p><KatexSpan content={concept.description} /></p>}
    </div>;
  };
  const fixConceptsReviewRows = (reviewChapter: FixConceptsReviewChapter): React.ReactNode => {
    if (!reviewChapter.before.length && !reviewChapter.missing.length) {
      return <p className='fixConceptsReviewEmpty'>No concepts in this chapter.</p>;
    }

    const removedKeys = new Set(reviewChapter.removed.map(conceptReferenceKey));

    return <>
      {reviewChapter.before.map((concept, index) => {
        const isRemoved = removedKeys.has(conceptReferenceKey(concept));

        return isRemoved
          ? <div
            className='fixConceptsReviewRow isRemoval'
            key={`existing-${conceptReferenceKey(concept)}`}
          >
            <div className='fixConceptsReviewCell isBefore'>
              <span className='fixConceptsReviewChangeLabel'>Before</span>
              {fixConceptsReviewConceptCard(concept, index + 1)}
            </div>
            <div className='fixConceptsReviewCell isAfter'>
              <span className='fixConceptsReviewChangeLabel'>After</span>
              <div className='fixConceptsReviewRemovedAfter'>
                <span>Concept will be removed</span>
                <Button
                  isDisabled={isApplyingFixConceptsReview}
                  label='Keep'
                  onClick={() => toggleFixConceptsReviewRemoval(fixConceptsReviewChapterIndex, concept)}
                />
              </div>
            </div>
          </div>
          : <div
            className='fixConceptsReviewRow isUnchanged'
            key={`existing-${conceptReferenceKey(concept)}`}
          >
            <div className='fixConceptsReviewCell'>{fixConceptsReviewConceptCard(concept, index + 1, <Button
              icon='trash'
              isDisabled={isApplyingFixConceptsReview || concept.id === undefined}
              label='Delete'
              onClick={() => toggleFixConceptsReviewRemoval(fixConceptsReviewChapterIndex, concept)}
            />)}</div>
          </div>;
      })}
      {reviewChapter.missing.map((concept, missingIndex) => <div
        className='fixConceptsReviewRow'
        key={`proposed-${concept.pageNumber}-${concept.title}-${missingIndex}`}
      >
        <div className='fixConceptsReviewCell isBefore'>
          <span className='fixConceptsReviewChangeLabel'>Before</span>
          <div className='fixConceptsReviewMissingBefore'>Not present before</div>
        </div>
        <div className='fixConceptsReviewCell isAfter'>
          <span className='fixConceptsReviewChangeLabel'>After</span>
          <div className='fixConceptsReviewCard isProposed'>
            <div className='fixConceptsReviewConceptHeading'>
              <strong><span className='conceptNumber'>{reviewChapter.before.length + missingIndex + 1}.</span> <KatexSpan content={concept.title} /></strong>
              <span className='fixConceptsReviewMeta'>
                <span className='fixConceptsReviewProposed'>Proposed</span>
                <span className='fixConceptsReviewPage'>Page {concept.pageNumber}</span>
                <Button
                  icon='trash'
                  isDisabled={isApplyingFixConceptsReview}
                  label='Remove'
                  onClick={() => removeFixConceptsReviewConcept(fixConceptsReviewChapterIndex, missingIndex)}
                />
              </span>
            </div>
            <p><KatexSpan content={concept.description} /></p>
          </div>
        </div>
      </div>)}
    </>;
  };

  return (
    <StyledReader className={`bookReader${isMaximized ? ' isMaximized' : ''}`}>
      {fixConceptsReview && currentFixConceptsReviewChapter && <Modal
        header='Review Fix concepts changes'
        onClose={discardFixConceptsReview}
        size='large'
      >
        <Modal.Content>
          <FixConceptsReviewContent>
          <div className='fixConceptsReviewIntro'>
            <p><strong>No concept changes have been saved yet.</strong></p>
            <label>Chapter <select
              aria-label='Review Fix concepts chapter'
              disabled={isApplyingFixConceptsReview}
              onChange={({ target }) => setFixConceptsReviewChapterIndex(Number(target.value))}
              value={fixConceptsReviewChapterIndex}
            >
              {fixConceptsReview.chapters.map(({ chapter, missing, removed }, index) => <option
                key={fixConceptsChapterKey(chapter)}
                value={index}
              >{chapter.title || 'Chapter not identified'} ({missing.length} add, {removed.length} remove)</option>)}
            </select><span>{fixConceptsReviewChapterIndex + 1} of {fixConceptsReview.chapters.length}</span></label>
          </div>
          <div className='fixConceptsReviewComparison'>
            <div className='fixConceptsReviewConcepts'>{fixConceptsReviewRows(currentFixConceptsReviewChapter)}</div>
          </div>
          <section className='fixConceptsDifference'>
            <h3>Difference</h3>
            {currentFixConceptsReviewChapter.missing.length || currentFixConceptsReviewChapter.removed.length
              ? <>
                <p>{currentFixConceptsReviewChapter.missing.length} concept{currentFixConceptsReviewChapter.missing.length === 1 ? '' : 's'} selected to add and {currentFixConceptsReviewChapter.removed.length} existing concept{currentFixConceptsReviewChapter.removed.length === 1 ? '' : 's'} selected to remove. Use Remove/Delete or Keep above to adjust the final changes before saving.</p>
                {!!currentFixConceptsReviewChapter.missing.length && <>
                  <h4>Add</h4>
                  <ul>{currentFixConceptsReviewChapter.missing.map((concept) => <li key={`add-${concept.pageNumber}-${concept.title}`}><strong><KatexSpan content={concept.title} /></strong> — page {concept.pageNumber}</li>)}</ul>
                </>}
                {!!currentFixConceptsReviewChapter.removed.length && <>
                  <h4>Remove</h4>
                  <ul>{currentFixConceptsReviewChapter.removed.map((concept) => <li key={`remove-${conceptReferenceKey(concept)}`}><strong><KatexSpan content={concept.title} /></strong>{conceptDisplayPage(concept) !== undefined ? ` — page ${conceptDisplayPage(concept)}` : ''}</li>)}</ul>
                </>}
              </>
              : <p>No changes are proposed for this chapter. You can still mark an existing concept for deletion if it does not belong here.</p>}
          </section>
          {!!fixConceptsReview.failedChapters.length && <p className='fixConceptsReviewWarning'>
            {fixConceptsReview.failedChapters.length} of {fixConceptsReview.targetChapterCount} chapter{fixConceptsReview.failedChapters.length === 1 ? '' : 's'} could not be prepared and will remain marked for retry if you apply the reviewed changes.
          </p>}
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isApplyingFixConceptsReview}
              label='Discard changes'
              onClick={discardFixConceptsReview}
            />
            <Button
              icon='check'
              isDisabled={isApplyingFixConceptsReview}
              label={isApplyingFixConceptsReview ? 'Applying…' : 'Apply changes'}
              onClick={() => { void applyFixConceptsReview(); }}
            />
          </Button.Group>
          </FixConceptsReviewContent>
        </Modal.Content>
      </Modal>}
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
      {isLanguageDetectionConfirmationOpen && <Modal
        header='Detect book language'
        onClose={closeLanguageDetectionConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>Detect the primary language? You can change the result manually afterward.</p>
          <AiPriceEstimate estimate={languageDetectionEstimate} />
          <OpenRouterModelSelector
            className='modelSelect'
            onChange={setSelectedLanguageModel}
            value={selectedLanguageModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label='Cancel'
              onClick={closeLanguageDetectionConfirmation}
            />
            <Button
              icon='play'
              label='Detect'
              onClick={confirmLanguageDetection}
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
            : 'Detect the primary subject? You can change the result manually afterward.'}</p>
          <AiPriceEstimate estimate={subjectDetectionEstimate} />
          {!automaticBookSubjectForLanguage(book.language) && <OpenRouterModelSelector
            className='modelSelect'
            onChange={setSelectedSubjectModel}
            value={selectedSubjectModel}
          />}
          <Button.Group>
            <Button
              icon='times'
              label='Cancel'
              onClick={closeSubjectDetectionConfirmation}
            />
            <Button
              icon='play'
              label='Detect'
              onClick={confirmSubjectDetection}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isAgeDetectionConfirmationOpen && <Modal
        header='Detect learner age'
        onClose={closeAgeDetectionConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>Detect one typical learner age? The result can be changed manually afterward.</p>
          <AiPriceEstimate estimate={ageDetectionEstimate} />
          <OpenRouterModelSelector
            className='modelSelect'
            onChange={setSelectedAgeModel}
            value={selectedAgeModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label='Cancel'
              onClick={closeAgeDetectionConfirmation}
            />
            <Button
              icon='play'
              label='Detect'
              onClick={confirmAgeDetection}
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
          <AiPriceEstimate estimate={chapterGenerationEstimate} />
          <p>This sends the whole chapter to the AI in one request, deduplicates concepts across its pages, and saves each concept on the page where it was first introduced. Exercises in the book are ignored; generated exercises run in the next pipeline step.</p>
          <OpenRouterModelSelector
            className='modelSelect'
            isDisabled={processingPage !== undefined || isGeneratingAllConcepts || isIdentifyingChapters || isRecognizingAll}
            onChange={setSelectedModel}
            requiredInputModalities={['image']}
            value={selectedModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label='Cancel'
              onClick={closePageGenerationConfirmation}
            />
            <Button
              icon='play'
              label='Generate'
              onClick={confirmPageGeneration}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {(pendingProcessingAction || processingPage !== undefined || isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || isRecognizingAll || isIdentifyingChapters || isGeneratingAllConcepts || isFixingConcepts || isAssigningStandards || isFixingStandards || isGeneratingAllExercises) && <div className='processingOverlay'>
        <RoundProgress
          total={isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined ? 1 : isFixingConcepts || pendingProcessingAction === 'fixConcepts' ? Math.max(1, fixConceptsTargetChapterCount || conceptChapters.length) : isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isAssigningStandards || pendingProcessingAction === 'standards' || isFixingStandards || pendingProcessingAction === 'fixStandards' ? Math.max(1, conceptChapters.length) : Math.max(1, totalPages)}
          value={isDetectingBookLanguage || isDetectingBookSubject || isDetectingBookAge || processingPage !== undefined ? 0 : isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isIdentifyingChapters || pendingProcessingAction === 'chapters' ? identifiedChapterPageCount : isFixingConcepts || pendingProcessingAction === 'fixConcepts' ? fixedConceptsChapterCount : isAssigningStandards || pendingProcessingAction === 'standards' ? standardsAssignedChapterCount : isFixingStandards || pendingProcessingAction === 'fixStandards' ? standardsFixedChapterCount : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? generatedExercisesPageCount : generatedConceptsChapterCount}
        />
        <strong>{isGeneratingChapterConcepts ? `Processing chapter ${currentConceptChapter?.title || ''}` : processingPage !== undefined ? `Processing page ${processingPage}` : isDetectingBookLanguage ? 'Detecting book language' : isDetectingBookSubject ? 'Detecting book subject' : isDetectingBookAge ? 'Detecting learner age' : isRecognizingAll || pendingProcessingAction === 'recognize' ? 'Recognizing pages' : isIdentifyingChapters || pendingProcessingAction === 'chapters' ? chapterIdentificationLabel : isFixingConcepts || pendingProcessingAction === 'fixConcepts' ? 'Finding missing chapter concepts' : isAssigningStandards || pendingProcessingAction === 'standards' ? 'Matching standards to chapter concepts' : isFixingStandards || pendingProcessingAction === 'fixStandards' ? 'Fixing standards from chapter concepts' : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? 'Generating exercises' : 'Extracting concepts by chapter'}</strong>
        {processingPage === undefined && !isDetectingBookLanguage && !isDetectingBookSubject && !isDetectingBookAge && <span>{isRecognizingAll || pendingProcessingAction === 'recognize' ? recognizedPageCount : isIdentifyingChapters || pendingProcessingAction === 'chapters' ? identifiedChapterPageCount : isFixingConcepts || pendingProcessingAction === 'fixConcepts' ? fixedConceptsChapterCount : isAssigningStandards || pendingProcessingAction === 'standards' ? standardsAssignedChapterCount : isFixingStandards || pendingProcessingAction === 'fixStandards' ? standardsFixedChapterCount : isGeneratingAllExercises || pendingProcessingAction === 'exercises' ? generatedExercisesPageCount : generatedConceptsChapterCount} / {isFixingConcepts || pendingProcessingAction === 'fixConcepts' ? (fixConceptsTargetChapterCount || conceptChapters.length) : isGeneratingAllConcepts || pendingProcessingAction === 'concepts' || isAssigningStandards || pendingProcessingAction === 'standards' || isFixingStandards || pendingProcessingAction === 'fixStandards' ? conceptChapters.length : totalPages}</span>}
        <span className='openRouterSpend'>Spent this stage: {formatOpenRouterSpend(openRouterSpent)}</span>
      </div>}
      <Skills
        book={book}
        externalRefreshToken={skillsRefreshToken}
        onAction={revealPane}
        onBookChange={onBookChange}
        onContentChange={onSkillsContentChange}
        onEntityCountsChange={onSkillsEntityCountsChange}
        pipelineControls={<>
          <Button
            className='pipelinePriceButton'
            icon='dollar-sign'
            isDisabled={isPriceDisabled}
            label={t('Price')}
            onClick={onPrice}
          />
          <Button
            className='pipelineZoomButton'
            icon={isMaximized ? 'compress' : 'search-plus'}
            onClick={() => setIsMaximized((value) => !value)}
          />
        </>}
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
          ['text', 'PDF/Text', true, undefined],
          ['language', 'Language', revealedPanes.has('language') || Boolean(book.language), undefined],
          ['subject', 'Subject', revealedPanes.has('subject') || Boolean(book.subject), undefined],
          ['age', 'Age', revealedPanes.has('age') || book.age !== undefined, undefined],
          ['chapters', 'Chapters', revealedPanes.has('chapters') || isBookProcessingStageComplete(book, 'chapters'), chapters.length],
          ['textConcepts', 'Concepts', revealedPanes.has('textConcepts') || isBookProcessingStageComplete(book, 'concepts'), entityCounts.concepts],
          ['conceptExercises', 'Exercises', revealedPanes.has('conceptExercises') || isBookProcessingStageComplete(book, 'exercises'), entityCounts.exercises],
          ['preExercisesExercises', 'Abilities', revealedPanes.has('preExercisesExercises') || isBookProcessingStageComplete(book, 'abilities'), entityCounts.abilities],
          ['standards', 'Standards', revealedPanes.has('standards') || isBookProcessingStageComplete(book, 'standards'), undefined],
          ['skillsCourse', 'Course', revealedPanes.has('skillsCourse') || isBookProcessingStageComplete(book, 'abilities'), undefined]
        ] as Array<[ReaderPane, string, boolean, number | undefined]>).filter(([, , isVisible]) => isVisible).map(([pane, label, , count]) => (
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
            {exerciseChapters.map((chapter, index) => {
              const missingCount = exerciseChapterMissingCounts.get(exerciseChapterNavigationKey(chapter));
              const title = chapter.title || 'Chapter not identified';

              return <option
              key={`${chapter.title}:${index}`}
              value={index}
            >{title}{missingCount ? ` (${missingCount} exercise${missingCount === 1 ? '' : 's'} missing)` : ''}</option>;
            })}
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
                : activePane === 'age'
                  ? <div className='detailsArea fullWidthDetails languageDetails'>{agePane()}</div>
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
                          onClick={() => goToConceptPage(pageNumber - 1)}
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
                          onClick={() => goToConceptPage(pageNumber + 1)}
                        />
                      </div>
                      <div
                        className='pageArea'
                        ref={pageAreaRef}
                      ><canvas ref={canvasRef} /></div>
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
                          {conceptChapters.map(({ chapterId, pageNumbers, title }, index) => {
                            const chapterKey = standardsChapterKey(chapterId, title, pageNumbers);
                            const conceptCount = conceptCountsByChapter.get(chapterKey) ?? 0;

                            return <option
                              key={chapterKey}
                              value={index}
                            >{fixConceptsChapterStatuses[fixConceptsChapterKey({ chapterId, pageNumbers, title })] === 'fixed' ? '✓ ' : ''}{title || 'Chapter not identified'} {'('}{conceptCount}{')'}</option>;
                          })}
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
                            onAction={revealPane}
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
                          key={`abilities-${book.id}-${skillsRefreshToken}`}
                          onAction={revealPane}
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

  .conceptPaneColumn > .pageArea {
    flex: 1;
    min-height: 0;
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
  .ageManualEditor { align-items: end; display: flex; flex-wrap: wrap; gap: 0.75rem; }
  .ageManualEditor label { display: grid; font-weight: 600; gap: 0.35rem; }
  .ageManualEditor input { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.35rem; box-sizing: border-box; color: var(--color-text); font: inherit; min-width: 8rem; padding: 0.6rem 0.7rem; width: 8rem; }
  .ageManualEditor input:focus { border-color: var(--color-primary, #2f6feb); outline: none; }
  .ageSampleNote { margin: 0; max-width: 50rem; opacity: 0.8; }

  .chaptersPanel .chapterEditor { display: flex; flex-direction: column; gap: 1rem; }
  &.isMaximized .chaptersPanel .chapterEditor { flex: 1; min-height: 0; overflow-y: auto; padding-right: 0.25rem; }
  .chaptersPanel .chapterEditor > h3, .chaptersPanel .chapterEditor > p { margin: 0; }
  .chaptersPanel .chapterEditor label { display: flex; flex-direction: column; gap: 0.4rem; }
  .chaptersPanel .chapterEditor select { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.25rem; color: var(--color-text); padding: 0.55rem; width: 100%; }
  .chapterEditRow { align-items: flex-end; display: grid; gap: 0.5rem; grid-template-columns: minmax(0, 1fr) auto; }
  .headingEvidence, .chapterList { border-top: 1px solid #dde1eb; padding-top: 0.75rem; }
  .headingEvidence h4 { margin: 0 0 0.5rem; }
  .chapterList h4 { margin: 0; }
  .headingEvidence ul { margin: 0; padding-left: 1.4rem; }
  .chapterListHeader { align-items: center; display: flex; gap: 0.75rem; justify-content: space-between; margin-bottom: 0.35rem; }
  .chapterListHint { margin: 0 0 0.65rem; opacity: 0.75; }
  .chapterRows { display: flex; flex-direction: column; gap: 0.35rem; }
  .chapterListRow { align-items: center; display: flex; gap: 0.5rem; min-height: 2rem; }
  .chapterListRow .inList { flex: 0 0 auto; margin: 0; }
  .chapterNumber { flex: 0 0 auto; font-variant-numeric: tabular-nums; text-align: right; width: 1.75rem; }
  .chapterList .chapterLink { background: none; border: 0; color: var(--color-link, #2f6feb); cursor: pointer; padding: 0; text-align: left; }

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

  .missingExerciseNavigation {
    align-items: baseline;
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem;
    margin: -0.2rem 0 0.75rem;
  }

  .missingExerciseLinks button {
    background: none;
    border: 0;
    color: var(--color-primary, #2f6feb);
    cursor: pointer;
    font: inherit;
    padding: 0;
    text-decoration: underline;
  }

  .missingExerciseLinks button:hover, .missingExerciseLinks button:focus-visible {
    text-decoration-thickness: 2px;
  }

  .exerciseConceptCard {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.7rem;
    box-shadow: 0 1px 2px rgba(24, 39, 75, 0.04);
    box-sizing: border-box;
    margin-bottom: 1rem;
    padding: 0.95rem 1rem 1rem;
  }

  .exerciseConceptCard:focus {
    outline: none;
  }

  .conceptExerciseRank {
    font-variant-numeric: tabular-nums;
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
    overscroll-behavior: contain;
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

  .conceptList {
    display: grid;
    gap: 0.8rem;
    list-style: none;
    margin: 0.8rem 0 0;
    padding: 0;
  }

  .conceptList > li + li {
    margin-top: 0;
  }

  .conceptItem {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.7rem;
    box-shadow: 0 1px 2px rgba(24, 39, 75, 0.04);
    padding: 0.95rem 1rem 1rem;
    position: relative;
    transition: opacity 120ms ease, transform 120ms ease;
  }

  .conceptItem:focus {
    outline: 2px solid var(--color-primary, #1682d4);
    outline-offset: 2px;
  }

  .conceptItem.dragging {
    cursor: grabbing;
    opacity: 0.55;
    transform: scale(0.995);
  }

  .conceptItem.conceptDropBefore::before,
  .conceptItem.conceptDropAfter::after {
    background: var(--color-primary, #1682d4);
    border-radius: 999px;
    content: '';
    height: 3px;
    left: 0.35rem;
    pointer-events: none;
    position: absolute;
    right: 0.35rem;
    z-index: 2;
  }

  .conceptItem.conceptDropBefore::before {
    top: -0.55rem;
  }

  .conceptItem.conceptDropAfter::after {
    bottom: -0.55rem;
  }

  .conceptDragTitle {
    display: none;
    font-size: 0.98em;
    line-height: 1.3;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .conceptsOutput.conceptDragging {
    cursor: grabbing;
    user-select: none;
  }

  .conceptsOutput.conceptDragging .conceptItem {
    transition: none;
  }

  .conceptsOutput.conceptDragging .conceptItem:not(.dragging) {
    min-height: 0;
    padding: 0.5rem 0.75rem;
  }

  .conceptsOutput.conceptDragging .conceptItem:not(.dragging) > .conceptDragTitle {
    display: block;
  }

  .conceptsOutput.conceptDragging .conceptItem:not(.dragging) > :not(.conceptDragTitle) {
    display: none;
  }

  .conceptHeading {
    align-items: center;
    display: flex;
    gap: 0.8rem;
    justify-content: space-between;
  }

  .conceptDragHandle {
    color: #777;
    cursor: grab;
    flex: 0 0 auto;
    font-size: 1.25rem;
    line-height: 1;
    padding: 0.25rem 0.15rem;
    touch-action: none;
    user-select: none;
  }

  .conceptDragHandle:active {
    cursor: grabbing;
  }

  .conceptHeading > strong {
    flex: 1;
    font-size: 1.05em;
    line-height: 1.35;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .conceptNumber {
    font-variant-numeric: tabular-nums;
  }

  .conceptAttemptLabel {
    color: var(--color-text-secondary, #777);
    flex: 0 0 auto;
    font-size: 0.82em;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
  }
  .conceptActions {
    align-items: center;
    display: flex;
    flex-shrink: 0;
    gap: 0.4rem;
  }

  .conceptItem > .conceptHeading .conceptActions button {
    height: 2.25rem !important;
    min-height: 2.25rem !important;
    min-width: 2.25rem !important;
    padding: 0.45rem !important;
    width: 2.25rem !important;
  }

  .conceptMeta {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .conceptPageLink {
    background: rgba(47, 111, 235, 0.08);
    border: 1px solid rgba(47, 111, 235, 0.18);
    border-radius: 999px;
    color: var(--color-link, #2f6feb);
    cursor: pointer;
    font: inherit;
    font-size: 0.82em;
    line-height: 1.2;
    padding: 0.28rem 0.55rem;
    text-decoration: none;
  }

  .conceptPageLink:hover {
    background: rgba(47, 111, 235, 0.14);
    border-color: rgba(47, 111, 235, 0.28);
  }

  .conceptDescription {
    line-height: 1.55;
    margin-top: 0.65rem !important;
    max-width: 80ch;
    opacity: 0.9;
  }

  @media (max-width: 640px) {
    .conceptItem {
      padding: 0.85rem;
    }

    .conceptHeading {
      align-items: flex-start;
    }

    .conceptDescription {
      max-width: none;
    }
  }

  .exerciseItem { position: relative; }
  .exerciseHeading { align-items: flex-start; display: flex; gap: 0.75rem; justify-content: space-between; }
  .exerciseHeading > p { flex: 1; min-width: 0; }
  .exerciseEditForm { display: flex; flex-direction: column; gap: 0.65rem; }
  .exerciseEditForm > label { display: flex; flex-direction: column; gap: 0.35rem; }
  .exerciseEditForm textarea { background: var(--bg-input); border: 1px solid #dde1eb; border-radius: 0.25rem; box-sizing: border-box; color: var(--color-text); font: inherit; padding: 0.55rem; resize: vertical; width: 100%; }

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
