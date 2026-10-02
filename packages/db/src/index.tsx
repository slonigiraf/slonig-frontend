// Copyright 2021-2022 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0
import { db } from "./db/index.js";
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
import "dexie-export-import";
import { exportDB as dexieExport } from 'dexie-export-import';
import { InsurancesTransfer, LessonRequest } from "@slonigiraf/slonig-components";
import { CanceledInsurance } from "./db/CanceledInsurance.js";
import { Repetition } from "./db/Repetition.js";
import { EXAMPLE_MODULE_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_ID } from "@slonigiraf/utils";
import { LearnRequest } from "./db/LearnRequest.js";
import { ScheduledEvent, ScheduledEventType } from "./db/ScheduledEvent.js";
import Dexie, { type Table } from "dexie";
import { getBookCompletedStages, withBookProcessingStagesResetFrom, withCompletedBookProcessingStage } from './db/Book.js';
import type { Book, BookProcessingStageKey, BookStageSpend, BookStageSpendKey, BookSubject } from './db/Book.js';
import type { BookPage, MathpixHeading } from './db/BookPage.js';
import type { BookConcept } from './db/BookConcept.js';
import type { Exercise } from './db/Exercise.js';
import type { BookChapter } from './db/BookChapter.js';
import type { Skill } from './db/Skill.js';
import type { ExerciseTemplate } from './db/ExerciseTemplate.js';
import type { Ability, AbilityExercise, AbilityValue } from './db/Ability.js';
import type { Image } from './db/Image.js';
import type { AiTutorStudentMessage } from './db/AiTutorStudentMessage.js';
import type { StandardEmbedding } from './db/StandardEmbedding.js';
import type { ConceptEmbedding } from './db/ConceptEmbedding.js';
import { shouldExportDatabaseRow } from './backup.js';

export { BOOK_PROCESSING_STAGES, getBookCompletedStages, isBookProcessingStageComplete, withBookProcessingStagesResetFrom, withCompletedBookProcessingStage } from './db/Book.js';
export type { LearnRequest, TutorAction, CanceledInsurance, Reexamination, LetterTemplate, CanceledLetter, Reimbursement, Letter, Insurance, Lesson, Pseudonym, Setting, Signer, UsageRight, Agreement, Ability, AbilityExercise, AbilityValue, Image, Book, BookProcessingStageKey, BookStageSpend, BookStageSpendKey, BookSubject, BookPage, MathpixHeading, BookChapter, BookConcept, Exercise, Skill, ExerciseTemplate, AiTutorStudentMessage, StandardEmbedding, ConceptEmbedding };
export type { ImageType } from './db/Image.js';

const EXERCISE_ABILITY_MODULE = /^book-(\d+)-exercise-(\d+)$/;

