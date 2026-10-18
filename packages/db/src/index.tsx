// Copyright 2021-2022 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { db } from "./db/index.js";
import type { AbilityFixInstructions, BookAbilityWorkItem, BookAbilityChangeLogEntry } from './db/AbilityWork.js';
import { effectiveAbilityFixInstructions, prepareAbilityFixForScheduling } from './db/AbilityWork.js';
export { ABILITY_FIX_FIELDS, emptyAbilityFixInstructions, effectiveAbilityFixInstructions, prepareAbilityFixForScheduling, abilityFixHasTextChanges, abilityFixHasChanges } from './db/AbilityWork.js';
export type { AbilityFixInstructions, BookAbilityWorkItem, BookAbilityChangeLogEntry } from './db/AbilityWork.js';
import type { Agreement } from "./db/Agreement.js";
import type { LetterTemplate } from "./db/LetterTemplate.js";
import type { Letter } from "./db/Letter.js";
import type { CanceledLetter } from './db/CanceledLetter.js';
import type { Insurance } from "./db/Insurance.js";
import type { Reimbursement } from "./db/Reimbursement.js";
import type { Reexamination } from './db/Reexamination.js';
import type { Signer } from "./db/Signer.js";
import type { UsageRight } from "./db/UsageRight.js";
import type { Pseudonym } from "./db/Pseudonym.js";
import type { Setting } from "./db/Setting.js";
import type { Lesson, TutorAction } from "./db/Lesson.js";
import DOMPurify from 'dompurify';
import { decodeAddress, encodeAddress } from '@polkadot/keyring';
import { isHex, u8aToHex } from '@polkadot/util';
import { blake2AsHex } from '@polkadot/util-crypto';
import { InsurancesTransfer, LessonRequest } from "@slonigiraf/slonig-components";
import { CanceledInsurance } from "./db/CanceledInsurance.js";
import { Repetition } from "./db/Repetition.js";
import { EXAMPLE_MODULE_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_ID } from "@slonigiraf/utils";
import { LearnRequest } from "./db/LearnRequest.js";
import { ScheduledEvent, ScheduledEventType } from "./db/ScheduledEvent.js";
import Dexie, { type Table } from "dexie";
import { BOOK_PROCESSING_STAGES, getBookCompletedStages, withBookProcessingStagesResetFrom, withInvalidatedBookProcessingStages, withBypassedBookProcessingStage, withCompletedBookProcessingStage } from './db/Book.js';
import type { Book, BookProcessingStageKey, BookStageSpend, BookStageSpendKey, BookSubject } from './db/Book.js';
import type { BookPage, MathpixHeading } from './db/BookPage.js';
import type { BookConcept } from './db/BookConcept.js';
import type { BookChapter } from './db/BookChapter.js';
import type { Skill } from './db/Skill.js';
import type { ExerciseTemplate } from './db/ExerciseTemplate.js';
import type { Ability, AbilityExercise, AbilityValue } from './db/Ability.js';
import type { Image, TikzReviewResult, TikzQaStatus } from './db/Image.js';
import { isTikzImageQaPassed, tikzSourceVersion } from './db/Image.js';
import type { AiTutorStudentMessage } from './db/AiTutorStudentMessage.js';
import type { StandardEmbedding } from './db/StandardEmbedding.js';
import type { ConceptEmbedding } from './db/ConceptEmbedding.js';
import type { MathpixPdfJob } from './db/MathpixPdfJob.js';
import type { BookProcessingRun } from './db/BookProcessingRun.js';
import { readTikzSvgCache, writeTikzSvgCache } from './db/TikzSvgCache.js';
import { shouldExportDatabaseRow } from './backup.js';
import { BACKUP_DB_BATCH, stageRestoreBatch, commitRestoreStaging, discardRestoreStaging, validateRestoreTableNames } from './backupStorage.js';

export { BOOK_PROCESSING_STAGES, getBookCompletedStages, isBookProcessingStageComplete, isBookProcessingStageSatisfied, bookStagesInvalidatedByRerun, withBookProcessingStagesResetFrom, withInvalidatedBookProcessingStages, withBypassedBookProcessingStage, withCompletedBookProcessingStage } from './db/Book.js';
export type { LearnRequest, TutorAction, CanceledInsurance, Reexamination, LetterTemplate, CanceledLetter, Reimbursement, Letter, Insurance, Lesson, Pseudonym, Setting, Signer, UsageRight, Agreement, Ability, AbilityExercise, AbilityValue, Image, Book, BookProcessingStageKey, BookStageSpend, BookStageSpendKey, BookSubject, BookPage, MathpixHeading, BookChapter, BookConcept, Skill, ExerciseTemplate, AiTutorStudentMessage, StandardEmbedding, ConceptEmbedding, MathpixPdfJob };
export type { BookProcessingRun } from './db/BookProcessingRun.js';

export function getBookProcessingRun(bookId: number): Promise<BookProcessingRun | undefined> {
  return db.bookProcessingRuns.get(bookId);
}

export async function putBookProcessingRun(run: BookProcessingRun): Promise<void> {
  await db.bookProcessingRuns.put(run);
}

export async function deleteBookProcessingRun(bookId: number): Promise<void> {
  await db.bookProcessingRuns.delete(bookId);
}

export { tikzSourceVersion, isTikzImageQaPassed } from './db/Image.js';
export type { ImageType, TikzReviewResult, TikzQaStatus } from './db/Image.js';
export type { TikzSvgCacheEntry } from './db/TikzSvgCache.js';

/** Drop the primary app database, including the regenerable SVG cache.
 * Dexie closes its own connection before deleting, avoiding self-blocking. */
export function deleteSlonigDatabase(): Promise<void> {
    return db.delete();
}

// SVG previews are regenerable. Keep the database access in the DB package
// and isolate different TikZ renderer versions in a compound key.
export function getPersistedTikzSvg(rendererId: string, source: string): Promise<string | undefined> {
    return readTikzSvgCache(db, rendererId, source);
}

export function putPersistedTikzSvg(rendererId: string, source: string, svg: string): Promise<void> {
    return writeTikzSvgCache(db, rendererId, source, svg);
}

const CONCEPT_ABILITY_MODULE = /^book-(\d+)-concept-(\d+)$/;

function finiteDisplayOrder(value: number | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function orderedByDisplayOrder<T extends { displayOrder?: number }>(rows: T[], tieBreak: (a: T, b: T) => number): T[] {
    return [...rows].sort((a, b) => {
        const aOrder = finiteDisplayOrder(a.displayOrder);
        const bOrder = finiteDisplayOrder(b.displayOrder);

        if (aOrder !== undefined || bOrder !== undefined) {
            if (aOrder === undefined) return 1;
            if (bOrder === undefined) return -1;
            if (aOrder !== bOrder) return aOrder - bOrder;
        }

        return tieBreak(a, b);
    });
}

function reorderSubsetInExistingSlots<T, K>(baseline: T[], preferredIds: K[], idOf: (row: T) => K | undefined): T[] {
    const preferredSet = new Set(preferredIds);
    const rowsById = new Map<K, T>();

    for (const row of baseline) {
        const id = idOf(row);

        if (id !== undefined) {
            rowsById.set(id, row);
        }
    }

    const preferredRows = preferredIds.flatMap((id) => {
        const row = rowsById.get(id);

        return row === undefined ? [] : [row];
    });
    let preferredIndex = 0;

    return baseline.map((row) => {
        const id = idOf(row);

        if (id === undefined || !preferredSet.has(id)) {
            return row;
        }

        return preferredRows[preferredIndex++] ?? row;
    });
}

function uniqueIdsInOrder<K>(ids: Array<K | undefined>): K[] {
    const seen = new Set<K>();
    const ordered: K[] = [];

    for (const id of ids) {
        if (id === undefined || seen.has(id)) {
            continue;
        }

        seen.add(id);
        ordered.push(id);
    }

    return ordered;
}

function validateDisplayOrderIndex(displayOrder: number, entity: 'Ability'): void {
    if (!Number.isSafeInteger(displayOrder) || displayOrder < 0) {
        throw new Error(`${entity} displayOrder must be a non-negative integer.`);
    }
}

function moveToIndex<T>(rows: T[], target: T, requestedIndex: number): T[] {
    const remaining = rows.filter((row) => row !== target);
    const targetIndex = Math.min(requestedIndex, remaining.length);

    return [...remaining.slice(0, targetIndex), target, ...remaining.slice(targetIndex)];
}

async function chapterConceptsForLearningOrder(chapterId: number): Promise<{ concepts: BookConcept[]; pages: BookPage[] }> {
    const pages = await db.bookPages.where('chapterId').equals(chapterId).toArray();
    const pageConceptLists = await Promise.all(pages.map(async ({ bookId, pageNumber }) =>
        (await db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).toArray())
            // BookConcept.chapterId is authoritative when present. The source page
            // is only a fallback for legacy/imported Concepts without chapterId.
            .filter(({ chapterId: conceptChapterId }) => conceptChapterId === undefined)));
    const explicitConcepts = await db.bookConcepts.where('chapterId').equals(chapterId).toArray();
    const conceptsById = new Map<number, BookConcept>();
    const conceptsWithoutId: BookConcept[] = [];

    for (const concept of [...explicitConcepts, ...pageConceptLists.flat()]) {
        if (concept.id === undefined) {
            conceptsWithoutId.push(concept);
        } else {
            conceptsById.set(concept.id, concept);
        }
    }

    const concepts = [...conceptsById.values(), ...conceptsWithoutId].filter(({ isSplitParent }) => !isSplitParent);

    // Repair only legacy page-backed Concepts whose chapterId is missing. Never
    // overwrite an explicit thematic assignment merely because its source page
    // belongs to a different chapter.
    await Promise.all(concepts.flatMap((concept) => {
        if (concept.id === undefined || concept.chapterId !== undefined || concept.bookPage[1] === 0) {
            return [];
        }

        concept.chapterId = chapterId;
        return [db.bookConcepts.update(concept.id, { chapterId })];
    }));

    return { concepts, pages };
}

async function chapterIdForConcept(concept: BookConcept | undefined): Promise<number | undefined> {
    if (!concept) {
        return undefined;
    }

    if (concept.chapterId !== undefined) {
        return concept.chapterId;
    }

    return concept.bookPage[1] === 0 ? undefined : (await db.bookPages.get(concept.bookPage))?.chapterId;
}

async function moveAbilityToDisplayOrder(abilityId: string, requestedIndex: number): Promise<Ability | undefined> {
    const ability = await db.abilities.get(abilityId);

    if (!ability) {
        return undefined;
    }

    const conceptMatch = CONCEPT_ABILITY_MODULE.exec(ability.moduleId);
    if (conceptMatch) {
        const concept = await db.bookConcepts.get(Number(conceptMatch[2]));
        const chapterId = await chapterIdForConcept(concept);
        if (chapterId !== undefined) {
            const { concepts } = await chapterConceptsForLearningOrder(chapterId);
            const rows = (await Promise.all(concepts.flatMap(({ id }) => id === undefined ? [] : [db.abilities.where('moduleId').equals(`book-${conceptMatch[1]}-concept-${id}`).toArray()]))).flat();
            const ordered = orderedByDisplayOrder(rows, (a, b) => a.id.localeCompare(b.id));
            const target = ordered.find(({ id }) => id === abilityId);
            if (target) {
                await Promise.all(moveToIndex(ordered, target, requestedIndex).map((row, index) => db.abilities.update(row.id, { displayOrder: index })));
            }
        } else {
            await db.abilities.update(abilityId, { displayOrder: requestedIndex });
        }
        return db.abilities.get(abilityId);
    }

    // Non-book abilities have no chapter ordering.
    await db.abilities.update(abilityId, { displayOrder: requestedIndex });
    return db.abilities.get(abilityId);
}

async function syncChapterLearningDisplayOrder(chapterId: number): Promise<void> {
    const { concepts } = await chapterConceptsForLearningOrder(chapterId);
    const orderedConcepts = orderedByDisplayOrder(concepts, (a, b) => a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER));

    for (const [rank, concept] of orderedConcepts.entries()) {
        if (concept.id === undefined) continue;
        if (concept.displayOrder !== rank) await db.bookConcepts.update(concept.id, { displayOrder: rank });
        const abilities = await db.abilities.where('moduleId').equals(`book-${concept.bookPage[0]}-concept-${concept.id}`).toArray();
        for (const ability of abilities) {
            if (ability.displayOrder !== rank) await db.abilities.update(ability.id, { displayOrder: rank });
        }
    }
}

export async function createBook(book: Omit<Book, 'id'>): Promise<number> {
    return db.books.add(book as Book);
}

/**
 * Update only the explicitly named Book fields. Callers should use the stage
 * helpers for completedStages so an old UI snapshot cannot replace unrelated
 * state written by another component in the meantime.
 */
export async function updateBookFields(id: number, changes: Partial<Omit<Book, 'completedStages' | 'bypassedStages' | 'id'>>): Promise<Book | undefined> {
    return db.transaction('rw', db.books, async () => {
        const storedBook = await db.books.get(id);

        if (!storedBook) {
            return undefined;
        }

        const nextChanges: Partial<Book> = { ...changes };

        if (changes.stageSpend) {
            const storedSpend = storedBook.stageSpend;
            const incomingSpend = changes.stageSpend;

            nextChanges.stageSpend = Object.fromEntries(
                Array.from(new Set([...Object.keys(storedSpend ?? {}), ...Object.keys(incomingSpend)])).map((stage) => [
                    stage,
                    Math.max(storedSpend?.[stage as BookStageSpendKey] ?? 0, incomingSpend[stage as BookStageSpendKey] ?? 0)
                ])
            ) as BookStageSpend;
        }

        if (changes.fixConceptsAttempts !== undefined) {
            nextChanges.fixConceptsAttempts = Math.max(storedBook.fixConceptsAttempts ?? 0, changes.fixConceptsAttempts);
        }

        await db.books.update(id, nextChanges);

        return getBook(id);
    });
}

function isBookProcessingStageAfter(stage: BookProcessingStageKey, candidate: BookProcessingStageKey): boolean {
    const stages: readonly BookProcessingStageKey[] = BOOK_PROCESSING_STAGES;
    return stages.indexOf(candidate) > stages.indexOf(stage);
}

/**
 * Only the first six pipeline stages have cascading destructive resets.
 * Later stages keep unrelated persisted outputs; their own edits invalidate
 * precisely the associated artifacts (Concept, Ability, Image) as needed.
 */
async function clearBookEntitiesAfterProcessingStage(bookId: number, stage: BookProcessingStageKey, onlyMissing = false): Promise<void> {
    const cascading = BOOK_PROCESSING_STAGES.indexOf(stage) <= BOOK_PROCESSING_STAGES.indexOf('concepts');
    const clears = (candidate: BookProcessingStageKey): boolean =>
        cascading && (isBookProcessingStageAfter(stage, candidate) || (!onlyMissing && stage === candidate));
    const clearRecognition = stage === 'recognize' && !onlyMissing;
    const clearChapters = clears('chapters');
    const clearConcepts = clears('concepts');
    const clearEmbeddings = clears('embeddings');
    const clearAbilities = clears('abilities') || (stage === 'abilities' && !onlyMissing);
    const clearQuestionImages = stage === 'images' && !onlyMissing && !clearAbilities;
    const clearAnswerImages = stage === 'answerImages' && !onlyMissing && !clearAbilities;
    // QA reruns work in-place; they never blank image data.
    const clearImages = clearQuestionImages || clearAnswerImages;

    if (!clearRecognition && !clearChapters && !clearConcepts && !clearEmbeddings && !clearAbilities && !clearImages) {
        return;
    }

    const chapters = await db.bookChapters.where('bookId').equals(bookId).toArray();
    const chapterIds = chapters.flatMap(({ id }) => id === undefined ? [] : [id]);

    if (clearAbilities) {
        const abilities = await db.abilities.filter(({ moduleId }) => moduleId.startsWith(`book-${bookId}-`)).toArray() as Ability[];
        const imageIds = Array.from(new Set(abilities.flatMap(({ content }) => abilityImageIds(content))));
        const skillIds = (await Promise.all(chapterIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).primaryKeys()))).flat() as number[];

        if (abilities.length) {
            await db.abilities.bulkDelete(abilities.map(({ id }) => id));
        }
        if (skillIds.length) {
            await Promise.all(skillIds.map((skillId) => db.exerciseTemplates.where('skillId').equals(skillId).delete()));
        }
        await Promise.all(chapterIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).delete()));
        await deleteUnreferencedAbilityImages(imageIds);
    } else if (clearImages) {
        // A question rerun must also reset the answer figure belonging to that
        // exercise. Keep foreign keys, Ability content and unrelated images.
        const abilities = await db.abilities.filter(({ moduleId }) => moduleId.startsWith(`book-${bookId}-`)).toArray() as Ability[];
        const field = clearQuestionImages ? 'p' : 'i';
        const ids = Array.from(new Set(abilities.flatMap(({ content }) => abilityImageIdsForField(content, field))));
        // A question redraw invalidates its *corresponding* answer image and
        // its QA; unrelated diagrams and all Ability records stay intact.
        const dependentAnswerIds = clearQuestionImages ? abilities.flatMap(({ content }) => {
            const parsed = parseAbilityJson(content);

            return parsed ? parsed.root.q.flatMap((exercise) => {
                if (!exercise || typeof exercise !== 'object') return [];
                const row = exercise as Record<string, unknown>;

                return typeof row.p === 'number' && typeof row.i === 'number' ? [row.i] : [];
            }) : [];
        }) : [];
        const images = await db.images.bulkGet(Array.from(new Set([...ids, ...dependentAnswerIds])));

        await Promise.all(images.flatMap((image) => !image ? [] : [db.images.put({
            ...image,
            type: 'prompt',
            prompt: image.prompt || image.data || '',
            data: null,
            valid: undefined,
            renderStatus: undefined,
            visualQaStatus: undefined,
            detectedIssues: undefined,
            sourceVersion: undefined,
            reviewResult: undefined
        })]));
    }

    if (clearConcepts) {
        const conceptIds = (await db.bookConcepts.filter(({ bookPage }) => bookPage[0] === bookId).primaryKeys()) as number[];

        if (conceptIds.length) {
            await db.bookConcepts.bulkDelete(conceptIds);
        }
        await db.conceptEmbeddings.where('bookId').equals(bookId).delete();
        await db.bookPages.where('bookId').equals(bookId).modify({ conceptsProcessed: false });
    } else if (clearEmbeddings) {
        await db.conceptEmbeddings.where('bookId').equals(bookId).delete();
    }

    if (clearChapters) {
        await db.bookChapters.where('bookId').equals(bookId).delete();
        await db.bookPages.where('bookId').equals(bookId).modify({
            chapter: '',
            chapterId: undefined,
            conceptsProcessed: false,
            excludedFromAnalysis: undefined
        });
        await db.books.update(bookId, { chapterOrder: [] });
    }
    if (clearRecognition) {
        await db.bookPages.where('bookId').equals(bookId).delete();
        await db.mathpixPdfJobs.where('bookId').equals(bookId).delete();
    }
}

/** Standards are stored outside IndexedDB. Cascade and Refine Chapters
 * resets must forget that cache too, but only after the DB commit. */
function clearStoredStandardsAfterReset(bookId: number, stage: BookProcessingStageKey): void {
    // Refine Chapters' only downstream artifact is chapter Standards.
    if (BOOK_PROCESSING_STAGES.indexOf(stage) > BOOK_PROCESSING_STAGES.indexOf('concepts') && stage !== 'refineChapters') return;
    try {
        if (typeof localStorage !== 'undefined') {
            localStorage.removeItem(`knowledge-upload-book-${bookId}-standards-v4`);
        }
    } catch {
        // Processing data is already reset in IndexedDB; a blocked browser
        // storage API must not make a successful reset look like a failure.
    }
}