function finiteDisplayOrder(value: number | undefined): number | undefined {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function exerciseAbilityModuleId(bookId: number, exerciseId: number): string {
    return `book-${bookId}-exercise-${exerciseId}`;
}

function exerciseIdFromAbilityModule(moduleId: string): number | undefined {
    const match = EXERCISE_ABILITY_MODULE.exec(moduleId);

    if (!match) {
        return undefined;
    }

    const exerciseId = Number(match[2]);

    return Number.isSafeInteger(exerciseId) ? exerciseId : undefined;
}

async function chapterIdForExercise(exercise: Exercise | undefined): Promise<number | undefined> {
    if (!exercise) {
        return undefined;
    }

    if (exercise.conceptId !== undefined) {
        const concept = await db.bookConcepts.get(exercise.conceptId);

        if (concept?.chapterId !== undefined) {
            return concept.chapterId;
        }
    }

    return (await db.bookPages.get(exercise.bookPage))?.chapterId;
}

/**
 * Learning order is persisted at every layer. Concept order is the canonical
 * forward hierarchy, while explicit Exercise/Ability reorders may first flow
 * upward to their parents and are then normalized back down:
 *
 *   Ability -> Exercise -> BookConcept -> Exercise -> Ability
 *
 * The upward pass uses the first child occurrence as the parent's position.
 * Parents/children without rows at a lower layer keep their existing slots.
 */
type LearningOrderSource = 'concept' | 'exercise' | 'ability';

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

function validateDisplayOrderIndex(displayOrder: number, entity: 'Exercise' | 'Ability'): void {
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

    const concepts = [...conceptsById.values(), ...conceptsWithoutId];

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

async function chapterExercisesForLearningOrder(chapterId: number): Promise<Exercise[]> {
    const { concepts, pages } = await chapterConceptsForLearningOrder(chapterId);
    const conceptIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));
    const pageKeys = new Set(pages.map(({ bookId, pageNumber }) => `${bookId}:${pageNumber}`));
    const candidates = await db.exercises.filter(({ bookPage, conceptId }) =>
        (conceptId !== undefined && conceptIds.has(conceptId)) || pageKeys.has(`${bookPage[0]}:${bookPage[1]}`)).toArray();
    const otherConceptIds = Array.from(new Set(candidates.flatMap(({ conceptId }) => conceptId !== undefined && !conceptIds.has(conceptId) ? [conceptId] : [])));
    const otherConcepts = otherConceptIds.length ? await db.bookConcepts.bulkGet(otherConceptIds) : [];
    const otherConceptById = new Map(otherConceptIds.flatMap((id, index) => {
        const concept = otherConcepts[index];

        return concept ? [[id, concept] as const] : [];
    }));

    return candidates.filter(({ bookPage, conceptId }) => {
        if (conceptId === undefined) {
            return pageKeys.has(`${bookPage[0]}:${bookPage[1]}`);
        }

        if (conceptIds.has(conceptId)) {
            return true;
        }

        const linkedConcept = otherConceptById.get(conceptId);

        // A linked Concept with explicit chapter membership belongs only to that
        // chapter, even when its source page belongs here. Missing/legacy links
        // retain the historical page-based fallback.
        return linkedConcept?.chapterId === undefined && pageKeys.has(`${bookPage[0]}:${bookPage[1]}`);
    });
}

async function moveExerciseToDisplayOrder(exerciseId: number, requestedIndex: number): Promise<Exercise | undefined> {
    const exercise = await db.exercises.get(exerciseId);

    if (!exercise) {
        return undefined;
    }

    const chapterId = await chapterIdForExercise(exercise);

    if (chapterId === undefined) {
        await db.exercises.update(exerciseId, { displayOrder: requestedIndex });
        return db.exercises.get(exerciseId);
    }

    const rows = orderedByDisplayOrder(await chapterExercisesForLearningOrder(chapterId), (a, b) => a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER));
    const target = rows.find(({ id }) => id === exerciseId);

    if (!target) {
        return exercise;
    }

    const reordered = moveToIndex(rows, target, requestedIndex);

    await Promise.all(reordered.flatMap((row, index) => row.id === undefined ? [] : [db.exercises.update(row.id, { displayOrder: index })]));
    await syncChapterLearningDisplayOrder(chapterId, 'exercise');

    return db.exercises.get(exerciseId);
}

async function moveAbilityToDisplayOrder(abilityId: string, requestedIndex: number): Promise<Ability | undefined> {
    const ability = await db.abilities.get(abilityId);

    if (!ability) {
        return undefined;
    }

    const exerciseId = exerciseIdFromAbilityModule(ability.moduleId);
    const exercise = exerciseId === undefined ? undefined : await db.exercises.get(exerciseId);
    const chapterId = await chapterIdForExercise(exercise);

    if (chapterId === undefined) {
        await db.abilities.update(abilityId, { displayOrder: requestedIndex });
        return db.abilities.get(abilityId);
    }

    const exercises = await chapterExercisesForLearningOrder(chapterId);
    const rows = (await Promise.all(exercises.flatMap((row) => row.id === undefined
        ? []
        : [db.abilities.where('moduleId').equals(exerciseAbilityModuleId(row.bookPage[0], row.id)).toArray()])))
        .flat();
    const ordered = orderedByDisplayOrder(rows, (a, b) => a.id.localeCompare(b.id));
    const target = ordered.find(({ id }) => id === abilityId);

    if (!target) {
        return ability;
    }

    const reordered = moveToIndex(ordered, target, requestedIndex);

    await Promise.all(reordered.map((row, index) => db.abilities.update(row.id, { displayOrder: index })));
    await syncChapterLearningDisplayOrder(chapterId, 'ability');

    return db.abilities.get(abilityId);
}