export async function updateBookFieldsAndStages(
    id: number,
    changes: Partial<Omit<Book, 'completedStages' | 'bypassedStages' | 'fixConceptsAttempts' | 'id' | 'stageSpend'>>,
    options: { complete?: BookProcessingStageKey[]; resetFrom?: BookProcessingStageKey; onlyMissing?: boolean; uncomplete?: BookProcessingStageKey[] } = {}
): Promise<Book | undefined> {
    const nextBook = await db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.skills, db.exerciseTemplates, db.abilities, db.images, db.mathpixPdfJobs, async () => {
        const storedBook = await db.books.get(id);

        if (!storedBook) {
            return undefined;
        }

        let updated: Book = { ...storedBook, ...changes, completedStages: getBookCompletedStages(storedBook) };

        if (options.resetFrom) {
            await clearBookEntitiesAfterProcessingStage(id, options.resetFrom, options.onlyMissing);
            updated = withBookProcessingStagesResetFrom(updated, options.resetFrom);
        }

        if (options.uncomplete?.length) {
            const removed = new Set(options.uncomplete);

            updated = { ...updated, completedStages: getBookCompletedStages(updated).filter((stage) => !removed.has(stage)) };
        }

        for (const stage of options.complete ?? []) {
            // A stage records that image review was attempted, not that every
            // diagram passed. Failed visual QA remains on each Image for review.

            updated = withCompletedBookProcessingStage(updated, stage);
        }

        await db.books.update(id, { ...changes, completedStages: updated.completedStages, bypassedStages: updated.bypassedStages });

        return getBook(id);
    });

    if (nextBook && options.resetFrom) clearStoredStandardsAfterReset(id, options.resetFrom);

    return nextBook;
}
/**
 * @deprecated Replacing an existing Book from a caller-owned snapshot is not
 * concurrency-safe. Use createBook() for inserts and updateBookFields()/the
 * processing-stage helpers for updates.
 */
export async function putBook(book: Book): Promise<void> {
    await db.transaction('rw', db.books, async () => {
        if (await db.books.get(book.id)) {
            throw new Error('putBook() cannot replace an existing Book. Use updateBookFields() or a processing-stage helper.');
        }

        await db.books.add({ ...book, completedStages: book.completedStages ?? getBookCompletedStages(book) });
    });
}

function withNamedBookStages (book: Book | undefined): Book | undefined {
    return book ? { ...book, completedStages: getBookCompletedStages(book) } : undefined;
}

export async function getBook(id: number): Promise<Book | undefined> {
    return withNamedBookStages(await db.books.get(id));
}

export async function completeBookProcessingStage(id: number, stage: BookProcessingStageKey): Promise<Book | undefined> {
    return db.transaction('rw', db.books, db.abilities, db.images, async () => {
        // Fix Images completion means the review run finished. Individual
        // failed/pending visuals are tracked separately and never block later stages.

        const book = await db.books.get(id);

        if (!book) {
            return undefined;
        }

        const updated = withCompletedBookProcessingStage({ ...book, completedStages: getBookCompletedStages(book) }, stage);

        await db.books.update(id, { completedStages: updated.completedStages, bypassedStages: updated.bypassedStages });

        return getBook(id);
    });
}

/** Explicit acknowledgement of a failed stage, NOT a success checkpoint.
 * It permits later stages to work with any partial output that exists. */
export async function bypassBookProcessingStage(id: number, stage: BookProcessingStageKey): Promise<Book | undefined> {
    return db.transaction('rw', db.books, async () => {
        const book = await db.books.get(id);

        if (!book) return undefined;
        const updated = withBypassedBookProcessingStage(book, stage);

        await db.books.update(id, { bypassedStages: updated.bypassedStages });
        return getBook(id);
    });
}

export async function uncompleteBookProcessingStage(id: number, stage: BookProcessingStageKey): Promise<Book | undefined> {
    return db.transaction('rw', db.books, async () => {
        const book = await db.books.get(id);

        if (!book) {
            return undefined;
        }

        const completedStages = getBookCompletedStages(book).filter((completedStage) => completedStage !== stage);

        await db.books.update(id, { completedStages });

        return getBook(id);
    });
}

/**
 * Inspect the actual stored artifacts that a stage reset would discard or
 * invalidate. A failed/incomplete stage can still have generated data, so
 * completedStages alone is not a safe indicator for deletion warnings.
 * This mirrors clearBookEntitiesAfterProcessingStage above. No writes occur.
 */
export async function wouldResetBookGeneratedData (bookId: number, stage: BookProcessingStageKey, options: { onlyMissing?: boolean } = {}): Promise<boolean> {
    const onlyMissing = options.onlyMissing ?? false;
    const cascading = BOOK_PROCESSING_STAGES.indexOf(stage) <= BOOK_PROCESSING_STAGES.indexOf('concepts');
    const clears = (candidate: BookProcessingStageKey): boolean =>
        cascading && (isBookProcessingStageAfter(stage, candidate) || (!onlyMissing && stage === candidate));
    const clearChapters = clears('chapters');
    const clearConcepts = clears('concepts');
    const clearEmbeddings = clears('embeddings');
    const clearAbilities = clears('abilities') || stage === 'abilities' && !onlyMissing;
    const clearQuestionImages = stage === 'images' && !onlyMissing;
    const clearAnswerImages = stage === 'answerImages' && !onlyMissing;
    // These two stages may change previously generated records *after review*.
    const possibleConceptChanges = stage === 'fixConcepts';
    const possibleAbilityChanges = stage === 'fixAbilities';
    const possibleQuestionCorrections = stage === 'fixImages';

    return db.transaction('r', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.skills, db.abilities, db.images, async () => {
        if (stage === 'recognize' && !onlyMissing) {
            const book = await db.books.get(bookId);
            if (book?.language || book?.subject || book?.age !== undefined || await db.bookPages.where('bookId').equals(bookId).count()) return true;
        }
        if (clearChapters && (
            await db.bookChapters.where('bookId').equals(bookId).count() ||
            await db.bookPages.where('bookId').equals(bookId).filter(({ chapter, chapterId }) => Boolean(chapter || chapterId !== undefined)).count()
        )) return true;
        if (clearConcepts && (
            await db.bookConcepts.filter(({ bookPage }) => bookPage[0] === bookId).count() ||
            await db.bookPages.where('bookId').equals(bookId).filter(({ conceptsProcessed }) => Boolean(conceptsProcessed)).count()
        )) return true;
        if (clearEmbeddings && await db.conceptEmbeddings.where('bookId').equals(bookId).count()) return true;

        if (possibleConceptChanges && (
            await db.conceptEmbeddings.where('bookId').equals(bookId).count() ||
            await db.abilities.filter(({ moduleId }) => moduleId.startsWith(`book-${bookId}-`)).count()
        )) return true;
        if (clearAbilities) {
            if (await db.abilities.filter(({ moduleId }) => moduleId.startsWith(`book-${bookId}-`)).count()) return true;
            const chapters = await db.bookChapters.where('bookId').equals(bookId).toArray();
            for (const chapter of chapters) {
                if (chapter.id !== undefined && await db.skills.where('chapterId').equals(chapter.id).count()) return true;
            }
        }
        if (clearQuestionImages || clearAnswerImages || possibleQuestionCorrections || possibleAbilityChanges || stage === 'images' && onlyMissing) {
            const abilities = await db.abilities.filter(({ moduleId }) => moduleId.startsWith(`book-${bookId}-`)).toArray() as Ability[];
            const ids = new Set<number>();
            const missingQuestionAnswerPairs: Array<{ questionId: number; answerId: number }> = [];

            for (const { content } of abilities) {
                const parsed = parseAbilityJson(content);

                if (!parsed) continue;
                for (const exercise of parsed.root.q) {
                    if (!exercise || typeof exercise !== 'object') continue;
                    const row = exercise as Record<string, unknown>;

                    if (clearQuestionImages || possibleAbilityChanges) {
                        if (typeof row.p === 'number') ids.add(row.p);
                    }
                    if (stage === 'images' && onlyMissing && typeof row.p === 'number' && typeof row.i === 'number') {
                        missingQuestionAnswerPairs.push({ questionId: row.p, answerId: row.i });
                    }
                    if (clearAnswerImages || possibleAbilityChanges ||
                        (clearQuestionImages || possibleQuestionCorrections) && typeof row.p === 'number') {
                        if (typeof row.i === 'number') ids.add(row.i);
                    }
                }
            }
            const images = await db.images.bulkGet([...ids]);
            if (images.some((image) => image && (
                image.type !== 'prompt' || image.data !== null && image.data !== undefined || image.valid !== undefined || image.renderStatus !== undefined || image.visualQaStatus !== undefined
            ))) return true;
            for (const { questionId, answerId } of missingQuestionAnswerPairs) {
                const [question, answer] = await db.images.bulkGet([questionId, answerId]);

                if (question && (question.type === 'prompt' || !question.data) && answer && (answer.type !== 'prompt' || answer.data)) {
                    return true;
                }
            }
        }
        return false;
    });
}

export async function resetBookProcessingStagesFrom(id: number, stage: BookProcessingStageKey, options: { onlyMissing?: boolean } = {}): Promise<Book | undefined> {
    const nextBook = await db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.skills, db.exerciseTemplates, db.abilities, db.images, db.mathpixPdfJobs, async () => {
        const book = await db.books.get(id);

        if (!book) {
            return undefined;
        }

        await clearBookEntitiesAfterProcessingStage(id, stage, options.onlyMissing);
        const updated = withBookProcessingStagesResetFrom({ ...book, completedStages: getBookCompletedStages(book) }, stage);

        await db.books.update(id, { completedStages: updated.completedStages, bypassedStages: updated.bypassedStages });

        return getBook(id);
    });

    if (nextBook) clearStoredStandardsAfterReset(id, stage);

    return nextBook;
}
/** Invalidate only the completion markers for derived stages after approved
 * edits. No book-wide generated entities are deleted by this operation. */
export async function invalidateBookProcessingStages(id: number, stages: readonly BookProcessingStageKey[]): Promise<Book | undefined> {
    return db.transaction('rw', db.books, async () => {
        const book = await db.books.get(id);

        if (!book) return undefined;
        const updated = withInvalidatedBookProcessingStages(book, stages);
        await db.books.update(id, { completedStages: updated.completedStages, bypassedStages: updated.bypassedStages });

        return getBook(id);
    });
}

export async function incrementBookFixConceptsAttempts(id: number): Promise<number> {
    return db.transaction('rw', db.books, async () => {
        const book = await db.books.get(id);

        if (!book) {
            throw new Error('Book not found.');
        }

        const attempt = (book.fixConceptsAttempts ?? 0) + 1;

        await db.books.update(id, { fixConceptsAttempts: attempt });

        return attempt;
    });
}

export async function addBookStageSpend(id: number, stage: BookStageSpendKey, costUsd: number): Promise<void> {
    if (!Number.isFinite(costUsd) || costUsd <= 0) {
        return;
    }

    await db.transaction('rw', db.books, async () => {
        const book = await db.books.get(id);

        if (!book) {
            return;
        }

        await db.books.update(id, {
            stageSpend: {
                ...book.stageSpend,
                [stage]: (book.stageSpend?.[stage] ?? 0) + costUsd
            }
        });
    });
}

export async function getBooks(): Promise<Book[]> {
    return (await db.books.orderBy('created').reverse().toArray()).map((book) => ({ ...book, completedStages: getBookCompletedStages(book) }));
}

export async function getBookByContentHash(contentHash: string): Promise<Book | undefined> {
    return withNamedBookStages(await db.books.where('contentHash').equals(contentHash).first());
}

export async function deleteBook(id: number): Promise<void> {
    await db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.skills, db.exerciseTemplates, db.abilities, db.images, db.mathpixPdfJobs, db.bookProcessingRuns, db.fixConceptsChapterStatuses, db.bookAbilitySplitQueues, db.bookAbilityWorkQueues, db.bookAbilityChangeLog, async () => {
        const pageKeys = await db.bookPages.where('bookId').equals(id).primaryKeys();
        const chapterIds = (await db.bookChapters.where('bookId').equals(id).primaryKeys()) as number[];
        const skillIds = (await Promise.all(chapterIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).primaryKeys()))).flat() as number[];
        // Remove every remaining Ability module owned by this book (including
        // skill modules and historical exercise orphans left by older builds).
        const orphanAbilityRows = await db.abilities.where('moduleId').startsWith(`book-${id}-`).toArray() as Ability[];
        const orphanImageIds = Array.from(new Set(orphanAbilityRows.flatMap(({ content }) => abilityImageIds(content))));

        if (orphanAbilityRows.length) {
            await db.abilities.bulkDelete(orphanAbilityRows.map(({ id: abilityId }) => abilityId));
            await deleteUnreferencedAbilityImages(orphanImageIds);
        }

        await db.books.delete(id);
        await db.bookPages.where('bookId').equals(id).delete();
        await Promise.all([
            db.bookConcepts.where('bookPage').equals([id, 0]).delete(),
            ...pageKeys.map((bookPage) => db.bookConcepts.where('bookPage').equals(bookPage).delete()),
            ...skillIds.map((skillId) => db.exerciseTemplates.where('skillId').equals(skillId).delete()),
            ...chapterIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).delete())
        ]);
        await db.bookChapters.where('bookId').equals(id).delete();
        await db.conceptEmbeddings.where('bookId').equals(id).delete();
        await db.mathpixPdfJobs.where('bookId').equals(id).delete();
        await db.bookProcessingRuns.delete(id);
        await db.fixConceptsChapterStatuses.delete(id);
        await db.bookAbilitySplitQueues.delete(id);
        await db.bookAbilityWorkQueues.delete(id);
        await db.bookAbilityChangeLog.where('bookId').equals(id).delete();
    });
}

export async function putBookPage(bookPage: BookPage): Promise<void> {
    await db.bookPages.put(bookPage);
}

export async function getMathpixPdfJob(bookId: number, startPage: number, endPage: number): Promise<MathpixPdfJob | undefined> {
    return db.mathpixPdfJobs.get([bookId, startPage, endPage]);
}

export async function putMathpixPdfJob(job: MathpixPdfJob): Promise<void> {
    await db.mathpixPdfJobs.put(job);
}

export async function deleteMathpixPdfJob(bookId: number, startPage: number, endPage: number): Promise<void> {
    await db.mathpixPdfJobs.delete([bookId, startPage, endPage]);
}

export async function putBookChapter(chapter: BookChapter): Promise<number> {
    return db.bookChapters.put(chapter as BookChapter);
}

export async function getBookChapter(bookId: number, title: string): Promise<BookChapter | undefined> {
    return db.bookChapters.where('bookId').equals(bookId).filter((chapter) => chapter.title === title).first();
}

export async function getBookChapters(bookId: number): Promise<BookChapter[]> {
    const [book, chapters, pages] = await Promise.all([
        db.books.get(bookId),
        db.bookChapters.where('bookId').equals(bookId).toArray(),
        db.bookPages.where('bookId').equals(bookId).sortBy('pageNumber')
    ]);
    const pageOrder = Array.from(new Set(pages.flatMap(({ chapterId }) => chapterId === undefined ? [] : [chapterId])));
    const order = [...(book?.chapterOrder ?? []), ...pageOrder];
    const rank = new Map(Array.from(new Set(order)).map((id, index) => [id, index]));
    const activeIds = new Set(pageOrder);

    return chapters
        .filter(({ id }) => id === undefined || !pageOrder.length || activeIds.has(id))
        .sort((a, b) => (rank.get(a.id ?? -1) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id ?? -1) ?? Number.MAX_SAFE_INTEGER) || (a.id ?? 0) - (b.id ?? 0));
}

export async function updateBookChapterTitle(chapterId: number, title: string): Promise<void> {
    await db.transaction('rw', db.bookChapters, db.bookPages, async () => {
        const chapter = await db.bookChapters.get(chapterId);

        if (!chapter) {
            throw new Error('Book chapter not found.');
        }

        const matchingTitleChapters = await db.bookChapters.where('bookId').equals(chapter.bookId).filter(({ title: chapterTitle }) => chapterTitle === chapter.title).toArray();
        const canUseLegacyTitleFallback = matchingTitleChapters.length === 1;

        await db.bookChapters.update(chapterId, { source: 'manual', title });
        await db.bookPages.where('bookId').equals(chapter.bookId).filter((page) =>
            page.chapterId === chapterId || (page.chapterId === undefined && canUseLegacyTitleFallback && page.chapter === chapter.title)
        ).modify({ chapter: title, chapterId });
    });
}


export interface BookChapterBoundaryInput {
    confidence?: number;
    startPage: number;
    title: string;
}

export async function replaceBookChapterAssignments(bookId: number, boundaries: BookChapterBoundaryInput[]): Promise<BookChapter[]> {
    return db.transaction('rw', db.books, db.bookChapters, db.bookPages, db.bookConcepts, async () => {
        const pages = await db.bookPages.where('bookId').equals(bookId).sortBy('pageNumber');
        const normalized = boundaries
            .filter(({ startPage, title }) => Number.isSafeInteger(startPage) && startPage >= 1 && Boolean(title.trim()))
            .sort((a, b) => a.startPage - b.startPage)
            .filter(({ startPage }, index, values) => index === 0 || values[index - 1].startPage !== startPage);

        if (!pages.length || !normalized.length) {
            throw new Error('Chapter boundaries require recognized pages and at least one valid boundary.');
        }

        const existing = await db.bookChapters.where('bookId').equals(bookId).toArray();
        const availableByTitle = new Map<string, BookChapter[]>();

        existing.forEach((chapter) => {
            const key = chapter.title.trim().toLocaleLowerCase();
            availableByTitle.set(key, [...(availableByTitle.get(key) ?? []), chapter]);
        });

        const usedIds = new Set<number>();
        const chapters: BookChapter[] = [];

        for (const boundary of normalized) {
            const key = boundary.title.trim().toLocaleLowerCase();
            const reusable = (availableByTitle.get(key) ?? []).find(({ id }) => id !== undefined && !usedIds.has(id));
            let chapter: BookChapter;

            if (reusable?.id !== undefined) {
                await db.bookChapters.update(reusable.id, { confidence: boundary.confidence, source: 'ai', title: boundary.title.trim() });
                chapter = { ...reusable, confidence: boundary.confidence, source: 'ai', title: boundary.title.trim() };
                usedIds.add(reusable.id);
            } else {
                const row: BookChapter = { bookId, confidence: boundary.confidence, source: 'ai', title: boundary.title.trim() };
                const id = await db.bookChapters.add(row);
                chapter = { ...row, id };
                usedIds.add(id);
            }

            chapters.push(chapter);
        }

        for (const page of pages) {
            // A first chapter boundary after page 1 means the preceding pages
            // are front matter. Do not synthesize a chapter for them: excluding
            // the pages here keeps them out of Concepts and every downstream
            // processing stage while preserving the recognized page content.
            if (page.pageNumber < normalized[0].startPage) {
                await db.bookPages.update([bookId, page.pageNumber], {
                    chapter: '',
                    chapterId: undefined,
                    conceptsProcessed: false,
                    excludedFromAnalysis: true
                });
                await db.bookConcepts.where('bookPage').equals([bookId, page.pageNumber]).modify({ chapterId: undefined });
                continue;
            }

            let boundaryIndex = 0;

            for (let index = 1; index < normalized.length && normalized[index].startPage <= page.pageNumber; index++) {
                boundaryIndex = index;
            }

            const chapter = chapters[boundaryIndex];

            if (chapter?.id === undefined) {
                continue;
            }

            await db.bookPages.update([bookId, page.pageNumber], { chapter: chapter.title, chapterId: chapter.id, excludedFromAnalysis: false });
            await db.bookConcepts.where('bookPage').equals([bookId, page.pageNumber]).modify({ chapterId: chapter.id });
        }

        const book = await db.books.get(bookId);

        if (book) {
            await db.books.update(bookId, { chapterOrder: chapters.flatMap(({ id }) => id === undefined ? [] : [id]) });
        }

        return chapters;
    });
}

export async function assignBookPageChapter(bookId: number, pageNumber: number, chapterId: number): Promise<void> {
    await db.transaction('rw', db.bookPages, db.bookChapters, db.bookConcepts, async () => {
        const chapter = await db.bookChapters.get(chapterId);

        if (!chapter || chapter.bookId !== bookId) {
            throw new Error('Book chapter not found.');
        }

        await db.bookPages.update([bookId, pageNumber], { chapter: chapter.title, chapterId, excludedFromAnalysis: false });
        await db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).modify({ chapterId });
    });
}

export async function splitBookChapterAtPage(bookId: number, pageNumber: number, title: string): Promise<number> {
    const cleanedTitle = title.trim();

    if (!cleanedTitle) {
        throw new Error('Chapter title is required.');
    }

    return db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, async () => {
        const pages = await db.bookPages.where('bookId').equals(bookId).sortBy('pageNumber');
        const startIndex = pages.findIndex((page) => page.pageNumber === pageNumber);

        if (startIndex < 0) {
            throw new Error('Book page not found.');
        }

        const originalChapterId = pages[startIndex].chapterId;
        const originalTitle = pages[startIndex].chapter;
        const chapterId = await db.bookChapters.add({ bookId, confidence: 1, source: 'manual', title: cleanedTitle });
        for (let index = startIndex; index < pages.length; index++) {
            const page = pages[index];
            const sameSegment = originalChapterId !== undefined ? page.chapterId === originalChapterId : page.chapter === originalTitle;

            if (!sameSegment) {
                break;
            }

            await db.bookPages.update([bookId, page.pageNumber], { chapter: cleanedTitle, chapterId, excludedFromAnalysis: false });
            // Preserve explicit thematic memberships created by Refine Chapters.
            // A Concept whose source page happens to move during a later split may
            // intentionally belong to another learning chapter. Only Concepts that
            // still belong to the chapter being split (or legacy rows without an
            // explicit chapterId) should follow the page into the new chapter.
            await db.bookConcepts
                .where('bookPage')
                .equals([bookId, page.pageNumber])
                .filter(({ chapterId: conceptChapterId }) => conceptChapterId === undefined || conceptChapterId === originalChapterId)
                .modify({ chapterId });
        }

        const book = await db.books.get(bookId);
        const order = book?.chapterOrder ?? [];
        const originalOrderIndex = originalChapterId === undefined ? -1 : order.indexOf(originalChapterId);
        const nextOrder = originalOrderIndex >= 0 ? [...order.slice(0, originalOrderIndex + 1), chapterId, ...order.slice(originalOrderIndex + 1)] : [...order, chapterId];

        await db.books.update(bookId, { chapterOrder: Array.from(new Set(nextOrder)) });

        return chapterId;
    });
}

export interface BookChapterRefinementInput {
    groups: Array<{ conceptIds: number[]; title: string }>;
    sourceChapterId: number;
    sourcePageNumbers: number[];
    splitPages: number[];
}

export interface BookChapterRefinementAssignment {
    chapterId: number;
    conceptId: number;
    displayOrder: number;
}

/**
 * Persist a complete Refine Chapters plan in one IndexedDB transaction. The AI
 * proposal is computed before this call; from the first title change through
 * the final concept membership update, either every refinement is committed or
 * none of it is.
 */
export async function applyBookChapterRefinements(bookId: number, refinements: BookChapterRefinementInput[]): Promise<BookChapterRefinementAssignment[]> {
    if (!refinements.length) {
        return [];
    }

    return db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.skills, db.exerciseTemplates, db.abilities, db.images, db.mathpixPdfJobs, async () => {
        const storedBook = await db.books.get(bookId);

        if (!storedBook) {
            throw new Error('Book not found.');
        }

        // The structural mutation and its downstream-stage invalidation are one
        // commit. A failed refinement therefore leaves both the chapter graph
        // and the processing-stage invariant exactly as they were before.
        await clearBookEntitiesAfterProcessingStage(bookId, 'refineChapters');
        const resetBook = withBookProcessingStagesResetFrom({ ...storedBook, completedStages: getBookCompletedStages(storedBook) }, 'abilities');

        await db.books.update(bookId, { completedStages: resetBook.completedStages });

        const expectations: BookChapterRefinementAssignment[] = [];
        const affectedChapterIds = new Set<number>();

        for (const refinement of refinements) {
            if (!refinement.groups.length || refinement.splitPages.length !== refinement.groups.length - 1 || refinement.sourcePageNumbers.length === 0) {
                throw new Error('Invalid chapter refinement plan.');
            }

            const sourceChapter = await db.bookChapters.get(refinement.sourceChapterId);

            if (!sourceChapter || sourceChapter.bookId !== bookId) {
                throw new Error('Refine Chapters source chapter was not found.');
            }

            const firstTitle = refinement.groups[0].title.trim();

            if (!firstTitle) {
                throw new Error('Refined chapter title is required.');
            }

            await db.bookChapters.update(refinement.sourceChapterId, { source: 'manual', title: firstTitle });
            await db.bookPages.where('bookId').equals(bookId).filter(({ chapterId }) => chapterId === refinement.sourceChapterId).modify({ chapter: firstTitle });
            affectedChapterIds.add(refinement.sourceChapterId);

            for (let splitIndex = 0; splitIndex < refinement.splitPages.length; splitIndex++) {
                const pageNumber = refinement.splitPages[splitIndex];
                const title = refinement.groups[splitIndex + 1].title.trim();
                const pages = await db.bookPages.where('bookId').equals(bookId).sortBy('pageNumber');
                const startIndex = pages.findIndex((page) => page.pageNumber === pageNumber);

                if (startIndex < 0 || !title) {
                    throw new Error('Refine Chapters contains an invalid split.');
                }

                const originalChapterId = pages[startIndex].chapterId;

                if (originalChapterId === undefined) {
                    throw new Error('Refine Chapters cannot split a page without a chapter id.');
                }

                const newChapterId = await db.bookChapters.add({ bookId, confidence: 1, source: 'manual', title });

                for (let index = startIndex; index < pages.length; index++) {
                    const page = pages[index];
                    const sameSegment = page.chapterId === originalChapterId;

                    if (!sameSegment) {
                        break;
                    }

                    await db.bookPages.update([bookId, page.pageNumber], { chapter: title, chapterId: newChapterId, excludedFromAnalysis: false });
                    await db.bookConcepts
                        .where('bookPage')
                        .equals([bookId, page.pageNumber])
                        .filter(({ chapterId }) => chapterId === undefined || chapterId === originalChapterId)
                        .modify({ chapterId: newChapterId });
                }

                const storedBook = await db.books.get(bookId);
                const order = storedBook?.chapterOrder ?? [];
                const originalOrderIndex = order.indexOf(originalChapterId);
                const nextOrder = originalOrderIndex >= 0
                    ? [...order.slice(0, originalOrderIndex + 1), newChapterId, ...order.slice(originalOrderIndex + 1)]
                    : [...order, newChapterId];

                await db.books.update(bookId, { chapterOrder: Array.from(new Set(nextOrder)) });
                affectedChapterIds.add(originalChapterId);
                affectedChapterIds.add(newChapterId);

            }

            const refreshedPages = await db.bookPages.where('bookId').equals(bookId).toArray();
            const anchorPages = [refinement.sourcePageNumbers[0], ...refinement.splitPages];
            const refinedChapterIds = anchorPages.map((anchorPage) => refreshedPages.find(({ pageNumber }) => pageNumber === anchorPage)?.chapterId);

            if (refinedChapterIds.some((chapterId) => chapterId === undefined) || new Set(refinedChapterIds).size !== refinement.groups.length) {
                throw new Error('Unable to resolve refined chapter ids after splitting.');
            }

            const assignments = refinement.groups.flatMap((group, groupIndex) => group.conceptIds.map((conceptId, displayOrder) => ({
                chapterId: refinedChapterIds[groupIndex] as number,
                conceptId,
                displayOrder
            })));
            const concepts = await db.bookConcepts.bulkGet(assignments.map(({ conceptId }) => conceptId));

            if (concepts.some((concept) => !concept)) {
                throw new Error('Refine Chapters contains an unknown concept id.');
            }

            for (let index = 0; index < assignments.length; index++) {
                const assignment = assignments[index];
                const concept = concepts[index] as BookConcept;

                if (concept.bookPage[0] !== bookId) {
                    throw new Error('Refine Chapters cannot move a concept from another book.');
                }

                if (concept.chapterId !== undefined) {
                    affectedChapterIds.add(concept.chapterId);
                }
                affectedChapterIds.add(assignment.chapterId);
                await db.bookConcepts.update(assignment.conceptId, { chapterId: assignment.chapterId, displayOrder: assignment.displayOrder });
                expectations.push(assignment);
            }
        }

        for (const chapterId of affectedChapterIds) {
            await syncChapterLearningDisplayOrder(chapterId);
        }

        const verifiedConcepts = await db.bookConcepts.bulkGet(expectations.map(({ conceptId }) => conceptId));
        const membershipPersisted = expectations.every(({ chapterId, displayOrder }, index) => {
            const concept = verifiedConcepts[index];

            return concept?.chapterId === chapterId && concept.displayOrder === displayOrder;
        });

        if (!membershipPersisted) {
            throw new Error('Unable to persist the complete thematic chapter refinement plan.');
        }

        const refinedBook = await db.books.get(bookId);

        if (!refinedBook) {
            throw new Error('Book not found after chapter refinement.');
        }

        const completedBook = withCompletedBookProcessingStage({ ...refinedBook, completedStages: getBookCompletedStages(refinedBook) }, 'refineChapters');

        await db.books.update(bookId, { completedStages: completedBook.completedStages });

        return expectations;
    });
}

export async function mergeBookChapterWithPrevious(bookId: number, chapterId: number): Promise<void> {
    await db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, async () => {
        const pages = await db.bookPages.where('bookId').equals(bookId).sortBy('pageNumber');
        const firstIndex = pages.findIndex((page) => page.chapterId === chapterId);

        if (firstIndex <= 0) {
            throw new Error('This chapter has no previous chapter to merge into.');
        }

        const previousPage = pages[firstIndex - 1];
        const previousChapter = previousPage.chapterId === undefined ? undefined : await db.bookChapters.get(previousPage.chapterId);

        if (!previousChapter?.id) {
            throw new Error('Previous chapter is not identified.');
        }

        for (const page of pages.filter((page) => page.chapterId === chapterId)) {
            await db.bookPages.update([bookId, page.pageNumber], { chapter: previousChapter.title, chapterId: previousChapter.id, excludedFromAnalysis: false });
            await db.bookConcepts.where('bookPage').equals([bookId, page.pageNumber]).modify({ chapterId: previousChapter.id });
        }

        const book = await db.books.get(bookId);

        if (book?.chapterOrder) {
            await db.books.update(bookId, { chapterOrder: book.chapterOrder.filter((id) => id !== chapterId) });
        }

        await db.bookChapters.delete(chapterId);
    });
}

export async function deleteBookChapters(bookId: number, chapterIds: number[]): Promise<void> {
    const uniqueIds = Array.from(new Set(chapterIds.filter((id) => Number.isSafeInteger(id) && id > 0)));

    if (!uniqueIds.length) {
        return;
    }

    await db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.skills, db.exerciseTemplates, db.abilities, db.images, async () => {
        const chapters = await db.bookChapters.bulkGet(uniqueIds);

        if (chapters.some((chapter) => !chapter || chapter.bookId !== bookId)) {
            throw new Error('One or more book chapters were not found.');
        }

        const selected = new Set(uniqueIds);
        const pages = await db.bookPages.where('bookId').equals(bookId).filter(({ chapterId }) => chapterId !== undefined && selected.has(chapterId)).toArray();
        const skillIds = (await Promise.all(uniqueIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).primaryKeys()))).flat() as number[];

        for (const page of pages) {
            const conceptIds = (await db.bookConcepts.where('bookPage').equals([bookId, page.pageNumber]).primaryKeys()) as number[];

            await db.bookPages.update([bookId, page.pageNumber], {
                chapter: '',
                chapterId: undefined,
                conceptsProcessed: false,
                excludedFromAnalysis: true
            });
            await db.bookConcepts.where('bookPage').equals([bookId, page.pageNumber]).delete();
            if (conceptIds.length) {
                await db.conceptEmbeddings.bulkDelete(conceptIds);
            }
        }

        const pageLessConcepts = await db.bookConcepts.where('bookPage').equals([bookId, 0]).toArray();
        const pageLessConceptIds = pageLessConcepts.flatMap(({ chapterId, id }) => id !== undefined && chapterId !== undefined && selected.has(chapterId) ? [id] : []);

        await Promise.all(pageLessConceptIds.map((id) => db.bookConcepts.delete(id)));
        if (pageLessConceptIds.length) {
            await db.conceptEmbeddings.bulkDelete(pageLessConceptIds);
        }
        await Promise.all(skillIds.map((skillId) => db.exerciseTemplates.where('skillId').equals(skillId).delete()));
        await Promise.all(uniqueIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).delete()));
        await db.bookChapters.bulkDelete(uniqueIds);

        const book = await db.books.get(bookId);

        if (book) {
            const updated = withBookProcessingStagesResetFrom({ ...book, completedStages: getBookCompletedStages(book) }, 'concepts');

            await db.books.update(bookId, {
                chapterOrder: (book.chapterOrder ?? []).filter((chapterId) => !selected.has(chapterId)),
                completedStages: updated.completedStages
            });
        }
    });
}

export async function replaceParsedBookPageContent(bookId: number, pageNumber: number, chapterTitle: string, concepts: Array<Omit<BookConcept, 'bookPage' | 'chapterId' | 'id'>>): Promise<{ concepts: BookConcept[] }> {
    return db.transaction('rw', db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.abilities, db.images, async () => {
        const storedPage = await db.bookPages.get([bookId, pageNumber]);
        const previousPage = storedPage?.chapterId !== undefined || storedPage?.chapter.trim()
            ? undefined
            : (await db.bookPages.where('bookId').equals(bookId)
                .filter((page) => page.pageNumber < pageNumber && (page.chapterId !== undefined || Boolean(page.chapter.trim())))
                .toArray())
                .sort((a, b) => b.pageNumber - a.pageNumber)[0];
        const preferredChapterId = storedPage?.chapterId ?? previousPage?.chapterId;
        const preferredChapter = preferredChapterId === undefined ? undefined : await db.bookChapters.get(preferredChapterId);
        const resolvedChapterTitle = preferredChapter?.title || storedPage?.chapter.trim() || chapterTitle.trim() || previousPage?.chapter.trim() || 'Front matter';
        const titleMatches = preferredChapter
            ? []
            : await db.bookChapters.where('bookId').equals(bookId).filter(({ title }) => title === resolvedChapterTitle).toArray();
        // A title is only a safe legacy fallback when it identifies exactly one
        // chapter. Duplicate titles are valid, so never arbitrarily attach a
        // page/concept to whichever matching row Dexie happens to return first.
        const existingChapter = preferredChapter ?? (titleMatches.length === 1 ? titleMatches[0] : undefined);
        const chapterId = existingChapter?.id ?? await db.bookChapters.add({ bookId, source: 'legacy', title: resolvedChapterTitle });
        const conceptBookPage: [number, number] = [bookId, pageNumber];
        const conceptRows = concepts.map((concept) => ({ ...concept, attempt: concept.attempt ?? 0, bookPage: conceptBookPage, chapterId }));
        const previousConceptIds = (await db.bookConcepts.where('bookPage').equals(conceptBookPage).primaryKeys()) as number[];
        await db.bookConcepts.where('bookPage').equals(conceptBookPage).delete();
        if (previousConceptIds.length) {
            await db.conceptEmbeddings.bulkDelete(previousConceptIds);
        }
        const conceptIds = await db.bookConcepts.bulkAdd(conceptRows, { allKeys: true });
        await syncChapterLearningDisplayOrder(chapterId);

        return {
            concepts: conceptRows.map((concept, index) => ({ ...concept, id: conceptIds[index] }))
        };
    });
}

export async function getBookPages(bookId: number): Promise<BookPage[]> {
    return db.bookPages.where('bookId').equals(bookId).sortBy('pageNumber');
}

export async function deleteBookPage(bookId: number, pageNumber: number): Promise<void> {
    await db.transaction('rw', db.bookPages, db.bookConcepts, db.conceptEmbeddings, db.abilities, db.images, async () => {
        const conceptIds = (await db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).primaryKeys()) as number[];

        await db.bookPages.delete([bookId, pageNumber]);
        await db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).delete();
        if (conceptIds.length) {
            await db.conceptEmbeddings.bulkDelete(conceptIds);
        }
    });
}

/** Fetch one Concept for the Ability change log without scanning every page. */
export async function getBookConceptById(id: number): Promise<BookConcept | undefined> {
    return db.bookConcepts.get(id);
}

export async function getBookConceptsForBookPage(bookId: number, pageNumber: number): Promise<BookConcept[]> {
    return (await db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).sortBy('id'))
        .filter(({ isSplitParent }) => !isSplitParent);
}

export async function createBookConcept(concept: Omit<BookConcept, 'id'>): Promise<BookConcept> {
    return db.transaction('rw', db.bookConcepts, db.bookPages, async () => {
        const pageChapterId = concept.bookPage[1] === 0 ? undefined : (await db.bookPages.get(concept.bookPage))?.chapterId;
        const chapterId = concept.chapterId ?? pageChapterId;
        const normalizedConcept: Omit<BookConcept, 'id'> = chapterId === undefined ? concept : { ...concept, chapterId };
        const siblings = chapterId === undefined
            ? await db.bookConcepts.where('bookPage').equals(concept.bookPage).sortBy('id')
            : (await chapterConceptsForLearningOrder(chapterId)).concepts;
        const displayOrder = concept.displayOrder ?? siblings.reduce((max, sibling, index) => Math.max(max, sibling.displayOrder ?? index), -1) + 1;
        const row: BookConcept = { ...normalizedConcept, attempt: concept.attempt ?? 0, displayOrder };
        const id = await db.bookConcepts.add(row);

        return { ...row, id };
    });
}

export async function updateBookConcept(id: number, changes: Partial<Omit<BookConcept, 'id'>>): Promise<BookConcept | undefined> {
    return db.transaction('rw', db.bookConcepts, db.conceptEmbeddings, db.bookPages, db.abilities, db.images, async () => {
        const previous = await db.bookConcepts.get(id);
        const previousChapterId = await chapterIdForConcept(previous);

        await db.bookConcepts.update(id, changes);
        if (Object.prototype.hasOwnProperty.call(changes, 'title') || Object.prototype.hasOwnProperty.call(changes, 'description')) {
            await db.conceptEmbeddings.delete(id);
            if (previous) {
                const moduleId = `book-${previous.bookPage[0]}-concept-${id}`;
                const rows = await db.abilities.where('moduleId').equals(moduleId).toArray() as Ability[];
                await db.abilities.where('moduleId').equals(moduleId).delete();
                await deleteUnreferencedAbilityImages(rows.flatMap(({ content }) => abilityImageIds(content)));
            }
        }
        const concept = await db.bookConcepts.get(id);
        const nextChapterId = await chapterIdForConcept(concept);
        const chapterMembershipChanged = Object.prototype.hasOwnProperty.call(changes, 'chapterId') && previousChapterId !== nextChapterId;

        if (Object.prototype.hasOwnProperty.call(changes, 'displayOrder') || chapterMembershipChanged) {
            const affectedChapterIds = new Set([previousChapterId, nextChapterId].filter((chapterId): chapterId is number => chapterId !== undefined));

            for (const chapterId of affectedChapterIds) {
                await syncChapterLearningDisplayOrder(chapterId);
            }
        }

        return db.bookConcepts.get(id);
    });
}