async function syncChapterLearningDisplayOrder(chapterId: number, source: LearningOrderSource = 'concept'): Promise<void> {
    const { concepts } = await chapterConceptsForLearningOrder(chapterId);
    const baselineConcepts = orderedByDisplayOrder(concepts, (a, b) => a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER));
    const conceptIds = new Set(baselineConcepts.flatMap(({ id }) => id === undefined ? [] : [id]));
    const exercises = await chapterExercisesForLearningOrder(chapterId);
    const baselineExercises = orderedByDisplayOrder(exercises, (a, b) => a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER));
    const exerciseById = new Map(baselineExercises.flatMap((exercise) => exercise.id === undefined ? [] : [[exercise.id, exercise] as const]));
    const abilitiesByExerciseId = new Map<number, Ability[]>();

    await Promise.all([...exerciseById].map(async ([exerciseId, exercise]) => {
        const records = await db.abilities.where('moduleId').equals(exerciseAbilityModuleId(exercise.bookPage[0], exerciseId)).toArray();

        abilitiesByExerciseId.set(exerciseId, records);
    }));

    let orderedExercises = baselineExercises;

    if (source === 'ability') {
        const orderedAbilities = orderedByDisplayOrder(
            [...abilitiesByExerciseId].flatMap(([exerciseId, records]) => records.map((record) => ({ ...record, exerciseId }))),
            (a, b) => a.id.localeCompare(b.id)
        );
        const preferredExerciseIds = uniqueIdsInOrder(orderedAbilities.map(({ exerciseId }) => exerciseId));

        orderedExercises = reorderSubsetInExistingSlots(baselineExercises, preferredExerciseIds, ({ id }) => id);
    }

    let orderedConcepts = baselineConcepts;

    if (source === 'exercise' || source === 'ability') {
        const preferredConceptIds = uniqueIdsInOrder(orderedExercises.map(({ conceptId }) => conceptId));

        orderedConcepts = reorderSubsetInExistingSlots(baselineConcepts, preferredConceptIds, ({ id }) => id);
    }

    for (let conceptRank = 0; conceptRank < orderedConcepts.length; conceptRank++) {
        const concept = orderedConcepts[conceptRank];

        if (concept.id !== undefined && concept.displayOrder !== conceptRank) {
            await db.bookConcepts.update(concept.id, { displayOrder: conceptRank });
        }
    }

    const conceptRanks = new Map(orderedConcepts.flatMap((concept, rank) => concept.id === undefined ? [] : [[concept.id, rank] as const]));
    const desiredExerciseIndex = new Map(orderedExercises.flatMap((exercise, index) => exercise.id === undefined ? [] : [[exercise.id, index] as const]));
    const finalExercises = [...exercises].sort((a, b) => {
        const aConceptRank = a.conceptId === undefined ? undefined : conceptRanks.get(a.conceptId);
        const bConceptRank = b.conceptId === undefined ? undefined : conceptRanks.get(b.conceptId);

        if (aConceptRank !== undefined || bConceptRank !== undefined) {
            if (aConceptRank === undefined) return 1;
            if (bConceptRank === undefined) return -1;
            if (aConceptRank !== bConceptRank) return aConceptRank - bConceptRank;
        }

        const aDesired = a.id === undefined ? undefined : desiredExerciseIndex.get(a.id);
        const bDesired = b.id === undefined ? undefined : desiredExerciseIndex.get(b.id);

        if (aDesired !== undefined || bDesired !== undefined) {
            if (aDesired === undefined) return 1;
            if (bDesired === undefined) return -1;
            if (aDesired !== bDesired) return aDesired - bDesired;
        }

        return a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
    });

    for (let exerciseRank = 0; exerciseRank < finalExercises.length; exerciseRank++) {
        const exercise = finalExercises[exerciseRank];

        if (exercise.id !== undefined && exercise.displayOrder !== exerciseRank) {
            await db.exercises.update(exercise.id, { displayOrder: exerciseRank });
        }
    }

    let abilityRank = 0;

    for (const exercise of finalExercises) {
        if (exercise.id === undefined) {
            continue;
        }

        const records = orderedByDisplayOrder(abilitiesByExerciseId.get(exercise.id) ?? [], (a, b) => a.id.localeCompare(b.id));

        for (const record of records) {
            if (record.displayOrder !== abilityRank) {
                await db.abilities.update(record.id, { displayOrder: abilityRank });
            }

            abilityRank++;
        }
    }
}