export async function assignBookConceptsToChapters(assignments: Array<{ chapterId: number; displayOrder: number; id: number }>): Promise<void> {
    if (!assignments.length) {
        return;
    }

    const conceptIds = assignments.map(({ id }) => id);

    if (new Set(conceptIds).size !== conceptIds.length) {
        throw new Error('Concept chapter assignments contain duplicate ids.');
    }

    if (assignments.some(({ chapterId, displayOrder, id }) => !Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(chapterId) || chapterId <= 0 || !Number.isSafeInteger(displayOrder) || displayOrder < 0)) {
        throw new Error('Concept chapter assignments are invalid.');
    }

    await db.transaction('rw', db.bookConcepts, db.bookPages, db.bookChapters, db.abilities, async () => {
        const concepts = await db.bookConcepts.bulkGet(conceptIds);

        if (concepts.some((concept) => !concept)) {
            throw new Error('Concept chapter assignments contain an unknown concept id.');
        }

        const targetChapterIds = Array.from(new Set(assignments.map(({ chapterId }) => chapterId)));
        const targetChapters = await db.bookChapters.bulkGet(targetChapterIds);
        const targetChapterById = new Map(targetChapterIds.flatMap((chapterId, index) => {
            const chapter = targetChapters[index];

            return chapter ? [[chapterId, chapter] as const] : [];
        }));

        if (targetChapterById.size !== targetChapterIds.length) {
            throw new Error('Concept chapter assignments contain an unknown chapter id.');
        }

        const affectedChapterIds = new Set<number>();

        for (let index = 0; index < assignments.length; index++) {
            const assignment = assignments[index];
            const concept = concepts[index] as BookConcept;
            const targetChapter = targetChapterById.get(assignment.chapterId);

            if (!targetChapter || targetChapter.bookId !== concept.bookPage[0]) {
                throw new Error('Concept chapter assignment targets a chapter from another book.');
            }

            const previousChapterId = await chapterIdForConcept(concept);

            if (previousChapterId !== undefined) {
                affectedChapterIds.add(previousChapterId);
            }

            affectedChapterIds.add(assignment.chapterId);
        }

        await Promise.all(assignments.map(({ chapterId, displayOrder, id }) => db.bookConcepts.update(id, { chapterId, displayOrder })));

        for (const chapterId of affectedChapterIds) {
            await syncChapterLearningDisplayOrder(chapterId);
        }
    });
}

export async function reorderBookConcepts(sortedIds: number[], explicitChapterId?: number): Promise<void> {
    if (new Set(sortedIds).size !== sortedIds.length) {
        throw new Error('Concept reorder contains duplicate ids.');
    }

    if (!sortedIds.length) {
        return;
    }

    await db.transaction('rw', db.bookConcepts, db.bookPages, db.abilities, async () => {
        const requestedConcepts = await db.bookConcepts.bulkGet(sortedIds);
        const existingRequestedConcepts = requestedConcepts.filter((concept): concept is BookConcept => concept !== undefined);
        const inferredChapterIds = new Set<number>();

        for (const concept of existingRequestedConcepts) {
            const chapterId = await chapterIdForConcept(concept);

            if (chapterId !== undefined) {
                inferredChapterIds.add(chapterId);
            }
        }

        if (explicitChapterId !== undefined) {
            if (inferredChapterIds.size > 1 || (inferredChapterIds.size === 1 && !inferredChapterIds.has(explicitChapterId))) {
                throw new Error('Concepts from different chapters cannot be reordered together.');
            }

            inferredChapterIds.clear();
            inferredChapterIds.add(explicitChapterId);
        }

        if (inferredChapterIds.size > 1) {
            throw new Error('Concepts from different chapters cannot be reordered together.');
        }

        // Explicit BookConcept.chapterId is authoritative. BookPage assignment
        // remains a fallback for legacy/imported Concepts without chapterId.
        if (inferredChapterIds.size === 1) {
            const chapterId = [...inferredChapterIds][0];
            const { concepts: currentChapterConcepts } = await chapterConceptsForLearningOrder(chapterId);
            const currentConcepts = orderedByDisplayOrder(
                currentChapterConcepts,
                (a, b) => a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER)
            );
            const currentIds = new Set(currentConcepts.flatMap(({ id }) => id === undefined ? [] : [id]));
            const requestedCurrentIds = sortedIds.filter((id) => currentIds.has(id));

            // A Fix Concepts pass can replace every row in the chapter between
            // the UI snapshot and this transaction. With an explicit/inferred
            // chapter scope we can still recover safely: a zero-overlap request
            // simply preserves the live chapter order, while a partial-overlap
            // request reorders the surviving rows in their existing slots. The
            // caller reloads the canonical rows after the transaction.
            const reconciled = reorderSubsetInExistingSlots(currentConcepts, requestedCurrentIds, ({ id }) => id);

            await Promise.all(reconciled.flatMap((concept, displayOrder) => concept.id === undefined ? [] : [db.bookConcepts.update(concept.id, { displayOrder, chapterId })]));
            await syncChapterLearningDisplayOrder(chapterId);

            return;
        }

        // Legacy page-less Concepts have no chapter information at all, so there
        // is no safe scope against which stale IDs can be reconciled.
        if (requestedConcepts.some((concept) => !concept)) {
            throw new Error('Concept reorder contains an unknown id.');
        }

        await Promise.all(sortedIds.map((id, displayOrder) => db.bookConcepts.update(id, { displayOrder })));
    });
}

/**
 * Persist Course drag-and-drop in the same canonical Concept order used by the
 * Concepts and Abilities views. Ability record hashes and the legacy
 * book.courseOrder are NOT independent sources of learning order.
 *
 * Changing the chapter above an Ability also changes the source Concept's
 * chapter. Unrepresented Concepts (which have no Ability yet) keep their
 * relative positions. All writes, including Book outline metadata, are atomic.
 */
export async function saveBookCourseLearningOrder(bookId: number, courseOrder: string[]): Promise<void> {
    if (!courseOrder.length || !courseOrder[0].startsWith('chapter:') || new Set(courseOrder).size !== courseOrder.length) {
        throw new Error('A Course must begin with a chapter and cannot contain duplicate rows.');
    }

    await db.transaction('rw', db.books, db.bookChapters, db.bookConcepts, db.bookPages, db.abilities, async () => {
        const book = await db.books.get(bookId);
        if (!book) throw new Error('Book no longer exists.');

        const chapters = await db.bookChapters.where('bookId').equals(bookId).toArray();
        const knownChapterIds = new Set(chapters.flatMap(({ id }) => id === undefined ? [] : [id]));
        const headingIds: number[] = [];
        const desiredByChapter = new Map<number, number[]>();
        const targets = new Map<number, number>();
        const conceptsById = new Map<number, BookConcept>();
        const affectedChapterIds = new Set<number>();
        let currentChapterId: number | undefined;

        for (const key of courseOrder) {
            if (key.startsWith('chapter:')) {
                const chapterId = Number(key.slice('chapter:'.length));
                if (!Number.isSafeInteger(chapterId) || !knownChapterIds.has(chapterId) || headingIds.includes(chapterId)) {
                    throw new Error('Course order contains an unknown or duplicate chapter.');
                }
                currentChapterId = chapterId;
                headingIds.push(chapterId);
                desiredByChapter.set(chapterId, []);
            } else if (key.startsWith('template:') && currentChapterId !== undefined) {
                const record = await db.abilities.get(key.slice('template:'.length));
                const match = record && CONCEPT_ABILITY_MODULE.exec(record.moduleId);
                if (!match || Number(match[1]) !== bookId) throw new Error('Course order contains an unknown Ability.');
                const conceptId = Number(match[2]);
                let concept = conceptsById.get(conceptId);
                if (!concept) {
                    concept = await db.bookConcepts.get(conceptId);
                    if (!concept || concept.bookPage[0] !== bookId) throw new Error('Ability has no corresponding Concept.');
                    conceptsById.set(conceptId, concept);
                    const oldChapterId = await chapterIdForConcept(concept);
                    if (oldChapterId !== undefined) affectedChapterIds.add(oldChapterId);
                }
                const previousTarget = targets.get(conceptId);
                if (previousTarget !== undefined && previousTarget !== currentChapterId) {
                    throw new Error('Abilities belonging to one Concept cannot be split between chapters.');
                }
                if (previousTarget === undefined) {
                    targets.set(conceptId, currentChapterId);
                    desiredByChapter.get(currentChapterId)?.push(conceptId);
                }
                affectedChapterIds.add(currentChapterId);
            } else {
                throw new Error('Course order contains an invalid row.');
            }
        }

        for (const chapterId of affectedChapterIds) {
            const { concepts } = await chapterConceptsForLearningOrder(chapterId);
            const baseline = orderedByDisplayOrder(concepts, (a, b) => a.bookPage[1] - b.bookPage[1] || (a.id ?? 0) - (b.id ?? 0))
                .filter(({ id }) => id === undefined || !targets.has(id) || targets.get(id) === chapterId);
            const present = new Set(baseline.flatMap(({ id }) => id === undefined ? [] : [id]));
            const desired = desiredByChapter.get(chapterId) ?? [];
            const incoming = desired.filter((id) => !present.has(id)).map((id) => conceptsById.get(id) as BookConcept);
            const reordered = reorderSubsetInExistingSlots([...baseline, ...incoming], desired, ({ id }) => id);

            await Promise.all(reordered.flatMap(({ id }, displayOrder) => id === undefined ? [] : [db.bookConcepts.update(id, { chapterId, displayOrder })]));
        }
        for (const chapterId of affectedChapterIds) {
            await syncChapterLearningDisplayOrder(chapterId);
        }

        // Keep excluded chapter headings in the Book's chapter list. Only
        // visible headings are reordered by Course drag-and-drop.
        const chapterOrder = [...headingIds, ...chapters.flatMap(({ id }) => id === undefined || headingIds.includes(id) ? [] : [id])];
        await db.books.update(bookId, { chapterOrder, courseOrder });
    });
}

// Shared by ordinary deletion and the atomic split commit. Call only inside a
// read/write transaction covering the affected tables.
async function deleteBookConceptRows(id: number, syncOrder = true): Promise<void> {
    const concept = await db.bookConcepts.get(id);
    const chapterId = await chapterIdForConcept(concept);

    await db.bookConcepts.delete(id);
    await db.conceptEmbeddings.delete(id);
    if (concept) {
        const moduleId = `book-${concept.bookPage[0]}-concept-${id}`;
        const records = await db.abilities.where('moduleId').equals(moduleId).toArray() as Ability[];
        await db.abilities.where('moduleId').equals(moduleId).delete();
        await deleteUnreferencedAbilityImages(records.flatMap(({ content }) => abilityImageIds(content)));
    }
    const linkedSkills = await db.skills.filter(({ bookConceptIds }) => (bookConceptIds ?? []).includes(id)).toArray();

    await Promise.all(linkedSkills.flatMap((skill) => skill.id === undefined ? [] : [db.skills.update(skill.id, { bookConceptIds: (skill.bookConceptIds ?? []).filter((conceptId) => conceptId !== id) })]));

    if (syncOrder && chapterId !== undefined) {
        await syncChapterLearningDisplayOrder(chapterId);
    }
}

export async function deleteBookConcept(id: number): Promise<void> {
    await db.transaction('rw', db.bookConcepts, db.conceptEmbeddings, db.skills, db.bookPages, db.abilities, db.images, async () => {
        await deleteBookConceptRows(id);
    });
}

/** Delete an Ability and its source Concept together; do not use for ordinary
 * Ability edits/AI replacement, which must retain the source Concept. */
export async function deleteAbilityWithConcept(recordId: string): Promise<void> {
    await db.transaction('rw', db.books, db.bookConcepts, db.conceptEmbeddings, db.skills, db.bookPages, db.abilities, db.images, async () => {
        const record = await db.abilities.get(recordId);
        if (!record) return;

        const match = CONCEPT_ABILITY_MODULE.exec(record.moduleId);
        const concept = match ? await db.bookConcepts.get(Number(match[2])) : undefined;
        let removedIds = [recordId];

        if (match && concept && concept.bookPage[0] === Number(match[1])) {
            removedIds = (await db.abilities.where('moduleId').equals(record.moduleId).primaryKeys()) as string[];
            await deleteBookConceptRows(Number(match[2]));
        } else {
            await db.abilities.delete(recordId);
            await deleteUnreferencedAbilityImages(abilityImageIds(record.content));
        }

        if (match) {
            const bookId = Number(match[1]);
            const book = await db.books.get(bookId);
            if (book?.courseOrder) {
                const removedKeys = new Set(removedIds.map((id) => `template:${id}`));
                await db.books.update(bookId, { courseOrder: book.courseOrder.filter((key) => !removedKeys.has(key)) });
            }
        }
    });
}

/**
 * Atomically replace a split parent with its fully generated children in the
 * LIVE chapter order. Multiple splits in the same chapter may complete out of
 * order; each transaction uses the current rows, never the AI worker's stale
 * snapshot. If anything fails, the parent and its Ability remain intact.
 */
export async function replaceBookConceptWithChildren(parentId: number, childIds: number[]): Promise<void> {
    if (!Number.isSafeInteger(parentId) || parentId < 1 || !childIds.length ||
        childIds.some((id) => !Number.isSafeInteger(id) || id < 1 || id === parentId) ||
        new Set(childIds).size !== childIds.length) {
        throw new Error('A split needs one parent and distinct saved child Concepts.');
    }

    await db.transaction('rw', db.bookConcepts, db.conceptEmbeddings, db.skills, db.bookPages, db.abilities, db.images, db.bookAbilityChangeLog, async () => {
        const parent = await db.bookConcepts.get(parentId);

        if (!parent) throw new Error('The parent Concept was already removed.');
        const chapterId = await chapterIdForConcept(parent);

        if (chapterId === undefined) throw new Error('The parent Concept has no chapter for learning order.');
        const children = await db.bookConcepts.bulkGet(childIds);

        for (const child of children) {
            if (!child || child.bookPage[0] !== parent.bookPage[0] || await chapterIdForConcept(child) !== chapterId) {
                throw new Error('Every split child must exist in the same book chapter as its parent.');
            }
            // Do not destroy the original teaching material if even one child
            // failed to generate its replacement Ability.
            if (!await db.abilities.where('moduleId').equals(`book-${parent.bookPage[0]}-concept-${child.id}`).count()) {
                throw new Error('Every split child needs a generated Ability before committing the split.');
            }
        }

        const { concepts } = await chapterConceptsForLearningOrder(chapterId);
        const ordered = orderedByDisplayOrder(concepts, (a, b) => a.bookPage[1] - b.bookPage[1] || (a.id ?? 0) - (b.id ?? 0));
        const childSet = new Set(childIds);
        const withoutDrafts = ordered.filter(({ id }) => id === undefined || !childSet.has(id));
        const parentIndex = withoutDrafts.findIndex(({ id }) => id === parentId);

        if (parentIndex < 0) throw new Error('The split parent is no longer in its chapter.');
        const replacements = children.filter((child): child is BookConcept => child !== undefined);
        const nextOrder = [...withoutDrafts.slice(0, parentIndex), ...replacements, ...withoutDrafts.slice(parentIndex + 1)];

        // A Split replaces the Concept, not the Ability: no retired parent
        // Concept or parent Ability should survive. If this Concept itself
        // belonged to an older split group, preserve only that *existing*
        // ancestor relationship, never a reference to the deleted Concept.
        await Promise.all(childIds.map((id) => db.bookConcepts.update(id, {
            parentConceptId: parent.parentConceptId,
            isSplitParent: false
        })));
        const oldAbilities = await db.abilities.where('moduleId').equals(`book-${parent.bookPage[0]}-concept-${parentId}`).toArray();
        const oldAbilityIds = new Set(oldAbilities.map(({ id }) => id));
        const staleLogIds = await db.bookAbilityChangeLog.where('bookId').equals(parent.bookPage[0])
            .filter((entry) => entry.conceptId === parentId || oldAbilityIds.has(entry.recordId))
            .primaryKeys() as number[];
        if (staleLogIds.length) await db.bookAbilityChangeLog.bulkDelete(staleLogIds);
        const linkedSkills = await db.skills.filter(({ bookConceptIds }) => (bookConceptIds ?? []).includes(parentId)).toArray();
        await Promise.all(linkedSkills.flatMap((skill) => skill.id === undefined ? [] : [db.skills.update(skill.id, {
            bookConceptIds: uniqueIdsInOrder((skill.bookConceptIds ?? []).flatMap((id) => id === parentId ? childIds : [id]))
        })]));
        await deleteBookConceptRows(parentId, false);
        await Promise.all(nextOrder.flatMap(({ id }, displayOrder) => id === undefined ? [] : [db.bookConcepts.update(id, { displayOrder, chapterId })]));
        await syncChapterLearningDisplayOrder(chapterId);
    });
}

export async function replaceBookConceptsForBookPage(bookId: number, pageNumber: number, concepts: Array<Omit<BookConcept, 'bookPage' | 'id'>>): Promise<BookConcept[]> {
    const bookPage: [number, number] = [bookId, pageNumber];

    return db.transaction('rw', db.bookConcepts, db.conceptEmbeddings, async () => {
        const previousConceptIds = (await db.bookConcepts.where('bookPage').equals(bookPage).primaryKeys()) as number[];
        await db.bookConcepts.where('bookPage').equals(bookPage).delete();
        if (previousConceptIds.length) {
            await db.conceptEmbeddings.bulkDelete(previousConceptIds);
        }
        const ids = await db.bookConcepts.bulkAdd(concepts.map((concept) => ({ ...concept, attempt: concept.attempt ?? 0, bookPage })), { allKeys: true });

        return concepts.map((concept, index) => ({ ...concept, attempt: concept.attempt ?? 0, bookPage, id: ids[index] }));
    });
}

export async function getSkillsForChapter(chapterId: number): Promise<Skill[]> {
    return db.skills.where('chapterId').equals(chapterId).sortBy('rank');
}

export async function replaceSkillsForChapter(chapterId: number, skills: Array<Omit<Skill, 'chapterId' | 'id'>>): Promise<Skill[]> {
    return db.transaction('rw', db.skills, async () => {
        await db.skills.where('chapterId').equals(chapterId).delete();
        const rows = skills.map((skill) => ({ ...skill, chapterId }));
        const ids = await db.skills.bulkAdd(rows, { allKeys: true });

        return rows.map((skill, index) => ({ ...skill, id: ids[index] }));
    });
}

export async function deleteAndRankSkills(chapterId: number, deleteIds: number[], sortedIds: number[], mergeInto: Array<{ deleteId: number; keepId: number }>): Promise<void> {
    await db.transaction('rw', db.skills, db.exerciseTemplates, async () => {
        const chapterSkillIds = await db.skills.where('chapterId').equals(chapterId).primaryKeys() as number[];
        const allowedIds = new Set(chapterSkillIds);
        const allowedDeleteIds = deleteIds.filter((id) => allowedIds.has(id));

        for (const { deleteId, keepId } of mergeInto) {
            if (!allowedDeleteIds.includes(deleteId) || !allowedIds.has(keepId)) {
                continue;
            }

            const [deletedSkill, keptSkill] = await Promise.all([db.skills.get(deleteId), db.skills.get(keepId)]);

            if (deletedSkill && keptSkill) {
                await db.skills.update(keepId, {
                    bookConceptIds: Array.from(new Set([...(keptSkill.bookConceptIds ?? []), ...(deletedSkill.bookConceptIds ?? [])]))
                });
            }
        }

        await Promise.all(allowedDeleteIds.map((skillId) => db.exerciseTemplates.where('skillId').equals(skillId).delete()));
        await db.skills.bulkDelete(allowedDeleteIds);
        await Promise.all(sortedIds.filter((id) => allowedIds.has(id)).map((id, rank) => db.skills.update(id, { rank })));
    });
}

export async function deleteSkill(id: number): Promise<void> {
    await db.transaction('rw', db.skills, db.exerciseTemplates, async () => {
        await db.exerciseTemplates.where('skillId').equals(id).delete();
        await db.skills.delete(id);
    });
}

export async function getExerciseTemplatesForSkill(skillId: number): Promise<ExerciseTemplate[]> {
    return db.exerciseTemplates.where('skillId').equals(skillId).sortBy('id');
}

export async function replaceExerciseTemplatesForSkill(skillId: number, templates: Array<Omit<ExerciseTemplate, 'skillId' | 'id'>>): Promise<ExerciseTemplate[]> {
    return db.transaction('rw', db.exerciseTemplates, async () => {
        await db.exerciseTemplates.where('skillId').equals(skillId).delete();
        const rows = templates.map((template) => ({ ...template, skillId }));
        const ids = await db.exerciseTemplates.bulkAdd(rows, { allKeys: true });

        return rows.map((template, index) => ({ ...template, id: ids[index] }));
    });
}

export async function addExerciseTemplatesForSkill(skillId: number, templates: Array<Omit<ExerciseTemplate, 'skillId' | 'id'>>): Promise<ExerciseTemplate[]> {
    const rows = templates.map((template) => ({ ...template, skillId }));
    const ids = await db.exerciseTemplates.bulkAdd(rows, { allKeys: true });

    return rows.map((template, index) => ({ ...template, id: ids[index] }));
}

export async function deleteExerciseTemplate(id: number): Promise<void> {
    await db.exerciseTemplates.delete(id);
}

const DEFAULT_INSURANCE_VALIDITY = 730;//Days valid
const DEFAULT_WARRANTY = "573000000000000";//573 Slon for USA, 0.05688 USD in Ethiopia, 100.66*0.05688 USD in USA
const DEFAULT_DIPLOMA_VALIDITY = 730;//Days valid
const DEFAULT_DIPLOMA_PRICE = "475000000000000";//475 Slon for USA, 0.04722 USD in Ethiopia, 100.66*0.04722 USD in USA
// I propose to giveout 10x of badge price, and round to the nearest round integer, so 5k Slon for a US student
const MAX_CACHE_SIZE = 25 * 1024 * 1024; // 25 MB will probably result in 50 MB with IndexedDB storage overhead

// Setting related

export const SettingKey = {
    ACCOUNT: 'account',
    ENCRYPTION_KEY: 'encryptionKey',
    IV: 'iv',
    TUTOR: 'tutor',
    LESSON: 'lesson',
    DEVELOPER: 'developer',
    TEACHER: 'teacher',
    DIPLOMA_PRICE: 'diploma_price',
    DIPLOMA_WARRANTY: 'diploma_warranty',
    DIPLOMA_VALIDITY: 'diploma_validity',
    INSURANCE_VALIDITY: 'insurance_validity',
    CID_CACHE_SIZE: 'cid_cache_size',
    ECONOMY_INITIALIZED: 'ECONOMY_INITIALIZED',
    AIRDROP_COMPATIBLE: 'AIRDROP_COMPATIBLE',
    RECEIVED_AIRDROP: 'RECEIVED_AIRDROP',
    LESSON_RESULTS_ARE_SHOWN: 'LESSON_RESULTS_ARE_SHOWN',
    TUTEE_TUTORIAL_COMPLETED: 'TUTEE_TUTORIAL_COMPLETED',
    TUTOR_TUTORIAL_COMPLETED: 'TUTOR_TUTORIAL_COMPLETED',
    ASSESSMENT_TUTORIAL_COMPLETED: 'ASSESSMENT_TUTORIAL_COMPLETED',
    SCAN_TUTORIAL_COMPLETED: 'SCAN_TUTORIAL_COMPLETED',
    PRESSING_EXAMPLES_TUTORIAL_COMPLETED: 'PRESSING_EXAMPLES_TUTORIAL_COMPLETED',
    EXPECTED_AIRDROP: 'EXPECTED_AIRDROP',
    OPENROUTER_TOKEN: 'OPENROUTER_TOKEN',
    MATHPIX_APP_ID: 'MATHPIX_APP_ID',
    MATHPIX_API_KEY: 'MATHPIX_API_KEY',
    NOW_IS_CLASS_ONBOARDING: 'NOW_IS_CLASS_ONBOARDING',
    LAST_BACKUP_TIME: 'LAST_BACKUP_TIME',
    LAST_PARTNER_CHANGE_TIME: 'LAST_PARTNER_CHANGE_TIME',
    PARTNERS_WITHIN_CLASSROOM: 'PARTNERS_WITHIN_CLASSROOM',
    LAST_SKILL_TUTORING_START_TIME: 'LAST_SKILL_TUTORING_START_TIME',
    LAST_SKILL_TUTORING_ID: 'LAST_SKILL_TUTORING_ID',
    LAST_LESSON_START_TIME: 'LAST_LESSON_START_TIME',
    LAST_LESSON_ID: 'LAST_LESSON_ID',
    FALLBACK_LESSON_ID: 'FALLBACK_LESSON_ID',
    FALLBACK_KNOWLEDGE_ID: 'FALLBACK_KNOWLEDGE_ID',
    APP_VERSION: 'APP_VERSION',
    REQUIRE_SUPERVISION: 'REQUIRE_SUPERVISION',
    COUNT_WITHOUT_CORRECT_FAKE_IN_RAW: 'COUNT_WITHOUT_CORRECT_FAKE_IN_RAW',
    LAST_BAN_START_TIME: 'LAST_BAN_START_TIME',
    BAN_COUNT: 'BAN_COUNT',
    REDO_TUTORIAL: 'REDO_TUTORIAL',
    STANDARDS_EMBEDDER: 'STANDARDS_EMBEDDER',
    CONCEPTS_EMBEDDER: 'CONCEPTS_EMBEDDER',
} as const;

export async function storeSetting(id: string, value: string) {
    const cleanId = DOMPurify.sanitize(id);
    const cleanValue = DOMPurify.sanitize(value);
    await db.settings.put({ id: cleanId, value: cleanValue });
}

export async function setSettingToTrue(id: string) {
    const cleanId = DOMPurify.sanitize(id);
    await db.settings.put({ id: cleanId, value: 'true' });
}

export async function deleteSetting(id: string) {
    const cleanId = DOMPurify.sanitize(id);
    await db.settings.delete(cleanId);
}

export async function getSetting(id: string): Promise<string | undefined> {
    const cleanId = DOMPurify.sanitize(id);
    const setting = await db.settings.get(cleanId);
    return setting ? setting.value : undefined;
};

export async function hasSetting(id: string): Promise<boolean> {
    const value = await getSetting(id);
    return value ? true : false;
};

export async function getStandardEmbeddings(ids: string[]): Promise<StandardEmbedding[]> {
    const uniqueIds = Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));

    if (!uniqueIds.length) {
        return [];
    }

    const rows = await db.standardEmbeddings.bulkGet(uniqueIds);

    return rows.flatMap((row) => row ? [row] : []);
}

export async function putStandardEmbeddings(embeddings: StandardEmbedding[]): Promise<void> {
    if (!embeddings.length) {
        return;
    }

    await db.standardEmbeddings.bulkPut(embeddings);
}

export async function clearStandardEmbeddings(): Promise<void> {
    await db.standardEmbeddings.clear();
}

export async function getConceptEmbeddings(ids: number[]): Promise<ConceptEmbedding[]> {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)));

    if (!uniqueIds.length) {
        return [];
    }

    const rows = await db.conceptEmbeddings.bulkGet(uniqueIds);

    return rows.flatMap((row) => row ? [row] : []);
}

export async function putConceptEmbeddings(embeddings: ConceptEmbedding[]): Promise<void> {
    if (!embeddings.length) {
        return;
    }

    await db.conceptEmbeddings.bulkPut(embeddings);
}

export async function clearConceptEmbeddings(): Promise<void> {
    await db.conceptEmbeddings.clear();
}

export async function deleteConceptEmbedding(id: number): Promise<void> {
    await db.conceptEmbeddings.delete(id);
}

export async function getInsuranceDaysValid() {
    const stored_validity = await getSetting(SettingKey.INSURANCE_VALIDITY);
    return stored_validity ? parseInt(stored_validity, 10) : DEFAULT_INSURANCE_VALIDITY;
}

// LearnRequests related

export async function putLearnRequest(learnRequest: LearnRequest) {
    await db.learnRequests.put(learnRequest);
}

export async function deleteLearnRequest(id: string) {
    await db.learnRequests.delete(id);
}

export async function getLastNonFinishedLessonRequest(createdBefore: number) {
    return db.learnRequests
        .where('created')
        .below(createdBefore)
        .reverse()
        .first();
}
// ScheduledEvent related

export async function putScheduledEvent(scheduledEvent: ScheduledEvent) {
    return db.scheduledEvents.put(scheduledEvent);
}

export async function deleteScheduledEvent(id: number) {
    return db.scheduledEvents.delete(id);
}

export async function deleteAllBanScheduledEvents() {
  return db.scheduledEvents
    .where('type')
    .equals('BAN')
    .delete();
}

export async function getFirstScheduledEventByType(type: ScheduledEventType) {
  return db.scheduledEvents
    .where('[type+id]')
    .between([type, Dexie.minKey], [type, Dexie.maxKey])
    .first();
}

export async function getAllLogEvents() {
  return db.scheduledEvents.where('type').equals('LOG').toArray();
}

export async function getAllBanEvents() {
  return db.scheduledEvents.where('type').equals('BAN').toArray();
}

// Ability related

type AbilityJsonRoot = Record<string, unknown> & { q: unknown[] };

function parseAbilityJson(content: string): { parsed: unknown; root: AbilityJsonRoot } | undefined {
    const json = content.trim().replace(/^```(?:json)?\s*|\s*```$/gi, '').trim();
    let parsed: unknown;

    try {
        parsed = JSON.parse(json) as unknown;
    } catch {
        return undefined;
    }

    const root = Array.isArray(parsed) ? parsed[0] : parsed;

    if (!root || typeof root !== 'object' || !Array.isArray((root as { q?: unknown }).q)) {
        return undefined;
    }

    return { parsed, root: root as AbilityJsonRoot };
}

function abilityImageIdsForField(content: string, field: 'p' | 'i'): number[] {
    const value = parseAbilityJson(content);

    if (!value) return [];

    return Array.from(new Set(value.root.q.flatMap((exercise) => {
        const id = exercise && typeof exercise === 'object' ? (exercise as Record<string, unknown>)[field] : undefined;

        return typeof id === 'number' && Number.isSafeInteger(id) && id > 0 ? [id] : [];
    })));
}

function abilityImageIds(content: string): number[] {
    const value = parseAbilityJson(content);

    if (!value) {
        return [];
    }

    return Array.from(new Set(value.root.q.flatMap((exercise) => {
        if (!exercise || typeof exercise !== 'object') {
            return [];
        }

        const row = exercise as Record<string, unknown>;

        return ['p', 'i'].flatMap((field) => typeof row[field] === 'number' && Number.isSafeInteger(row[field]) && (row[field] as number) > 0 ? [row[field] as number] : []);
    })));
}

function isTikzImageSource(value: string): boolean {
    return /\\begin\s*\{tikzpicture\}/.test(value);
}

async function normalizeAbilityImages(content: string, images: Table<Image, number>): Promise<string> {
    const value = parseAbilityJson(content);

    if (!value) {
        return content;
    }

    for (const exercise of value.root.q) {
        if (!exercise || typeof exercise !== 'object') {
            continue;
        }

        const row = exercise as Record<string, unknown>;

        for (const field of ['p', 'i'] as const) {
            const visual = row[field];
            const errorField = field === 'p' ? 'pError' : 'iError';
            const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
            const explicitPrompt = typeof row[promptField] === 'string' ? (row[promptField] as string).trim() : '';
            const valid = typeof row[errorField] === 'boolean' ? !(row[errorField] as boolean) : undefined;
            let image: Omit<Image, 'id'> | undefined;

            if (typeof visual === 'string' && visual.trim()) {
                const tikz = isTikzImageSource(visual);

                image = {
                    data: tikz ? visual : null,
                    prompt: explicitPrompt || (tikz ? '' : visual),
                    type: tikz ? 'tikz' : 'prompt',
                    valid
                };
            } else if (explicitPrompt) {
                // A prompt-only visual is still a valid Image and remains eligible
                // for the Images generation stage. Generated data does not exist yet.
                image = { data: null, prompt: explicitPrompt, type: 'prompt', valid };
            } else if (typeof visual === 'number' && Number.isSafeInteger(visual) && visual > 0) {
                const source = await images.get(visual);

                if (source) {
                    row[field] = visual;

                    if (valid !== undefined && source.valid !== valid) {
                        await images.update(visual, { valid });
                    }
                } else {
                    row[field] = null;
                }

                delete row[errorField];
                delete row[promptField];
                continue;
            }

            row[field] = image ? await images.add(image as Image) : null;
            delete row[errorField];
            delete row[promptField];
        }
    }

    return JSON.stringify(value.parsed);
}

async function deleteUnreferencedAbilityImages(candidateIds: number[]): Promise<void> {
    const candidates = new Set(candidateIds);

    if (!candidates.size) {
        return;
    }

    const rows = await db.abilities.toArray();
    const referenced = new Set(rows.flatMap(({ content }) => abilityImageIds(content)));
    const orphanIds = Array.from(candidates).filter((id) => !referenced.has(id));

    if (orphanIds.length) {
        await db.images.bulkDelete(orphanIds);
    }
}

export async function hydrateAbilityContent(content: string): Promise<string> {
    const value = parseAbilityJson(content);

    if (!value) {
        return content;
    }

    const ids = abilityImageIds(content);
    const loaded = ids.length ? await db.images.bulkGet(ids) : [];
    const images = new Map(ids.flatMap((id, index) => loaded[index] ? [[id, loaded[index] as Image] as const] : []));

    for (const exercise of value.root.q) {
        if (!exercise || typeof exercise !== 'object') {
            continue;
        }

        const row = exercise as Record<string, unknown>;

        for (const field of ['p', 'i'] as const) {
            const id = row[field];

            // Persisted Ability visuals are nullable Image foreign keys. The app
            // works with a hydrated compatibility shape where an absent visual is
            // the empty string, so convert null back before runtime validation.
            if (id === null) {
                row[field] = '';
                continue;
            }

            if (typeof id !== 'number') {
                continue;
            }

            const image = images.get(id);
            const errorField = field === 'p' ? 'pError' : 'iError';
            const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';

            row[field] = image?.data ?? '';

            if (image?.prompt) {
                row[promptField] = image.prompt;
            } else {
                delete row[promptField];
            }

            if (image?.valid !== undefined) {
                row[errorField] = !image.valid;
            } else {
                delete row[errorField];
            }
        }
    }

    return JSON.stringify(value.parsed);
}

/** Ensure the question figure has a persisted Image key before generation.
 * Adding a missing visual does not replace the text or other figure. */
export async function ensureAbilityQuestionImage(abilityId: string, exerciseIndex: number, prompt: string): Promise<number> {
    return db.transaction('rw', db.abilities, db.images, async () => {
        const ability = await db.abilities.get(abilityId);
        const parsed = ability && parseAbilityJson(ability.content);
        const exercise = parsed?.root.q[exerciseIndex];

        if (!ability || !parsed || !exercise || typeof exercise !== 'object') {
            throw new Error('Cannot attach a question image to a missing Ability exercise.');
        }

        const row = exercise as Record<string, unknown>;
        const existingId = row.p;

        if (typeof existingId === 'number' && existingId > 0) {
            if (!await db.images.get(existingId)) throw new Error('Question image reference is missing.');
            return existingId;
        }

        const id = await db.images.add({ type: 'prompt', prompt, data: null, valid: undefined } as Image);

        row.p = id;
        await db.abilities.update(abilityId, { content: JSON.stringify(parsed.parsed) });
        return id;
    });
}

/** Create an answer image foreign key only when an exercise needs a visual solution.
 * Unlike replacing the entire Ability, this does not touch its question image. */
export async function ensureAbilityAnswerImage(abilityId: string, exerciseIndex: number, prompt: string): Promise<number> {
    return db.transaction('rw', db.abilities, db.images, async () => {
        const ability = await db.abilities.get(abilityId);
        const parsed = ability && parseAbilityJson(ability.content);
        const exercise = parsed?.root.q[exerciseIndex];

        if (!ability || !parsed || !exercise || typeof exercise !== 'object') {
            throw new Error('Cannot attach an answer image to a missing Ability exercise.');
        }

        const row = exercise as Record<string, unknown>;
        const existingId = row.i;

        if (typeof existingId === 'number' && existingId > 0) {
            if (!await db.images.get(existingId)) throw new Error('Answer image reference is missing.');
            return existingId;
        }

        const id = await db.images.add({ type: 'prompt', prompt, data: null, valid: undefined } as Image);

        row.i = id;
        await db.abilities.update(abilityId, { content: JSON.stringify(parsed.parsed) });
        return id;
    });
}

export async function getImage(id: number): Promise<Image | undefined> {
    return db.images.get(id);
}

export async function getImages(ids: number[]): Promise<Image[]> {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)));
    const values = await db.images.bulkGet(uniqueIds);

    return values.filter((value): value is Image => value !== undefined);
}

/** Per-image QA data is tied to exact TikZ source; changing any source text
 * invalidates its old raster/vision verdict, even when `valid` was true.
 */
function normalizedImageForStorage (image: Image, previous?: Image): Image {
    if (image.type !== 'tikz' || !image.data) {
        return { ...image, sourceVersion: undefined, renderStatus: undefined, visualQaStatus: undefined, detectedIssues: undefined, reviewResult: undefined };
    }

    const version = tikzSourceVersion(image.data);
    const changed = previous?.data !== image.data || previous?.type !== image.type;
    const candidate = { ...image, sourceVersion: version };

    // A new deterministic preview/render failure overrides any old clean QA
    // verdict, even if the TikZ source itself did not change.
    if (!changed && previous?.valid !== false && image.valid === false) {
        return {
            ...candidate,
            renderStatus: 'failed',
            visualQaStatus: 'failed',
            detectedIssues: [...(candidate.detectedIssues ?? []), 'TikZ display/render failed after the last visual review.'],
        };
    }

    // A status is tied to this version. Source edits (including those from
    // other UI paths) must clear old QA metadata. An unchanged source may
    // retain a failed render/review even without a successful model verdict.
    if (changed && candidate.reviewResult?.sourceVersion !== version) {
        return { ...candidate, renderStatus: 'pending', visualQaStatus: 'pending', detectedIssues: [], reviewResult: undefined, valid: previous && image.valid === previous.valid ? undefined : image.valid };
    }

    if (candidate.reviewResult?.sourceVersion !== version) {
        return { ...candidate, renderStatus: candidate.renderStatus ?? 'pending',
            visualQaStatus: candidate.visualQaStatus === 'failed' ? 'failed' : 'pending',
            detectedIssues: candidate.visualQaStatus === 'failed' ? candidate.detectedIssues ?? [] : [],
            reviewResult: undefined };
    }

    if (candidate.visualQaStatus === 'passed' && !isTikzImageQaPassed(candidate)) {
        return { ...candidate, visualQaStatus: 'pending' };
    }

    return candidate;
}

export async function createImage(image: Omit<Image, 'id'>): Promise<number> {
    return db.images.add(normalizedImageForStorage(image as Image));
}