async function syncLearningDisplayOrderForAbilityModule(moduleId: string, source: LearningOrderSource = 'concept'): Promise<void> {
    const exerciseId = exerciseIdFromAbilityModule(moduleId);

    if (exerciseId === undefined) {
        return;
    }

    const chapterId = await chapterIdForExercise(await db.exercises.get(exerciseId));

    if (chapterId !== undefined) {
        await syncChapterLearningDisplayOrder(chapterId, source);
    }
}

export async function createBook(book: Omit<Book, 'id'>): Promise<number> {
    return db.books.add(book as Book);
}

export async function putBook(book: Book): Promise<void> {
    await db.transaction('rw', db.books, async () => {
        const storedBook = await db.books.get(book.id);
        const storedSpend = storedBook?.stageSpend;
        const incomingSpend = book.stageSpend;
        const stageSpend = storedSpend || incomingSpend
            ? {
                recognize: Math.max(storedSpend?.recognize ?? 0, incomingSpend?.recognize ?? 0),
                language: Math.max(storedSpend?.language ?? 0, incomingSpend?.language ?? 0),
                subject: Math.max(storedSpend?.subject ?? 0, incomingSpend?.subject ?? 0),
                age: Math.max(storedSpend?.age ?? 0, incomingSpend?.age ?? 0),
                chapters: Math.max(storedSpend?.chapters ?? 0, incomingSpend?.chapters ?? 0),
                concepts: Math.max(storedSpend?.concepts ?? 0, incomingSpend?.concepts ?? 0),
                fixConcepts: Math.max(storedSpend?.fixConcepts ?? 0, incomingSpend?.fixConcepts ?? 0),
                deduplicateConcepts: Math.max(storedSpend?.deduplicateConcepts ?? 0, incomingSpend?.deduplicateConcepts ?? 0),
                sortConcepts: Math.max(storedSpend?.sortConcepts ?? 0, incomingSpend?.sortConcepts ?? 0),
                refineChapters: Math.max(storedSpend?.refineChapters ?? 0, incomingSpend?.refineChapters ?? 0),
                exercises: Math.max(storedSpend?.exercises ?? 0, incomingSpend?.exercises ?? 0),
                splitExercises: Math.max(storedSpend?.splitExercises ?? 0, incomingSpend?.splitExercises ?? 0),
                fixExercises: Math.max(storedSpend?.fixExercises ?? 0, incomingSpend?.fixExercises ?? 0),
                abilities: Math.max(storedSpend?.abilities ?? 0, incomingSpend?.abilities ?? 0),
                fixAbilities: Math.max(storedSpend?.fixAbilities ?? 0, incomingSpend?.fixAbilities ?? 0),
                images: Math.max(storedSpend?.images ?? 0, incomingSpend?.images ?? 0),
                fixImages: Math.max(storedSpend?.fixImages ?? 0, incomingSpend?.fixImages ?? 0),
                standards: Math.max(storedSpend?.standards ?? 0, incomingSpend?.standards ?? 0),
                fixStandards: Math.max(storedSpend?.fixStandards ?? 0, incomingSpend?.fixStandards ?? 0)
            }
            : undefined;

        const completedStages = book.completedStages ?? storedBook?.completedStages ?? getBookCompletedStages(book);
        const fixConceptsAttempts = Math.max(storedBook?.fixConceptsAttempts ?? 0, book.fixConceptsAttempts ?? 0);

        await db.books.put({ ...book, completedStages, fixConceptsAttempts, ...(stageSpend ? { stageSpend } : {}) });
    });
}

function withNamedBookStages (book: Book | undefined): Book | undefined {
    return book ? { ...book, completedStages: getBookCompletedStages(book) } : undefined;
}

export async function getBook(id: number): Promise<Book | undefined> {
    return withNamedBookStages(await db.books.get(id));
}

/** @deprecated Use completeBookProcessingStage/resetBookProcessingStagesFrom. */
export async function updateBookProcessingStage(id: number, processingStage: number): Promise<Book | undefined> {
    const book = await db.books.get(id);

    if (!book) {
        return undefined;
    }

    const legacyBook = { ...book, completedStages: undefined, processingStage };

    await db.books.update(id, { completedStages: getBookCompletedStages(legacyBook), processingStage });

    return getBook(id);
}

export async function completeBookProcessingStage(id: number, stage: BookProcessingStageKey): Promise<Book | undefined> {
    const book = await db.books.get(id);

    if (!book) {
        return undefined;
    }

    const updated = withCompletedBookProcessingStage({ ...book, completedStages: getBookCompletedStages(book) }, stage);

    await db.books.update(id, { completedStages: updated.completedStages });

    return getBook(id);
}