export async function putImage(image: Image, expectedSource?: string | null, options: { preserveDependentAnswerImages?: boolean } = {}): Promise<number> {
    return db.transaction('rw', db.images, db.abilities, db.books, async () => {
        const previous = await db.images.get(image.id);

        if (expectedSource !== undefined && previous?.data !== expectedSource) {
            throw new Error(`Image ${image.id} was edited after visual QA; refusing to store a stale review.`);
        }

        const next = normalizedImageForStorage(image, previous);
        const result = await db.images.put(next);

        // An answer Image edit invalidates only answer-image QA. A question
        // Image edit also invalidates linked answer review. AI regeneration
        // normally discards obsolete generated answers, but a manual edit in
        // the visual editor must never erase an existing answer drawing.
        if (previous?.data !== next.data || (previous !== undefined && isTikzImageQaPassed(previous) && !isTikzImageQaPassed(next))) {
            const linked = await db.abilities.toArray();
            const invalidationByBook = new Map<number, Set<BookProcessingStageKey>>();
            const dependentAnswerIds = new Set<number>();
            const questionSourceChanged = previous?.data !== next.data;

            for (const { content, moduleId } of linked) {
                const match = /^book-(\d+)-(?:concept|exercise|skill)-/.exec(moduleId);
                if (!match) continue;
                const parsed = parseAbilityJson(content);

                if (!parsed) continue;
                const bookId = Number(match[1]);

                for (const exercise of parsed.root.q) {
                    if (!exercise || typeof exercise !== 'object') continue;
                    const row = exercise as Record<string, unknown>;
                    const field = row.p === image.id ? 'p' : row.i === image.id ? 'i' : undefined;

                    if (!field) continue;
                    const stages = invalidationByBook.get(bookId) ?? new Set<BookProcessingStageKey>();

                    if (field === 'p') {
                        stages.add('fixImages');
                        if (questionSourceChanged) {
                            if (!options.preserveDependentAnswerImages) stages.add('answerImages');
                            stages.add('fixAnswerImages');
                            if (typeof row.i === 'number' && row.i !== image.id) dependentAnswerIds.add(row.i);
                        }
                    } else {
                        stages.add('fixAnswerImages');
                    }
                    invalidationByBook.set(bookId, stages);
                }
            }

            // Manual edits preserve the answer SVG/TikZ and its Image id: only
            // its old visual QA result is stale. Automated question generation
            // retains the existing dependency-regeneration behavior.
            for (const answerId of dependentAnswerIds) {
                const answer = await db.images.get(answerId);

                if (answer) {
                    await db.images.put(options.preserveDependentAnswerImages
                        ? { ...answer, valid: undefined, visualQaStatus: 'pending', detectedIssues: [], reviewResult: undefined }
                        : { ...answer, type: 'prompt', data: null, valid: undefined,
                            renderStatus: undefined, visualQaStatus: undefined, detectedIssues: undefined,
                            sourceVersion: undefined, reviewResult: undefined });
                }
            }

            for (const [bookId, stages] of invalidationByBook) {
                const book = await db.books.get(bookId);

                if (book) {
                    const updated = withInvalidatedBookProcessingStages(book, [...stages]);
                    await db.books.update(bookId, { completedStages: updated.completedStages, bypassedStages: updated.bypassedStages });
                }
            }
        }

        return result;
    });
}

export async function setTikzImageQaState (id: number, source: string, state: {
    renderStatus: TikzQaStatus;
    visualQaStatus: TikzQaStatus;
    detectedIssues: string[];
    reviewResult?: TikzReviewResult;
}): Promise<boolean> {
    const current = await db.images.get(id);

    if (!current || current.type !== 'tikz' || current.data !== source) {
        return false;
    }

    // The source comparison is repeated atomically within the write transaction.
    await putImage({ ...current, sourceVersion: tikzSourceVersion(source),
        renderStatus: state.renderStatus, visualQaStatus: state.visualQaStatus,
        detectedIssues: state.detectedIssues, reviewResult: state.reviewResult,
        valid: state.renderStatus === 'passed' }, source);

    return true;
}

export interface BookVisualQaSummary {
    status: 'passed' | 'pending' | 'failed';
    total: number;
    passed: number;
    pending: number;
    failed: number;
    issues: string[];
}

/** A successful SVG alone cannot make a book visually QA-clean. */
export async function getBookVisualQaSummary (bookId: number): Promise<BookVisualQaSummary> {
    const abilities = await db.abilities.toArray();
    const imageIds = [...new Set(abilities
        .filter(({ moduleId }) => moduleId.startsWith(`book-${bookId}-`))
        .flatMap(({ content }) => abilityImageIds(content)))];
    const images = await db.images.bulkGet(imageIds);
    const result: BookVisualQaSummary = { status: 'passed', total: 0, passed: 0, pending: 0, failed: 0, issues: [] };

    for (let index = 0; index < images.length; index++) {
        const image = images[index];

        result.total++;

        if (!image) {
            result.failed++;
            result.issues.push(`Referenced image ${imageIds[index]} is missing.`);
        } else if (image.type !== 'tikz' || !image.data) {
            result.pending++;
        } else if (isTikzImageQaPassed(image)) {
            result.passed++;
        } else if (image.visualQaStatus === 'failed' || image.renderStatus === 'failed') {
            result.failed++;
            result.issues.push(...(image.detectedIssues?.length ? image.detectedIssues : [`Image ${imageIds[index]} failed visual QA.`]));
        } else {
            result.pending++;
        }
    }

    result.status = result.failed ? 'failed' : result.pending ? 'pending' : 'passed';

    return result;
}

export async function deleteImage(id: number): Promise<void> {
    await db.transaction('rw', db.abilities, db.images, async () => {
        const isReferenced = (await db.abilities.toArray()).some(({ content }) => abilityImageIds(content).includes(id));

        if (isReferenced) {
            throw new Error('Cannot delete an Image that is referenced by an Ability.');
        }

        await db.images.delete(id);
    });
}

export async function storeAbility(moduleId: string, content: string, displayOrder?: number): Promise<string> {
    const id = blake2AsHex(content);

    return db.transaction('rw', db.abilities, db.images, db.bookConcepts, db.bookPages, async () => {
        const existing = await db.abilities.get(id);

        if (existing && existing.moduleId !== moduleId) {
            throw new Error('The Ability already belongs to another Concept or module.');
        }

        if (CONCEPT_ABILITY_MODULE.test(moduleId)) {
            const previousIds = await db.abilities.where('moduleId').equals(moduleId).primaryKeys();

            if (previousIds.some((previousId) => previousId !== id)) {
                throw new Error('Only one Ability is allowed per Concept. Edit or regenerate the existing Ability instead.');
            }
        }

        const oldImageIds = existing ? abilityImageIds(existing.content) : [];
        const normalizedContent = await normalizeAbilityImages(content, db.images);
        const displayOrderChanged = existing?.moduleId === moduleId
            && displayOrder !== undefined
            && finiteDisplayOrder(existing.displayOrder) !== finiteDisplayOrder(displayOrder);
        const inheritedDisplayOrder = displayOrderChanged
            ? existing.displayOrder
            : displayOrder ?? (existing?.moduleId === moduleId ? existing.displayOrder : undefined);
        const record: Ability = {
            id,
            moduleId,
            content: normalizedContent,
            reviewed: existing?.moduleId === moduleId && existing.content === normalizedContent ? existing.reviewed ?? false : false,
            ...(inheritedDisplayOrder === undefined ? {} : { displayOrder: inheritedDisplayOrder })
        };

        await db.abilities.put(record);

        const nextImageIds = new Set(abilityImageIds(normalizedContent));
        const staleImageIds = oldImageIds.filter((imageId) => !nextImageIds.has(imageId));

        await deleteUnreferencedAbilityImages(staleImageIds);

        if (displayOrderChanged && displayOrder !== undefined) {
            validateDisplayOrderIndex(displayOrder, 'Ability');
            await moveAbilityToDisplayOrder(id, displayOrder);
        }

        return id;
    });
}

/** Atomically replace an Ability rather than temporarily inserting a second
 * content-addressed row. A failed or stale save must never create a second
 * version. Leave any pre-existing legacy siblings untouched. */
/** Remove one Ability visual and its generation prompt. The Ability replacement
 * unlinks the Image first and deletes the orphaned Image row in the same DB
 * transaction; an Image still used by another Ability is kept intact. */
export async function removeAbilityImage (abilityId: string, exerciseIndex: number, field: 'p' | 'i'): Promise<string> {
    const ability = await getAbility(abilityId);
    const parsed = ability && parseAbilityJson(ability.content);
    const exercise = parsed?.root.q[exerciseIndex];

    if (!ability || !parsed || !exercise || typeof exercise !== 'object') {
        throw new Error('This Ability or exercise no longer exists. Reload and try again.');
    }

    const row = exercise as Record<string, unknown>;
    if (typeof row[field] !== 'number' || !Number.isSafeInteger(row[field]) || (row[field] as number) <= 0) {
        throw new Error('This exercise no longer references an Image. Reload and try again.');
    }

    // Removing the only solution would leave an invalid, unreviewable Ability.
    if (field === 'i' && (typeof row.a !== 'string' || !row.a.trim())) {
        throw new Error('Add a text answer before deleting this exercise’s only solution image.');
    }

    row[field] = null;
    delete row[field === 'p' ? 'pPrompt' : 'iPrompt'];
    delete row[field === 'p' ? 'pError' : 'iError'];

    return replaceAbility(abilityId, JSON.stringify(parsed.parsed));
}

export async function replaceAbility(oldRecordId: string, content: string): Promise<string> {
    return db.transaction('rw', db.abilities, db.images, db.bookConcepts, db.bookPages,
        db.bookAbilityChangeLog, db.bookAbilityWorkQueues, async () => {
        const previous = await db.abilities.get(oldRecordId);
        if (!previous) {
            throw new Error('This Ability has already been changed or deleted. Reload before saving again.');
        }

        const nextId = blake2AsHex(content);
        const existing = await db.abilities.get(nextId);
        if (existing && existing.moduleId !== previous.moduleId) {
            throw new Error('The generated Ability conflicts with an Ability belonging to another Concept.');
        }

        // Normalize image references within the same transaction. If image
        // normalization fails, both the old Ability and its images survive.
        const normalizedContent = await normalizeAbilityImages(content, db.images);
        await db.abilities.put({ ...previous, id: nextId, content: normalizedContent,
            reviewed: normalizedContent === previous.content ? previous.reviewed ?? false : false });

        if (nextId !== oldRecordId) {
            await db.abilities.delete(oldRecordId);
            const concept = CONCEPT_ABILITY_MODULE.exec(previous.moduleId);

            if (concept) {
                const bookId = Number(concept[1]);
                const changes = await db.bookAbilityChangeLog.where('bookId').equals(bookId)
                    .filter(({ recordId }) => recordId === oldRecordId).toArray();
                if (changes.length) {
                    await db.bookAbilityChangeLog.bulkPut(changes.map((entry) => ({ ...entry, recordId: nextId })));
                }

                const queue = await db.bookAbilityWorkQueues.get(bookId);
                if (queue?.items.some((item) => item.kind === 'fix' && item.recordId === oldRecordId)) {
                    await db.bookAbilityWorkQueues.put({ ...queue, items: queue.items.map((item) =>
                        item.kind === 'fix' && item.recordId === oldRecordId
                            ? { ...item, recordId: nextId }
                            : item) });
                }
            }
        }

        await deleteUnreferencedAbilityImages(abilityImageIds(previous.content));
        return nextId;
    });
}

export async function updateAbilityDisplayOrder(id: string, displayOrder: number): Promise<Ability | undefined> {
    validateDisplayOrderIndex(displayOrder, 'Ability');

    return db.transaction('rw', db.abilities, db.bookConcepts, db.bookPages, async () => moveAbilityToDisplayOrder(id, displayOrder));
}

/** Fetch one current Ability by its stored record ID. */
export async function getAbility(id: string): Promise<Ability | undefined> {
    return db.abilities.get(id);
}

export async function getAbilities(moduleId: string): Promise<Ability[]> {
    const rows = await db.abilities.where('moduleId').equals(moduleId).toArray();

    return rows.sort((a, b) => {
        const aOrder = finiteDisplayOrder(a.displayOrder);
        const bOrder = finiteDisplayOrder(b.displayOrder);

        if (aOrder !== undefined || bOrder !== undefined) {
            if (aOrder === undefined) return 1;
            if (bOrder === undefined) return -1;
            if (aOrder !== bOrder) return aOrder - bOrder;
        }

        return a.id.localeCompare(b.id);
    });
}

export async function deleteAbilities(moduleId: string): Promise<void> {
    await db.transaction('rw', db.abilities, db.images, db.bookConcepts, db.bookPages, async () => {
        const rows = await db.abilities.where('moduleId').equals(moduleId).toArray() as Ability[];
        const imageIds: number[] = Array.from(new Set<number>(rows.flatMap(({ content }) => abilityImageIds(content))));

        await db.abilities.where('moduleId').equals(moduleId).delete();

        await deleteUnreferencedAbilityImages(imageIds);
    });
}

export async function replaceAbilities(moduleId: string, contents: string[]): Promise<string[]> {
    // A book Concept has exactly one generated Ability (or none). Do not
    // silently discard additional results: reject invalid writes atomically.
    if (CONCEPT_ABILITY_MODULE.test(moduleId) && contents.length > 1) {
        throw new Error('Only one Ability can be generated per Concept.');
    }

    return db.transaction('rw', db.abilities, db.images, db.bookConcepts, db.bookPages, async () => {
        const oldRows = await db.abilities.where('moduleId').equals(moduleId).toArray() as Ability[];
        const oldImageIds: number[] = Array.from(new Set<number>(oldRows.flatMap(({ content }) => abilityImageIds(content))));
        const records: Ability[] = [];

        for (let index = 0; index < contents.length; index++) {
            const content = contents[index];
            const normalizedContent = await normalizeAbilityImages(content, db.images);

            records.push({
                content: normalizedContent,
                displayOrder: index,
                id: blake2AsHex(`${moduleId}:${index}:${content}`),
                moduleId
            });
        }

        await db.abilities.where('moduleId').equals(moduleId).delete();

        if (records.length) {
            await db.abilities.bulkPut(records);
        }

        const nextImageIds = new Set<number>(records.flatMap(({ content }) => abilityImageIds(content)));
        const staleImageIds = oldImageIds.filter((imageId) => !nextImageIds.has(imageId));

        await deleteUnreferencedAbilityImages(staleImageIds);

        const stored = await db.abilities.bulkGet(records.map(({ id }) => id));

        return stored.flatMap((record) => record ? [record.id] : []);
    });
}

export async function deleteAbility(id: string): Promise<void> {
    await db.transaction('rw', db.abilities, db.images, db.bookConcepts, db.bookPages, async () => {
        const row = await db.abilities.get(id);

        await db.abilities.delete(id);

        const imageIds = row ? abilityImageIds(row.content) : [];

        await deleteUnreferencedAbilityImages(imageIds);

    });
}

// Signer related

export async function setLastUsedLetterNumber(publicKey: string, lastUsed: number) {
    await db.signers.update(publicKey, { lastLetterNumber: lastUsed });
}

export async function getLastUnusedLetterNumber(publicKey: string) {
    const sameSigner = await db.signers.get({ publicKey: publicKey });
    if (sameSigner === undefined) {
        const initialLetterNumber = 0;
        const signer = {
            publicKey: publicKey,
            lastLetterNumber: initialLetterNumber
        }
        await db.signers.add(signer);
        return initialLetterNumber;
    }
    return 1 + sameSigner.lastLetterNumber;
}

// Pseudonym related

function isValidPublicKey(publicKey: string) {
    try {
        if (!isHex(publicKey)) {
            return false;
        }
        const decoded = decodeAddress(publicKey);
        const encoded = encodeAddress(decoded);
        return u8aToHex(decoded) === publicKey || encoded === publicKey;
    } catch (error) {
        return false;
    }
}

export async function storePseudonym(publicKey: string, pseudonym: string) {
    if (isValidPublicKey(publicKey)) {
        const cleanPseudonym = DOMPurify.sanitize(pseudonym);
        const samePseudonym = await db.pseudonyms.get({ publicKey: publicKey });
        if (samePseudonym === undefined) {
            const newPseudonym: Pseudonym = { publicKey: publicKey, pseudonym: cleanPseudonym, altPseudonym: "" };
            await db.pseudonyms.put(newPseudonym);
        } else if (samePseudonym.pseudonym !== cleanPseudonym) {
            await db.pseudonyms.update(publicKey, { pseudonym: cleanPseudonym, altPseudonym: samePseudonym.pseudonym });
        }
    }
}

export async function getPseudonym(publicKey: string): Promise<string | undefined> {
    try {
        const name = await db.pseudonyms.get(publicKey);
        if (name && typeof name.pseudonym === 'string') {
            const pseudonym = name.pseudonym;
            return DOMPurify.sanitize(pseudonym);
        }
    } catch (error) {
        console.error('Error fetching pseudonym:', error);
    }
    return undefined;
};

export async function getAllPseudonyms() {
    return await db.pseudonyms.toArray();
}

// CanceledLetter related

export async function putCanceledLetter(canceledLetter: CanceledLetter) {
    await db.canceledLetters.put(canceledLetter);
}

// Repetitions related

export async function putRepetition(repetition: Repetition) {
    await db.repetitions.put(repetition);
}

export async function deleteRepetition(workerId: string, knowledgeId: string) {
    await db.repetitions.delete([workerId, knowledgeId]);
}

export async function getRepetitionsForKnowledgeId(workerId: string, knowledgeId: string): Promise<Repetition[]> {
    return await db.repetitions
        .where('[workerId+knowledgeId]')
        .equals([workerId, knowledgeId])
        .toArray();
}

// Letter related

export async function putLetter(letter: Letter) {
    await db.letters.put(letter);
}

export async function deleteLetter(pubSign: string) {
    await db.letters.delete(pubSign);
}

export async function getLetter(pubSign: string) {
    return await db.letters.get(pubSign);
}

export async function getAllLetters() {
    return await db.letters.toArray();
}

export async function getLetters(worker: string, startDate: number | null, endDate: number | null) {
    let query = db.letters.where('workerId').equals(worker);
    if (startDate || endDate) {
        query = query.filter((letter: Letter) => {
            if (startDate && letter.created < startDate) return false;
            if (endDate && letter.created > endDate) return false;
            return true;
        });
    }
    return await query.reverse().sortBy('created');
}

// get 4 letters from 2 different referees
export async function getLettersToReexamine(): Promise<Letter[]> {
    const results: Letter[] = [];
    const refereeCounts = new Map<string | null | undefined, number>();

    const canTake = (l: Letter): boolean => {
        const key = l.referee;
        const used = refereeCounts.get(key) ?? 0;
        return used < 2;
    };

    const take = (l: Letter): void => {
        results.push(l);
        const key = l.referee;
        refereeCounts.set(key, (refereeCounts.get(key) ?? 0) + 1);
    };

    const findNext = async (
        predicate: (letter: Letter) => boolean
    ): Promise<Letter | undefined> => {
        for (let examCount = 1; examCount <= 3; examCount++) {
            const letter = await db.letters
                .orderBy('created')
                .filter(
                    (l) =>
                        l.examCount === examCount &&
                        l.knowledgeId !== EXAMPLE_SKILL_KNOWLEDGE_ID &&
                        !results.some((r) => r.cid === l.cid) && // prevent duplicates
                        predicate(l) &&
                        canTake(l)
                )
                .first();

            if (letter) return letter;
        }
        return undefined;
    };

    while (results.length < 4) {
        const next = await findNext(() => true);
        if (!next) break;
        take(next);
    }

    return results;
}

export async function getLettersForKnowledgeId(workerId: string, knowledgeId: string): Promise<Letter[]> {
    return await db.letters
        .where('[workerId+knowledgeId]')
        .equals([workerId, knowledgeId])
        .toArray();
}

export async function getLettersByWorkerId(workerId: string) {
    return await db.letters.where({ workerId: workerId }).toArray();
};

export async function updateLetterReexaminingCount(pubSign: string, time: number) {
    const letter = await db.letters.get(pubSign);
    if (letter) {
        const newExamCount = letter.examCount + 1;
        return await db.letters.update(pubSign, { examCount: newExamCount, lastExamined: time });
    }
    return undefined;
}

export async function cancelLetter(pubSign: string, time: number) {
    const letter: Letter | undefined = await getLetter(pubSign);
    if (letter) {
        const canceledLetter: CanceledLetter = {
            pubSign: letter.pubSign,
            created: letter.created,
            examCount: letter.examCount,
            canceled: time,
            workerId: letter.workerId,
            knowledgeId: letter.knowledgeId,
            cid: letter.cid,
            referee: letter.referee,
        };
        await putCanceledLetter(canceledLetter);
        await deleteLetter(letter.pubSign);
    }
}

export async function cancelLetterByRefereeAndLetterNumber(referee: string, letterId: number, time: number) {
    const letters = await db.letters
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
    letters.forEach(async (letter) => {
        const canceledLetter: CanceledLetter = {
            pubSign: letter.pubSign,
            created: letter.created,
            examCount: letter.examCount,
            canceled: time,
            workerId: letter.workerId,
            knowledgeId: letter.knowledgeId,
            cid: letter.cid,
            referee: letter.referee,
        };

        await Promise.all([
            putCanceledLetter(canceledLetter),
            deleteLetter(letter.pubSign),
        ]);
    });
};