export async function resetBookProcessingStagesFrom(id: number, stage: BookProcessingStageKey): Promise<Book | undefined> {
    const book = await db.books.get(id);

    if (!book) {
        return undefined;
    }

    const updated = withBookProcessingStagesResetFrom({ ...book, completedStages: getBookCompletedStages(book) }, stage);

    await db.books.update(id, { completedStages: updated.completedStages });

    return getBook(id);
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
    await db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.exercises, db.skills, db.exerciseTemplates, async () => {
        const pageKeys = await db.bookPages.where('bookId').equals(id).primaryKeys();
        const chapterIds = (await db.bookChapters.where('bookId').equals(id).primaryKeys()) as number[];
        const skillIds = (await Promise.all(chapterIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).primaryKeys()))).flat() as number[];

        await db.books.delete(id);
        await db.bookPages.where('bookId').equals(id).delete();
        await Promise.all([
            db.bookConcepts.where('bookPage').equals([id, 0]).delete(),
            ...pageKeys.map((bookPage) => db.bookConcepts.where('bookPage').equals(bookPage).delete()),
            ...pageKeys.map((bookPage) => db.exercises.where('bookPage').equals(bookPage).delete()),
            ...skillIds.map((skillId) => db.exerciseTemplates.where('skillId').equals(skillId).delete()),
            ...chapterIds.map((chapterId) => db.skills.where('chapterId').equals(chapterId).delete())
        ]);
        await db.bookChapters.where('bookId').equals(id).delete();
        await db.conceptEmbeddings.where('bookId').equals(id).delete();
    });
}

export async function putBookPage(bookPage: BookPage): Promise<void> {
    await db.bookPages.put(bookPage);
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

        await db.bookChapters.update(chapterId, { source: 'manual', title });
        await db.bookPages.where('bookId').equals(chapter.bookId).filter((page) => page.chapterId === chapterId || page.chapter === chapter.title).modify({ chapter: title, chapterId });
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
    });
}

export async function deleteBookChapters(bookId: number, chapterIds: number[]): Promise<void> {
    const uniqueIds = Array.from(new Set(chapterIds.filter((id) => Number.isSafeInteger(id) && id > 0)));

    if (!uniqueIds.length) {
        return;
    }

    await db.transaction('rw', db.books, db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.exercises, db.skills, db.exerciseTemplates, async () => {
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
            await db.exercises.where('bookPage').equals([bookId, page.pageNumber]).delete();
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

export async function replaceExercisesForBookPage(bookPage: [number, number], exercises: Array<Omit<Exercise, 'bookPage' | 'id'>>): Promise<Exercise[]> {
    return db.transaction('rw', db.exercises, db.bookConcepts, db.bookPages, db.abilities, async () => {
        await db.exercises.where('bookPage').equals(bookPage).delete();
        const rows = exercises.map((exercise) => ({ ...exercise, bookPage }));
        const ids = await db.exercises.bulkAdd(rows, { allKeys: true });
        const chapterIds = new Set<number>();
        const pageChapterId = (await db.bookPages.get(bookPage))?.chapterId;

        if (pageChapterId !== undefined) {
            chapterIds.add(pageChapterId);
        }

        const conceptIds = [...new Set(rows.flatMap(({ conceptId }) => conceptId === undefined ? [] : [conceptId]))];
        const concepts = conceptIds.length ? await db.bookConcepts.bulkGet(conceptIds) : [];

        concepts.forEach((concept) => {
            if (concept?.chapterId !== undefined) {
                chapterIds.add(concept.chapterId);
            }
        });

        const hasExplicitDisplayOrder = rows.some(({ displayOrder }) => finiteDisplayOrder(displayOrder) !== undefined);

        for (const chapterId of chapterIds) {
            await syncChapterLearningDisplayOrder(chapterId, hasExplicitDisplayOrder ? 'exercise' : 'concept');
        }

        const stored = await db.exercises.bulkGet(ids);

        return stored.map((exercise, index) => exercise ?? { ...rows[index], id: ids[index] });
    });
}

export async function updateExerciseDisplayOrder(id: number, displayOrder: number): Promise<Exercise | undefined> {
    validateDisplayOrderIndex(displayOrder, 'Exercise');

    return db.transaction('rw', db.exercises, db.bookConcepts, db.bookPages, db.abilities, async () => moveExerciseToDisplayOrder(id, displayOrder));
}

export async function getExercisesForBookPage(bookPage: [number, number]): Promise<Exercise[]> {
    const rows = await db.exercises.where('bookPage').equals(bookPage).toArray();

    return rows.sort((a, b) => {
        const aOrder = finiteDisplayOrder(a.displayOrder);
        const bOrder = finiteDisplayOrder(b.displayOrder);

        if (aOrder !== undefined || bOrder !== undefined) {
            if (aOrder === undefined) return 1;
            if (bOrder === undefined) return -1;
            if (aOrder !== bOrder) return aOrder - bOrder;
        }

        return (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
    });
}

export async function deleteExercise(id: number): Promise<void> {
    await db.transaction('rw', db.exercises, db.skills, db.bookConcepts, db.bookPages, db.abilities, async () => {
        const exercise = await db.exercises.get(id);
        const chapterId = await chapterIdForExercise(exercise);

        await db.exercises.delete(id);
        const linkedSkills = await db.skills.filter(({ exerciseIds }) => (exerciseIds ?? []).includes(id)).toArray();

        await Promise.all(linkedSkills.flatMap((skill) => skill.id === undefined ? [] : [db.skills.update(skill.id, { exerciseIds: (skill.exerciseIds ?? []).filter((exerciseId) => exerciseId !== id) })]));

        if (chapterId !== undefined) {
            await syncChapterLearningDisplayOrder(chapterId);
        }
    });
}

export async function replaceParsedBookPageContent(bookId: number, pageNumber: number, chapterTitle: string, concepts: Array<Omit<BookConcept, 'bookPage' | 'chapterId' | 'id'>>, exercises: Array<Omit<Exercise, 'bookPage' | 'conceptId' | 'id'> & { conceptIndex?: number }>): Promise<{ concepts: BookConcept[]; exercises: Exercise[] }> {
    return db.transaction('rw', db.bookPages, db.bookChapters, db.bookConcepts, db.conceptEmbeddings, db.exercises, db.abilities, async () => {
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
        const existingChapter = preferredChapter ?? await db.bookChapters.where('bookId').equals(bookId).filter(({ title }) => title === resolvedChapterTitle).first();
        const chapterId = existingChapter?.id ?? await db.bookChapters.add({ bookId, source: 'legacy', title: resolvedChapterTitle });
        const conceptBookPage: [number, number] = [bookId, pageNumber];
        const exerciseBookPage: [number, number] = [bookId, pageNumber];
        const conceptRows = concepts.map((concept) => ({ ...concept, attempt: concept.attempt ?? 0, bookPage: conceptBookPage, chapterId }));
        const previousConceptIds = (await db.bookConcepts.where('bookPage').equals(conceptBookPage).primaryKeys()) as number[];
        await db.bookConcepts.where('bookPage').equals(conceptBookPage).delete();
        if (previousConceptIds.length) {
            await db.conceptEmbeddings.bulkDelete(previousConceptIds);
        }
        await db.exercises.where('bookPage').equals(exerciseBookPage).delete();

        const conceptIds = await db.bookConcepts.bulkAdd(conceptRows, { allKeys: true });
        const exerciseRows = exercises.map(({ conceptIndex, ...exercise }) => ({
            ...exercise,
            bookPage: exerciseBookPage,
            ...(conceptIndex !== undefined && conceptIds[conceptIndex] !== undefined ? { conceptId: conceptIds[conceptIndex] } : {})
        }));
        const exerciseIds = await db.exercises.bulkAdd(exerciseRows, { allKeys: true });

        await syncChapterLearningDisplayOrder(chapterId);

        const storedExercises = await db.exercises.bulkGet(exerciseIds);

        return {
            concepts: conceptRows.map((concept, index) => ({ ...concept, id: conceptIds[index] })),
            exercises: storedExercises.map((exercise, index) => exercise ?? { ...exerciseRows[index], id: exerciseIds[index] })
        };
    });
}

export async function getBookPages(bookId: number): Promise<BookPage[]> {
    return db.bookPages.where('bookId').equals(bookId).sortBy('pageNumber');
}

export async function deleteBookPage(bookId: number, pageNumber: number): Promise<void> {
    await db.transaction('rw', db.bookPages, db.bookConcepts, db.conceptEmbeddings, db.exercises, async () => {
        const conceptIds = (await db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).primaryKeys()) as number[];

        await db.bookPages.delete([bookId, pageNumber]);
        await db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).delete();
        if (conceptIds.length) {
            await db.conceptEmbeddings.bulkDelete(conceptIds);
        }
        await db.exercises.where('bookPage').equals([bookId, pageNumber]).delete();
    });
}

export async function getBookConceptsForBookPage(bookId: number, pageNumber: number): Promise<BookConcept[]> {
    return db.bookConcepts.where('bookPage').equals([bookId, pageNumber]).sortBy('id');
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
    return db.transaction('rw', db.bookConcepts, db.conceptEmbeddings, db.bookPages, db.exercises, db.abilities, async () => {
        const previous = await db.bookConcepts.get(id);
        const previousChapterId = await chapterIdForConcept(previous);

        await db.bookConcepts.update(id, changes);
        if (Object.prototype.hasOwnProperty.call(changes, 'title') || Object.prototype.hasOwnProperty.call(changes, 'description')) {
            await db.conceptEmbeddings.delete(id);
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

    await db.transaction('rw', db.bookConcepts, db.bookPages, db.bookChapters, db.exercises, db.abilities, async () => {
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

    await db.transaction('rw', db.bookConcepts, db.bookPages, db.exercises, db.abilities, async () => {
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

export async function deleteBookConcept(id: number): Promise<void> {
    await db.transaction('rw', db.bookConcepts, db.conceptEmbeddings, db.skills, db.bookPages, db.exercises, db.abilities, async () => {
        const concept = await db.bookConcepts.get(id);
        const chapterId = await chapterIdForConcept(concept);

        await db.bookConcepts.delete(id);
        await db.conceptEmbeddings.delete(id);
        const linkedSkills = await db.skills.filter(({ bookConceptIds }) => (bookConceptIds ?? []).includes(id)).toArray();

        await Promise.all(linkedSkills.flatMap((skill) => skill.id === undefined ? [] : [db.skills.update(skill.id, { bookConceptIds: (skill.bookConceptIds ?? []).filter((conceptId) => conceptId !== id) })]));

        if (chapterId !== undefined) {
            await syncChapterLearningDisplayOrder(chapterId);
        }
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
                    bookConceptIds: Array.from(new Set([...(keptSkill.bookConceptIds ?? []), ...(deletedSkill.bookConceptIds ?? [])])),
                    exerciseIds: Array.from(new Set([...(keptSkill.exerciseIds ?? []), ...(deletedSkill.exerciseIds ?? [])]))
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

export async function getImage(id: number): Promise<Image | undefined> {
    return db.images.get(id);
}

export async function getImages(ids: number[]): Promise<Image[]> {
    const uniqueIds = Array.from(new Set(ids.filter((id) => Number.isSafeInteger(id) && id > 0)));
    const values = await db.images.bulkGet(uniqueIds);

    return values.filter((value): value is Image => value !== undefined);
}

export async function createImage(image: Omit<Image, 'id'>): Promise<number> {
    return db.images.add(image as Image);
}

export async function putImage(image: Image): Promise<number> {
    return db.images.put(image);
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

    return db.transaction('rw', db.abilities, db.images, db.exercises, db.bookConcepts, db.bookPages, async () => {
        const existing = await db.abilities.get(id);
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
            ...(inheritedDisplayOrder === undefined ? {} : { displayOrder: inheritedDisplayOrder })
        };

        await db.abilities.put(record);

        const nextImageIds = new Set(abilityImageIds(normalizedContent));
        const staleImageIds = oldImageIds.filter((imageId) => !nextImageIds.has(imageId));

        await deleteUnreferencedAbilityImages(staleImageIds);

        if (existing?.moduleId && existing.moduleId !== moduleId) {
            await syncLearningDisplayOrderForAbilityModule(existing.moduleId);
        }

        if (displayOrderChanged && displayOrder !== undefined) {
            validateDisplayOrderIndex(displayOrder, 'Ability');
            await moveAbilityToDisplayOrder(id, displayOrder);
        } else {
            await syncLearningDisplayOrderForAbilityModule(moduleId);
        }

        return id;
    });
}

export async function updateAbilityDisplayOrder(id: string, displayOrder: number): Promise<Ability | undefined> {
    validateDisplayOrderIndex(displayOrder, 'Ability');

    return db.transaction('rw', db.abilities, db.exercises, db.bookConcepts, db.bookPages, async () => moveAbilityToDisplayOrder(id, displayOrder));
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
    await db.transaction('rw', db.abilities, db.images, db.exercises, db.bookConcepts, db.bookPages, async () => {
        const rows = await db.abilities.where('moduleId').equals(moduleId).toArray() as Ability[];
        const imageIds: number[] = Array.from(new Set<number>(rows.flatMap(({ content }) => abilityImageIds(content))));

        await db.abilities.where('moduleId').equals(moduleId).delete();

        await deleteUnreferencedAbilityImages(imageIds);
        await syncLearningDisplayOrderForAbilityModule(moduleId);
    });
}

export async function replaceAbilities(moduleId: string, contents: string[]): Promise<string[]> {
    return db.transaction('rw', db.abilities, db.images, db.exercises, db.bookConcepts, db.bookPages, async () => {
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
        await syncLearningDisplayOrderForAbilityModule(moduleId);

        const stored = await db.abilities.bulkGet(records.map(({ id }) => id));

        return stored.flatMap((record) => record ? [record.id] : []);
    });
}

export async function deleteAbility(id: string): Promise<void> {
    await db.transaction('rw', db.abilities, db.images, db.exercises, db.bookConcepts, db.bookPages, async () => {
        const row = await db.abilities.get(id);

        await db.abilities.delete(id);

        const imageIds = row ? abilityImageIds(row.content) : [];

        await deleteUnreferencedAbilityImages(imageIds);

        if (row) {
            await syncLearningDisplayOrderForAbilityModule(row.moduleId);
        }
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
    return await db.letterTemplates.where({ lesson: lessonId }).filter(letter => (letter.valid && letter.mature)).toArray();
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

export async function getAiTutorStudentMessage<TMessage, TMedia>(lessonId: string, lessonStep: number): Promise<AiTutorStudentMessage<TMessage, TMedia> | undefined> {
    return await db.aiTutorStudentMessages.get(`${lessonId}:${lessonStep}`) as AiTutorStudentMessage<TMessage, TMedia> | undefined;
}

export async function putAiTutorStudentMessage<TMessage, TMedia>(lessonId: string, lessonStep: number, message: TMessage, studentExerciseMedia: TMedia[]): Promise<void> {
    await db.aiTutorStudentMessages.put({
        key: `${lessonId}:${lessonStep}`,
        lessonId,
        lessonStep,
        message,
        studentExerciseMedia
    });
}

export async function deleteAiTutorStudentMessage(lessonId: string, lessonStep: number): Promise<void> {
    await db.aiTutorStudentMessages.delete(`${lessonId}:${lessonStep}`);
}

export async function clearAiTutorStudentMessages(lessonId: string): Promise<void> {
    await db.aiTutorStudentMessages.where('lessonId').equals(lessonId).delete();
}

// Export DB

export async function exportDB(progressCallback?: (progress: number) => void, includeEverything = false): Promise<Blob> {
    try {
        const blob = await dexieExport(db, {
            prettyJson: true,
            progressCallback,
            filter: (tableName: string, value: unknown) => shouldExportDatabaseRow(tableName, value, includeEverything),
        });
        return blob;
    } catch (error) {
        console.error('Error exporting Dexie database:', error);
        throw error;
    }
}

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

export async function replaceDB(json: DexieExportFormat): Promise<void> {
    try {
        const uploadedVersion = json.data.databaseVersion;
        const currentVersion = db.verno;
        if (uploadedVersion > currentVersion) {
            throw new Error('Update your application to match the database version.');
        }
        for (const { tableName, rows } of json.data.data) {
            if (db.tables.some((table) => table.name === tableName)) {
                const table = db.table(tableName);
                await table.clear();
                await table.bulkAdd(rows);
            } else {
                console.warn(`Unknown table in backup JSON: ${tableName}`);
            }
        }
    } catch (error) {
        console.error('Error syncing database:', error);
        throw new Error('Failed to synchronize database');
    }
}

export type Badge = Letter | Insurance | LetterTemplate;
export type Recommendation = Letter | Insurance | Reimbursement;
export function isInsurance(badge: Badge): badge is Insurance {
    return (badge as Insurance).employer !== undefined;
}