export async function createAndStoreLetter(data: string[]) {
    const [textHash,
        workerId,
        genesisHex,
        letterIdStr,
        blockNumber,
        refereePublicKeyHex,
        workerPublicKeyHex,
        amount,
        refereeSignOverPrivateData,
        refereeSignOverReceipt,
        knowledgeId] = data;

    const now = (new Date()).getTime();
    const letter: Letter = {
        created: now,
        examCount: 1,
        lastExamined: now,
        workerId: workerId,
        knowledgeId: knowledgeId,
        cid: textHash,
        genesis: genesisHex,
        letterId: parseInt(letterIdStr, 10),
        block: blockNumber,
        referee: refereePublicKeyHex,
        worker: workerPublicKeyHex,
        amount: amount,
        privSign: refereeSignOverPrivateData,
        pubSign: refereeSignOverReceipt
    };
    await putLetter(letter);
}

export function deserializeLetter(data: string, workerId: string, genesis: string, amount: string): Letter {
    const [
        created,
        knowledgeId,
        cid,
        letterId,
        block,
        referee,
        worker,
        privSign,
        pubSign,
    ] = data.split(',');
    const timeStamp = parseInt(created, 10);
    const result: Letter = {
        created: timeStamp,
        examCount: 1,
        lastExamined: timeStamp,
        workerId,
        knowledgeId,
        cid,
        genesis,
        letterId: parseInt(letterId, 10),
        block,
        referee,
        worker,
        amount,
        privSign,
        pubSign
    };
    return result;
}

// Reexamination related
export function putReexamination(reexamination: Reexamination) {
    return db.reexams.put(reexamination);
}

export function getReexaminationsByLessonId(lessonId: string) {
    return db.reexams.where({ lesson: lessonId }).sortBy('stage');
}

export async function isThereAnyLessonResult(lessonId: string) {
    const lesson = await getLesson(lessonId);
    if (lesson) {
        const letterTemplates: LetterTemplate[] = await getValidLetterTemplatesByLessonId(lesson.id);
        const repetitions = await getToRepeatLetterTemplatesByLessonId(lesson.id);
        const reexaminations = await getReexaminationsByLessonId(lesson.id);
        const performedReexaminations = reexaminations.filter((r) => r.created !== r.lastExamined);
        return (letterTemplates.length > 0 || performedReexaminations.length > 0 || repetitions.length > 0);
    }
    return false;
}

export function updateReexamination(reexamination: Reexamination) {
    return db.reexams.update([reexamination.pubSign, reexamination.lesson], reexamination);
}

// LetterTemplate related

export function markLetterTemplatePenalized(letterId: number, timeStamp: number) {
    return db.letterTemplates
        .where('letterId')
        .equals(letterId)
        .modify({
            penalizedTime: timeStamp,
        });
}

export async function putLetterTemplate(letterTemplate: LetterTemplate) {
    await db.letterTemplates.put(letterTemplate);
}

export async function getLetterTemplate(lesson: string, stage: number) {
    return await db.letterTemplates.get({ lesson: lesson, stage: stage });
}

export async function getLetterTemplatesByLessonId(lessonId: string) {
    return await db.letterTemplates.where({ lesson: lessonId }).sortBy('stage');
}

export async function getValidLetterTemplatesByLessonId(lessonId: string): Promise<LetterTemplate[]> {
    return await db.letterTemplates.where({ lesson: lessonId }).filter(letter => letter.valid && !letter.toRepeat).toArray();
}

export async function getIssuedNonPenalizedLetterTemplateIds(): Promise<number[]> {
    const templates = await db.letterTemplates
        .filter(l => l.pubSign.length > 0 && l.penalizedTime === undefined)
        .toArray();

    return templates.map(l => l.letterId);
}

export async function getPenalties(startDate?: number, endDate?: number) {
    let q = db.letterTemplates.where('penalizedTime').above(0); // only rows with a numeric timestamp

    if (startDate !== undefined && endDate !== undefined) {
        q = db.letterTemplates
            .where('penalizedTime')
            .between(startDate, endDate, true, true);
    } else if (startDate !== undefined) {
        q = db.letterTemplates.where('penalizedTime').aboveOrEqual(startDate);
    } else if (endDate !== undefined) {
        q = db.letterTemplates.where('penalizedTime').belowOrEqual(endDate);
    }

    // newest first
    const penalties = await q.reverse().toArray();

    const lessons = await db.lessons.bulkGet(penalties.map(p => p.lesson));
    const lessonMap = new Map(penalties.map((p, i) => [p.lesson, lessons[i]]));

    return penalties.map(p => ({ ...p, student: lessonMap.get(p.lesson)?.student }));
}


export async function getToRepeatLetterTemplatesByLessonId(lessonId: string): Promise<LetterTemplate[]> {
    return await db.letterTemplates.where({ lesson: lessonId }).filter(letter => letter.toRepeat).toArray();
}

export function serializeAsLetter(letterTemplate: LetterTemplate, referee: string): string {
    return [
        letterTemplate.lastExamined,
        letterTemplate.knowledgeId,
        letterTemplate.cid,
        letterTemplate.letterId.toString(),
        letterTemplate.block,
        referee,
        letterTemplate.worker,
        letterTemplate.privSign,
        letterTemplate.pubSign
    ].join(",");
}



// Lesson related

export async function deleteLesson(id: string) {
    const letterTemplates = await getLetterTemplatesByLessonId(id);
    await Promise.all(
        letterTemplates.map(t => db.letterTemplates.delete([t.cid, t.lesson]))
    );
    const reexaminations = await getReexaminationsByLessonId(id);
    await Promise.all(
        reexaminations.map(r => db.reexams.delete([r.pubSign, r.lesson]))
    );
    await db.lessons.delete(id);
}

export async function getLastNonSentLesson(starting: number) {
    return db.lessons
        .where('deadline')
        .below(starting)
        .reverse()
        .first();
}

export function getLessonId(studentPublicKeyHex: string, ids: any[]): string {
    const date = new Date().toISOString().split('T')[0]; // Get the current date in YYYY-MM-DD format
    const dataToHash = `${date}-${studentPublicKeyHex}-${ids.join('-')}`;
    const hash = blake2AsHex(dataToHash);
    return hash;
};

export async function getLesson(id: string) {
    return await db.lessons.get(id);
}

export async function getLessons(tutor: string, startDate: number | null, endDate: number | null) {
    let query = db.lessons.where('tutor').equals(tutor);
    if (startDate || endDate) {
        query = query.filter((lesson) => {
            if (startDate && lesson.created < startDate) return false;
            if (endDate && lesson.created > endDate) return false;
            return true;
        });
    }
    return await query.reverse().sortBy('created');
}
export async function updateAllLessons(newDPrice: string, newDWarranty: string, newDValidity: number) {
    try {
        await db.transaction('rw', db.lessons, async () => {
            const lessons = await db.lessons.toArray();

            const updates = lessons.map(lesson => ({
                ...lesson,
                dPrice: newDPrice,
                dWarranty: newDWarranty,
                dValidity: newDValidity
            }));

            await db.lessons.bulkPut(updates);
        });
    } catch (error) {
        console.error('Error updating lessons:', error);
    }
}

export async function storeLesson(lessonRequest: LessonRequest, tutor: string, onResult: () => Promise<void>) {
    let toReexamine: string[][] = lessonRequest.reexamine;

    if (lessonRequest.learn.length > 0 && lessonRequest.reexamine.length >= 1) {
        const nonMatching = lessonRequest.reexamine.filter((x) => x?.[3] !== tutor);
        const matching = lessonRequest.reexamine.filter((x) => x?.[3] === tutor);

        toReexamine = [...nonMatching, ...matching].slice(0, Math.min(2, lessonRequest.reexamine.length));
    }

    const now = (new Date()).getTime();
    const stored_warranty = await getSetting(SettingKey.DIPLOMA_WARRANTY);
    const stored_validity = await getSetting(SettingKey.DIPLOMA_VALIDITY);
    const stored_diploma_price = await getSetting(SettingKey.DIPLOMA_PRICE);
    const warranty = stored_warranty ? stored_warranty : DEFAULT_WARRANTY;
    const validity: number = stored_validity ? parseInt(stored_validity, 10) : DEFAULT_DIPLOMA_VALIDITY;
    const diploma_price = stored_diploma_price ? stored_diploma_price : DEFAULT_DIPLOMA_PRICE;
    const lesson: Lesson = {
        id: lessonRequest.lesson,
        created: now,
        cid: lessonRequest.cid,
        tutor: tutor,
        student: lessonRequest.identity,
        toLearnCount: lessonRequest.learn.length,
        learnStep: 0,
        toReexamineCount: toReexamine.length,
        reexamineStep: 0,
        dPrice: diploma_price,
        dWarranty: warranty,
        dValidity: validity,
        isPaid: false,
        lastAction: undefined,
    };
    const sameLesson = await db.lessons.get({ id: lesson.id });
    if(sameLesson && sameLesson.cid === EXAMPLE_MODULE_KNOWLEDGE_CID){
        await deleteLesson(lesson.id);
    }
    if (sameLesson === undefined || sameLesson.cid === EXAMPLE_MODULE_KNOWLEDGE_CID) {
        await db.lessons.add(lesson);
        let studyStage = 0;
        await Promise.all(lessonRequest.learn.map(async (item: string[]) => {
            const letterTemplate: LetterTemplate = {
                stage: studyStage++,
                valid: false,
                mature: item[3] === '1',
                toRepeat: false,
                penalizedTime: undefined,
                lastExamined: now,
                lesson: lesson.id,
                knowledgeId: item[0],
                cid: item[1],
                genesis: '',
                letterId: -1,
                block: '',
                worker: item[2],
                amount: '',
                privSign: '',
                pubSign: '',
            };
            return await putLetterTemplate(letterTemplate);
        }));
        let reexaminationStage = 0;
        await Promise.all(toReexamine.map(async (item: string[]) => {
            const reexamination: Reexamination = {
                created: now,
                stage: reexaminationStage++,
                lastExamined: now,
                valid: true,
                lesson: lesson.id,
                cid: item[0],
                amount: item[1],
                pubSign: item[2],
            };
            return await putReexamination(reexamination);
        }));
    }
    await storeSetting(SettingKey.LESSON, lessonRequest.lesson);
    await onResult();
}

export async function putLesson(lesson: Lesson): Promise<string> {
    return await db.lessons.put(lesson);
}

// Agreement related

export async function getAgreement(id: string) {
    return await db.agreements.get(id);
}

export async function putAgreement(agreement: Agreement) {
    await db.agreements.put(agreement);
}

// CIDCache related

export async function getCIDCache(cid: string) {
    return await db.cidCache.get(cid);
}

async function evictEntries(requiredSize: number) {
    let freedSpace = 0;
    const entries = await db.cidCache
        .orderBy('time')
        .until(() => freedSpace >= requiredSize)
        .toArray();
    const deletePromises = entries.map(async ({ cid, size }) => {
        await db.cidCache.delete(cid);
        freedSpace += size || 0;
    });
    await Promise.all(deletePromises);
    return freedSpace;
};

let cacheLock = Promise.resolve();
async function runLocked(fn: () => Promise<void>) {
    const unlock = cacheLock.then(() => fn());
    cacheLock = unlock.catch(() => { });
    return unlock;
};

export async function putCIDCache(cid: string, data: string) {
    const size = new Blob([data]).size + new Blob([cid]).size;
    await runLocked(async () => {
        const cidCacheSizeString = await getSetting(SettingKey.CID_CACHE_SIZE);
        let totalCacheSize = cidCacheSizeString ? parseInt(cidCacheSizeString, 10) : 0;
        if (totalCacheSize + size > MAX_CACHE_SIZE) {
            const spaceNeeded = totalCacheSize + size - MAX_CACHE_SIZE;
            const freedSpace = await evictEntries(spaceNeeded);
            totalCacheSize -= freedSpace;
        }
        await db.cidCache.put({ cid, data, size, time: Date.now() });
        totalCacheSize += size;
        await storeSetting(SettingKey.CID_CACHE_SIZE, totalCacheSize.toString());
    });
};

// CanceledInsurance related

export async function putCanceledInsurance(canceledInsurance: CanceledInsurance) {
    await db.canceledInsurances.put(canceledInsurance);
}

// Insurance related

export async function putInsurance(insurance: Insurance) {
    await db.insurances.put(insurance);
}

export async function getInsurance(workerSign: string) {
    return await db.insurances.get(workerSign);
}

export async function getAllInsurances() {
    return await db.insurances.toArray();
}

export async function getInsurances(employer: string, worker: string, startDate: number | null, endDate: number | null) {
    let query = db.insurances.where('[employer+workerId]').equals([employer, worker]);
    query = query.filter((insurance: Insurance) => {
        if (startDate && insurance.created < startDate) return false;
        if (endDate && insurance.created > endDate) return false;
        return true;
    });
    return await query.reverse().sortBy('created');
}

export async function getInsurancesByRefereeAndLetterNumber(referee: string, letterId: number) {
    return await db.insurances
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
}

export async function deleteInsurance(workerSign: string) {
    await db.insurances.delete(workerSign);
}

export async function updateInsurance(insurance: Insurance) {
    await db.insurances.update(insurance.workerSign, insurance);
}

export async function cancelInsuranceByRefereeAndLetterNumber(referee: string, letterId: number, time: number) {
    const insurances = await db.insurances
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
    insurances.forEach(async (insurance) => {
        const canceledInsurance: CanceledInsurance = {
            workerSign: insurance.workerSign,
            created: insurance.created,
            canceled: time,
            workerId: insurance.workerId,
            knowledgeId: insurance.knowledgeId,
            cid: insurance.cid,
            referee: insurance.referee,
            employer: insurance.employer,
        };
        await Promise.all([
            await putCanceledInsurance(canceledInsurance),
            await deleteInsurance(insurance.workerSign),
        ]);
    });
};

export async function cancelInsurance(workerSign: string, time: number) {
    const insurance: Insurance | undefined = await getInsurance(workerSign);
    if (insurance) {
        const canceledInsurance: CanceledInsurance = {
            workerSign: insurance.workerSign,
            created: insurance.created,
            canceled: time,
            workerId: insurance.workerId,
            knowledgeId: insurance.knowledgeId,
            cid: insurance.cid,
            referee: insurance.referee,
            employer: insurance.employer,
        };
        await putCanceledInsurance(canceledInsurance);
        await deleteInsurance(insurance.workerSign);
    }
}

export async function storeInsurances(insurancesTransfer: InsurancesTransfer) {
    const now = (new Date()).getTime();
    if (Array.isArray(insurancesTransfer.insurances) && insurancesTransfer.insurances.length > 0) {
        for (let i = insurancesTransfer.insurances.length - 1; i >= 0; i--) {
            const insuranceDataString = insurancesTransfer.insurances[i];
            const insuranceDataArray = insuranceDataString.split(",");
            insuranceDataArray.unshift(insurancesTransfer.identity, insurancesTransfer.employer);
            await createAndStoreInsurance(insuranceDataArray, now);
        }
    } else {
        console.error("Invalid or empty insurances data.");
    }
};

async function createAndStoreInsurance(data: string[], timeStamp: number) {
    const [
        workerId,
        employerPublicKeyHex,
        worker,
        knowledgeId,
        cid,
        genesisHex,
        letterIdStr,
        blockNumber,
        blockAllowed,
        refereePublicKeyHex,
        amountValue,
        refereeSignOverPrivateData,
        refereeSignOverReceipt,
        workerSignOverInsurance] = data;

    const letterId = parseInt(letterIdStr, 10);
    const sameInsurances = await getInsurancesByRefereeAndLetterNumber(refereePublicKeyHex, letterId);
    if (sameInsurances.length === 0) {
        const insurance: Insurance = {
            created: timeStamp,
            valid: true,
            lesson: '',
            workerId: workerId,
            knowledgeId: knowledgeId,
            cid: cid,
            genesis: genesisHex,
            letterId: letterId,
            block: blockNumber,
            blockAllowed: blockAllowed,
            referee: refereePublicKeyHex,
            worker: worker,
            amount: amountValue,
            privSign: refereeSignOverPrivateData,
            pubSign: refereeSignOverReceipt,
            employer: employerPublicKeyHex,
            workerSign: workerSignOverInsurance,
        };
        await putInsurance(insurance);
    }
}

export function serializeInsurance(insurance: Insurance): string {
    return [
        insurance.worker,
        insurance.knowledgeId,
        insurance.cid,
        insurance.genesis,
        insurance.letterId,
        insurance.block,
        insurance.blockAllowed,
        insurance.referee,
        insurance.amount,
        insurance.privSign,
        insurance.pubSign,
        insurance.workerSign,
    ].join(",");
}

export function letterToInsurance(letter: Letter, employer: string, workerSign: string, blockAllowed: string, timeStamp: number): Insurance {
    const insurance: Insurance = {
        created: timeStamp,
        valid: true,
        lesson: '',
        workerId: letter.workerId,
        knowledgeId: letter.knowledgeId,
        cid: letter.cid,
        genesis: letter.genesis,
        letterId: letter.letterId,
        block: letter.block,
        blockAllowed: blockAllowed,
        referee: letter.referee,
        worker: letter.worker,
        amount: letter.amount,
        privSign: letter.privSign,
        pubSign: letter.pubSign,
        employer: employer,
        workerSign: workerSign,
    }
    return insurance;
}

// Reimbursement related

export async function addReimbursement(reimbursement: Reimbursement) {
    await db.reimbursements.add(reimbursement);
}

export async function getAllReimbursements() {
    return await db.reimbursements.toArray();
}

export async function getReimbursementsByReferee(referee: string) {
    return await db.reimbursements.where({ referee: referee }).toArray();
}

export async function getReimbursementsByRefereeAndLetterNumber(referee: string, letterId: number) {
    return await db.reimbursements
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
}

export async function deleteReimbursement(referee: string, letterId: number) {
    await db.reimbursements
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .delete();
}

export function letterToReimbursement(letter: Letter, employer: string, workerSign: string, blockAllowed?: string): Reimbursement {
    const reimbursement: Reimbursement = {
        genesis: letter.genesis,
        letterId: letter.letterId,
        block: letter.block,
        blockAllowed: blockAllowed ? blockAllowed : letter.block,
        referee: letter.referee,
        worker: letter.worker,
        amount: letter.amount,
        pubSign: letter.pubSign,
        employer: employer,
        workerSign: workerSign,
    }
    return reimbursement;
}

export function insuranceToReimbursement(insurance: Insurance): Reimbursement {
    const reimbursement: Reimbursement = {
        genesis: insurance.genesis,
        letterId: insurance.letterId,
        block: insurance.block,
        blockAllowed: insurance.blockAllowed,
        referee: insurance.referee,
        worker: insurance.worker,
        amount: insurance.amount,
        pubSign: insurance.pubSign,
        employer: insurance.employer,
        workerSign: insurance.workerSign,
    }
    return reimbursement;
}

// UsageRight related

export async function putUsageRight(usageRight: UsageRight) {
    await db.usageRights.put(usageRight);
}

export async function markUsageRightAsUsed(referee: string, letterId: number) {
    const usageRights = await db.usageRights
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .toArray();
    usageRights.forEach(async (usageRight) => {
        await putUsageRight({ ...usageRight, used: true });
    });
};

export async function deleteUsageRight(referee: string, letterId: number) {
    await db.usageRights
        .where('[referee+letterId]')
        .equals([referee, letterId])
        .delete();
}

export function insuranceToUsageRight(insurance: Insurance): UsageRight {
    const usageRight: UsageRight = {
        used: false,
        created: insurance.created,
        pubSign: insurance.pubSign,
        employer: insurance.employer,
        workerSign: insurance.workerSign,
        referee: insurance.referee,
        letterId: insurance.letterId,
    };
    return usageRight;
}

// AI tutor resume state

function aiTutorStudentMessageKey(lessonId: string, lessonStep: number): string {
    return `${lessonId}:${lessonStep}`;
}

async function updateAiTutorStudentMessageRecord(
    lessonId: string,
    lessonStep: number,
    update: (record: AiTutorStudentMessage) => AiTutorStudentMessage
): Promise<void> {
    const key = aiTutorStudentMessageKey(lessonId, lessonStep);

    await db.transaction('rw', db.aiTutorStudentMessages, async () => {
        const existing = await db.aiTutorStudentMessages.get(key) ?? {
            key,
            lessonId,
            lessonStep,
            studentExerciseMedia: []
        };

        await db.aiTutorStudentMessages.put(update(existing));
    });
}

export async function getAiTutorStudentMessage<TMessage, TMedia, TVisualDraft = unknown, TTutorStageMessage = unknown>(lessonId: string, lessonStep: number): Promise<AiTutorStudentMessage<TMessage, TMedia, TVisualDraft, TTutorStageMessage> | undefined> {
    return await db.aiTutorStudentMessages.get(aiTutorStudentMessageKey(lessonId, lessonStep)) as AiTutorStudentMessage<TMessage, TMedia, TVisualDraft, TTutorStageMessage> | undefined;
}

export async function putAiTutorStudentMessage<TMessage, TMedia>(lessonId: string, lessonStep: number, message: TMessage, studentExerciseMedia: TMedia[]): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => {
        const next = {
            ...record,
            message,
            studentExerciseMedia
        } as AiTutorStudentMessage<TMessage, TMedia>;

        // A submitted message supersedes the unsent visual draft. Generated tutor
        // stage text is intentionally preserved until the exercise/stage changes.
        delete next.visualDraft;

        return next;
    });
}

export async function putAiTutorVisualDraft<TVisualDraft>(lessonId: string, lessonStep: number, visualDraft: TVisualDraft | undefined): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => {
        const next = { ...record } as AiTutorStudentMessage<unknown, unknown, TVisualDraft>;

        if (visualDraft === undefined) {
            delete next.visualDraft;
        } else {
            next.visualDraft = visualDraft;
        }

        return next;
    });
}

export async function putAiTutorStudentExercise(lessonId: string, lessonStep: number, studentExercise: string | undefined): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => {
        const next = { ...record };

        if (studentExercise) {
            next.studentExercise = studentExercise;
        } else {
            delete next.studentExercise;
        }

        return next;
    });
}

export async function putAiTutorCurrentStageType(lessonId: string, lessonStep: number, stageType: string | undefined): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => {
        const next = { ...record };

        if (stageType) {
            next.currentTutorStageType = stageType;
        } else {
            delete next.currentTutorStageType;
        }

        return next;
    });
}

export async function putAiTutorWrongAnswerReasoning(lessonId: string, lessonStep: number, reasoning: AiTutorStudentMessage['wrongAnswerReasoning'] | undefined): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => {
        const next = { ...record };

        if (reasoning) {
            next.wrongAnswerReasoning = reasoning;
        } else {
            delete next.wrongAnswerReasoning;
        }

        return next;
    });
}

export async function getAiTutorTutorStageMessage<TTutorStageMessage>(lessonId: string, lessonStep: number, stageType: string): Promise<TTutorStageMessage | undefined> {
    const record = await db.aiTutorStudentMessages.get(aiTutorStudentMessageKey(lessonId, lessonStep));

    return record?.tutorStageMessages?.[stageType] as TTutorStageMessage | undefined;
}

export async function putAiTutorTutorStageMessage<TTutorStageMessage>(lessonId: string, lessonStep: number, stageType: string, message: TTutorStageMessage): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => ({
        ...record,
        tutorStageMessages: {
            ...(record.tutorStageMessages ?? {}),
            [stageType]: message
        }
    }));
}

export async function clearAiTutorTutorStageMessages(lessonId: string, lessonStep: number, stageTypes?: string[]): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => {
        const next = { ...record };

        if (!stageTypes?.length) {
            delete next.tutorStageMessages;
            return next;
        }

        const tutorStageMessages = { ...(record.tutorStageMessages ?? {}) };
        stageTypes.forEach((stageType) => delete tutorStageMessages[stageType]);

        if (Object.keys(tutorStageMessages).length) {
            next.tutorStageMessages = tutorStageMessages;
        } else {
            delete next.tutorStageMessages;
        }

        return next;
    });
}

export async function getAiTutorGeneratedStageText(lessonId: string, lessonStep: number, stageType: string): Promise<string | undefined> {
    const record = await db.aiTutorStudentMessages.get(aiTutorStudentMessageKey(lessonId, lessonStep));

    return record?.generatedStageText?.[stageType];
}

export async function putAiTutorGeneratedStageText(lessonId: string, lessonStep: number, stageType: string, text: string): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => ({
        ...record,
        generatedStageText: {
            ...(record.generatedStageText ?? {}),
            [stageType]: text
        }
    }));
}

export async function clearAiTutorGeneratedStageTexts(lessonId: string, lessonStep: number, stageTypes?: string[]): Promise<void> {
    await updateAiTutorStudentMessageRecord(lessonId, lessonStep, (record) => {
        const next = { ...record };

        if (!stageTypes?.length) {
            delete next.generatedStageText;
            return next;
        }

        const generatedStageText = { ...(record.generatedStageText ?? {}) };
        stageTypes.forEach((stageType) => delete generatedStageText[stageType]);

        if (Object.keys(generatedStageText).length) {
            next.generatedStageText = generatedStageText;
        } else {
            delete next.generatedStageText;
        }

        return next;
    });
}

export async function deleteAiTutorStudentMessage(lessonId: string, lessonStep: number): Promise<void> {
    await db.aiTutorStudentMessages.delete(aiTutorStudentMessageKey(lessonId, lessonStep));
}

export async function clearAiTutorStudentMessages(lessonId: string): Promise<void> {
    await db.aiTutorStudentMessages.where('lessonId').equals(lessonId).delete();
}

// The active backup export uses readBackupRows() (primary-key cursor chunks).
// Whole-database JSON Blob export was removed to avoid unbounded allocations.

export interface DexieTableData {
    tableName: string;
    inbound: boolean;
    rows: any;
}
export interface DexieTableInfo {
    name: string;
    schema: string;
    rowCount: number;
}

export interface DBExportFormat {
    databaseName: string;
    databaseVersion: number;
    tables: DexieTableInfo[];
    data: DexieTableData[]
}
export interface DexieExportFormat {
    formatName: string;
    formatVersion: string[][];
    data: DBExportFormat;
}

/** Legacy JSON callers now use the SAME staging + all-or-nothing database transaction. */
export async function replaceDB(json: DexieExportFormat): Promise<void> {
    if (!json || !json.data || !Array.isArray(json.data.data) ||
        !Number.isFinite(json.data.databaseVersion) || json.data.databaseVersion > db.verno) {
        throw new Error('Incompatible database backup');
    }
    const names = json.data.data.map(({ tableName }) => tableName);
    validateRestoreTableNames(names);
    const operationId = crypto.randomUUID();
    try {
        for (const { tableName, rows } of json.data.data) {
            if (!Array.isArray(rows)) throw new Error(`Invalid backup table: ${tableName}`);
            for (let offset = 0; offset < rows.length; offset += BACKUP_DB_BATCH) {
                await stageRestoreBatch(operationId, tableName, rows.slice(offset, offset + BACKUP_DB_BATCH));
            }
            if (rows.length === 0) await stageRestoreBatch(operationId, tableName, []);
        }
        await commitRestoreStaging(operationId, names);
    } finally {
        await discardRestoreStaging(operationId);
    }
}

export type Badge = Letter | Insurance | LetterTemplate;
export type Recommendation = Letter | Insurance | Reimbursement;
export function isInsurance(badge: Badge): badge is Insurance {
    return (badge as Insurance).employer !== undefined;
}

/** Persistent Fix concepts review outcomes, keyed by book in IndexedDB. */
export type BookFixConceptsChapterStatuses = Record<string, 'fixed' | 'failed'>;

export async function getBookFixConceptsChapterStatuses(bookId: number): Promise<BookFixConceptsChapterStatuses> {
    return (await db.fixConceptsChapterStatuses.get(bookId))?.statuses ?? {};
}

export async function putBookFixConceptsChapterStatuses(bookId: number, statuses: BookFixConceptsChapterStatuses): Promise<void> {
    await db.fixConceptsChapterStatuses.put({ bookId, statuses });
}

export async function deleteBookFixConceptsChapterStatuses(bookId: number): Promise<void> {
    await db.fixConceptsChapterStatuses.delete(bookId);
}

/** Persistent pending Ability splits; only valid, unique Concept IDs are stored. */
function validAbilitySplitConceptIds(ids: readonly number[]): number[] {
    return [...new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0))];
}

export async function getBookAbilitySplitQueue(bookId: number): Promise<number[]> {
    return validAbilitySplitConceptIds((await db.bookAbilitySplitQueues.get(bookId))?.conceptIds ?? []);
}

/** Change the queue atomically so rapid clicks never overwrite another edit. */
export async function toggleBookAbilitySplitQueueItem(bookId: number, conceptId: number): Promise<{ conceptIds: number[]; queued: boolean }> {
    if (!Number.isSafeInteger(conceptId) || conceptId <= 0) throw new Error('Invalid Concept ID.');

    return db.transaction('rw', db.bookAbilitySplitQueues, async () => {
        const table = db.bookAbilitySplitQueues;
        const current = validAbilitySplitConceptIds((await table.get(bookId))?.conceptIds ?? []);
        const queued = !current.includes(conceptId);
        const conceptIds = queued ? [...current, conceptId] : current.filter((id) => id !== conceptId);

        if (conceptIds.length) await table.put({ bookId, conceptIds });
        else await table.delete(bookId);

        return { conceptIds, queued };
    });
}

/** Remove an item only after its split completed successfully. */
export async function removeBookAbilitySplitQueueItem(bookId: number, conceptId: number): Promise<number[]> {
    return db.transaction('rw', db.bookAbilitySplitQueues, async () => {
        const table = db.bookAbilitySplitQueues;
        const conceptIds = validAbilitySplitConceptIds((await table.get(bookId))?.conceptIds ?? [])
            .filter((id) => id !== conceptId);

        if (conceptIds.length) await table.put({ bookId, conceptIds });
        else await table.delete(bookId);

        return conceptIds;
    });
}

/** All queued work is stored under its book, including former split-only tasks. */
export async function getBookAbilityWorkQueue(bookId: number): Promise<BookAbilityWorkItem[]> {
    return (await db.bookAbilityWorkQueues.get(bookId))?.items ?? [];
}

export async function toggleBookAbilitySplitWorkItem(bookId: number, conceptId: number): Promise<BookAbilityWorkItem[]> {
    if (!Number.isSafeInteger(conceptId) || conceptId <= 0) throw new Error('Invalid Concept ID.');
    return db.transaction('rw', db.bookAbilityWorkQueues, async () => {
        const current = await getBookAbilityWorkQueue(bookId);
        const items = current.filter((item) => item.id !== `split:${conceptId}`);
        if (items.length === current.length) items.push({ id: `split:${conceptId}`, kind: 'split', conceptId });
        if (items.length) await db.bookAbilityWorkQueues.put({ bookId, items });
        else await db.bookAbilityWorkQueues.delete(bookId);
        return items;
    });
}

/** Scheduling the same Ability twice replaces its instructions, not its queue position. */
export async function scheduleBookAbilityFix(bookId: number, conceptId: number, recordId: string, instructions: AbilityFixInstructions): Promise<BookAbilityWorkItem[]> {
    if (!Number.isSafeInteger(conceptId) || conceptId <= 0 || !recordId) throw new Error('Invalid Ability for scheduling.');
    return db.transaction('rw', db.bookAbilityWorkQueues, db.abilities, db.bookAbilityChangeLog, async () => {
        const ability = await db.abilities.get(recordId);
        if (ability && ability.moduleId !== `book-${bookId}-concept-${conceptId}`) {
            throw new Error('The scheduled Ability belongs to a different Concept.');
        }
        // An as-yet-unreviewed AI change is superseded by a new Fix request.
        if (!ability?.reviewed) {
            const onlyAbility = ability && await db.abilities.where('moduleId').equals(ability.moduleId).count() === 1;
            const superseded = await db.bookAbilityChangeLog.where('bookId').equals(bookId)
                .filter((entry) => entry.source === 'ai' && (entry.recordId === recordId ||
                    (onlyAbility && entry.conceptId === conceptId))).primaryKeys() as number[];
            if (superseded.length) await db.bookAbilityChangeLog.bulkDelete(superseded);
        }
        const items = await getBookAbilityWorkQueue(bookId);
        const item: BookAbilityWorkItem = { id: `fix:${recordId}`, kind: 'fix', conceptId, recordId, instructions: prepareAbilityFixForScheduling(instructions) };
        const index = items.findIndex(({ id }) => id === item.id);
        if (index < 0) items.push(item);
        else items[index] = item;
        await db.bookAbilityWorkQueues.put({ bookId, items });
        return items;
    });
}

/** Preserve a fix job's stable queue key if regeneration changes the Ability ID.
 * This makes partial failures retryable even when a Concept has many Abilities. */
export async function updateBookAbilityFixRecordId(bookId: number, itemId: string, recordId: string): Promise<void> {
    await db.transaction('rw', db.bookAbilityWorkQueues, async () => {
        const items = await getBookAbilityWorkQueue(bookId);
        const index = items.findIndex((item) => item.id === itemId && item.kind === 'fix');
        if (index < 0) return;
        items[index] = { ...items[index], recordId };
        await db.bookAbilityWorkQueues.put({ bookId, items });
    });
}

export async function removeBookAbilityWorkItem(bookId: number, itemId: string): Promise<BookAbilityWorkItem[]> {
    return db.transaction('rw', db.bookAbilityWorkQueues, async () => {
        const items = (await getBookAbilityWorkQueue(bookId)).filter(({ id }) => id !== itemId);
        if (items.length) await db.bookAbilityWorkQueues.put({ bookId, items });
        else await db.bookAbilityWorkQueues.delete(bookId);
        return items;
    });
}

/** A saved edit can change the content-hashed Ability ID. Keep earlier
 * unreviewed entries linked to the current Ability rather than showing stale duplicates. */
export async function relinkBookAbilityChangeLogRecord(bookId: number, oldRecordId: string, newRecordId: string): Promise<void> {
    if (oldRecordId === newRecordId) return;
    await db.transaction('rw', db.bookAbilityChangeLog, async () => {
        const entries = await db.bookAbilityChangeLog.where('bookId').equals(bookId).filter(({ recordId }) => recordId === oldRecordId).toArray();
        if (entries.length) await db.bookAbilityChangeLog.bulkPut(entries.map((entry) => ({ ...entry, recordId: newRecordId })));
    });
}

/** Show unreviewed AI changes (both fixes and generated splits), excluding manual edits. */
export async function getBookAbilityChangeLog(bookId: number): Promise<BookAbilityChangeLogEntry[]> {
    const entries = (await db.bookAbilityChangeLog.where('bookId').equals(bookId).toArray())
        .filter(({ source }) => source === 'ai')
        .sort((a, b) => b.updatedAt - a.updatedAt || (b.id ?? 0) - (a.id ?? 0));
    const currentRecords = new Map<number, Promise<Ability[]>>();

    // Reconcile history written before record-ID relinking existed. Only resolve
    // by Concept when there is ONE live Ability; multiple records must not be
    // accidentally merged into one change-log card.
    return Promise.all(entries.map(async (entry) => {
        if (entry.conceptId === undefined) return entry;
        let records = currentRecords.get(entry.conceptId);
        if (!records) {
            records = getAbilities(`book-${bookId}-concept-${entry.conceptId}`);
            currentRecords.set(entry.conceptId, records);
        }
        const abilities = await records;

        return abilities.length === 1 ? { ...entry, recordId: abilities[0].id } : entry;
    })).then(async (resolved) => {
        const records = await db.abilities.bulkGet(resolved.map(({ recordId }) => recordId));
        return resolved.filter((_, index) => !records[index]?.reviewed);
    });
}

export async function addBookAbilityChangeLog(entry: Omit<BookAbilityChangeLogEntry, 'id' | 'updatedAt'>): Promise<number> {
    return db.transaction('rw', db.bookAbilityChangeLog, db.abilities, async () => {
        if (entry.source === 'ai') {
            const ability = await db.abilities.get(entry.recordId);
            if (ability?.moduleId.startsWith(`book-${entry.bookId}-concept-`)) {
                await db.abilities.update(ability.id, { reviewed: false });
            }
            // A regenerated Ability is content-addressed and therefore has a new ID.
            // Keep only the latest AI change for this logical Ability, including
            // across ID changes. Multiple Abilities under one Concept remain distinct.
            const oneAbilityForConcept = entry.conceptId !== undefined &&
                await db.abilities.where('moduleId').equals(`book-${entry.bookId}-concept-${entry.conceptId}`).count() === 1;
            const previous = await db.bookAbilityChangeLog.where('bookId').equals(entry.bookId)
                .filter((item) => item.source === 'ai' && (item.recordId === entry.recordId ||
                    (oneAbilityForConcept && item.conceptId === entry.conceptId)))
                .primaryKeys() as number[];

            if (previous.length) await db.bookAbilityChangeLog.bulkDelete(previous);
        }

        return db.bookAbilityChangeLog.add({ ...entry, updatedAt: Date.now() });
    });
}

/** Persist review decisions independently of the content-addressed Ability ID. */
export async function setBookAbilityReviewed(bookId: number, recordId: string, reviewed: boolean): Promise<void> {
    await db.transaction('rw', db.abilities, db.bookAbilityChangeLog, async () => {
        const ability = await db.abilities.get(recordId);
        if (!ability || !ability.moduleId.startsWith(`book-${bookId}-concept-`)) {
            throw new Error('The Ability is no longer available in this book.');
        }
        await db.abilities.update(recordId, { reviewed });
        if (reviewed) {
            const changes = await db.bookAbilityChangeLog.where('bookId').equals(bookId)
                .filter((entry) => entry.recordId === recordId).primaryKeys() as number[];
            if (changes.length) await db.bookAbilityChangeLog.bulkDelete(changes);
        }
    });
}

/** Reset only the specified book Ability records in one transaction. */
export async function resetBookAbilityReviews(bookId: number, recordIds: readonly string[]): Promise<void> {
    await db.transaction('rw', db.abilities, async () => {
        for (const id of new Set(recordIds)) {
            const ability = await db.abilities.get(id);
            if (ability?.moduleId.startsWith(`book-${bookId}-concept-`)) {
                await db.abilities.update(id, { reviewed: false });
            }
        }
    });
}

/** Review any number of logged AI changes in one transaction, so a bulk
 * review cannot leave some entries marked and others pending if a write fails.
 * Stale IDs are resolved only when their Concept has a single live Ability. */
export async function reviewBookAbilityChangeLogEntries(bookId: number, entryIds: readonly number[]): Promise<void> {
    if (!entryIds.length) return;
    await db.transaction('rw', db.bookAbilityChangeLog, db.abilities, async () => {
        for (const entryId of new Set(entryIds)) {
            const entry = await db.bookAbilityChangeLog.get(entryId);
            if (entry?.bookId !== bookId) continue;
            let ability = await db.abilities.get(entry.recordId);
            if (!ability && entry.conceptId !== undefined) {
                const candidates = await db.abilities.where('moduleId').equals(`book-${bookId}-concept-${entry.conceptId}`).toArray();
                if (candidates.length === 1) ability = candidates[0];
            }
            if (ability?.moduleId.startsWith(`book-${bookId}-concept-`)) {
                await db.abilities.update(ability.id, { reviewed: true });
            }
            await db.bookAbilityChangeLog.delete(entryId);
        }
    });
}

export async function reviewBookAbilityChangeLogEntry(bookId: number, entryId: number): Promise<void> {
    return reviewBookAbilityChangeLogEntries(bookId, [entryId]);
}

export { BACKUP_DB_BATCH, BACKUP_DB_SCHEMA, backupTableNames, countBackupRows, readBackupRows, countBookPdfs, readBookPdfNames, validateRestoreRows, validateRestoreTableNames, stageRestoreBatch, discardRestoreStaging, commitRestoreStaging } from './backupStorage.js';
export { backupPolicy } from './backup.js';
export { getStagedBookNames } from './backupStorage.js';
