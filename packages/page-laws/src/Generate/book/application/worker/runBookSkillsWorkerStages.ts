// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, Exercise } from '@slonigiraf/db';
import {
  completeBookProcessingStage,
  deleteAbilities,
  deleteAbility,
  deleteExercise,
  getAbilities,
  getBookChapters,
  getBookConceptsForBookPage,
  getBookPages,
  getExercisesForBookPage,
  getImage,
  getSetting,
  hydrateAbilityContent,
  putImage,
  replaceAbilities,
  replaceExercisesForBookPage,
  resetBookProcessingStagesFrom,
  SettingKey,
  storeAbility
} from '@slonigiraf/db';
import OpenAI from 'openai';

import type { GeneratedAbility } from '../../../../abilities/abilities.js';
import type { TikzPreRenderResult } from '../../../../Edit/TikzDisplay.js';
import { parseAbilityRepairResult, parseStoredAbility } from '../../../../abilities/abilities.js';
import { isTikzCode } from '../../../../Edit/tikz.js';
import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY } from '../../../../openrouter/concurrency.js';
import type { OpenRouterCostReporter } from '../../../../openrouter/cost.js';
import { buildAbilityEmbeddingValidationHints } from '../abilities/abilityEmbeddingValidation.js';
import {
  abilityRepairInput,
  abilityWithImageDescriptions,
  cleanTikzResponse,
  exerciseAbilityModuleId,
  exerciseForPageReplacement,
  exerciseRepairInput,
  requestChatContent,
  requestChatContentWithTruncationRetry,
  requestValidatedJson,
  parseTikzAiReview,
  storedAbilityImageId,
  tikzCompileRepairPrompt,
  tikzDetectedProblemsRepairPrompt,
  tikzFixReviewPrompt,
  tikzRequestPrompt,
  type ImageFixTarget,
  type StoredAbility,
  type TikzAiReview
} from '../abilities/abilityProcessing.js';
import { DEFAULT_PROCESSING_MODEL, DEFAULT_STANDARDS_EMBEDDER } from '../config.js';
import { generateExerciseAbility, type AbilityWorkflowJsonRunner, type ExerciseAbilityConversion } from '../../domain/abilities/abilityWorkflow.js';
import { sortAbilitiesForDisplay, sortExercisesForDisplay } from '../../domain/concepts/learningOrder.js';
import { parseExerciseRepairResult } from '../../domain/exercises/exercises.js';
import { ABILITY_WORKFLOW_SYSTEM_PROMPT, FIX_ABILITIES_REQUEST_PROMPT, FIX_EXERCISES_REQUEST_PROMPT, REPAIR_SYSTEM_PROMPT } from '../../infrastructure/ai/prompts/abilities.js';
import { deleteConceptAndDependencies } from '../workspace/bookReaderWorkspace.js';
import { conceptGenerationErrorMessage, createOpenRouterClient } from '../workspace/bookReaderProcessing.js';
import type { BookProcessingWorkerCommand, BookProcessingWorkerServices } from './bookProcessingWorkerProtocol.js';

interface SkillsStageContext {
  book: Book;
  command: BookProcessingWorkerCommand;
  cost: OpenRouterCostReporter;
  progress: (value: number, total: number, label?: string) => Promise<void>;
  services: BookProcessingWorkerServices;
  signal: AbortSignal;
  throwIfAborted: () => void;
}

interface BookPageContent {
  exercises: Exercise[];
  page: BookPage;
}

interface ChapterContent {
  abilities: StoredAbility[];
  chapter: BookChapter;
  concepts: BookConcept[];
  exercises: Exercise[];
}

interface LearningContent {
  allAbilities: StoredAbility[];
  allConcepts: BookConcept[];
  allExercises: Exercise[];
  chapters: ChapterContent[];
  pageRows: BookPageContent[];
  pages: BookPage[];
}

const TIKZ_RENDER_CONCURRENCY = 4;
const TIKZ_REVIEW_MAX_OUTPUT_TOKENS = 6_000;

async function requireClient (signal: AbortSignal): Promise<OpenAI> {
  const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

  if (!key) {
    throw new Error('No OpenRouter token found. Add it in Settings.');
  }

  return createOpenRouterClient(key, signal);
}

async function loadLearningContent (bookId: number): Promise<LearningContent> {
  const [chapters, pages, pageLessConcepts] = await Promise.all([
    getBookChapters(bookId),
    getBookPages(bookId),
    getBookConceptsForBookPage(bookId, 0)
  ]);
  const pageRows = await Promise.all(pages.map(async (page) => ({
    exercises: await getExercisesForBookPage([bookId, page.pageNumber]),
    page
  })));
  const pageConceptRows = await Promise.all(pages.map(async (page) => ({
    concepts: await getBookConceptsForBookPage(bookId, page.pageNumber),
    page
  })));
  const content = await Promise.all(chapters.map(async (chapter): Promise<ChapterContent> => {
    const chapterConcepts = [
      ...pageConceptRows.flatMap(({ concepts, page }) => concepts.filter((concept) => concept.chapterId !== undefined
        ? concept.chapterId === chapter.id
        : page.chapter === chapter.title)),
      ...pageLessConcepts.filter(({ chapterId }) => chapterId !== undefined && chapterId === chapter.id)
    ];
    const conceptIds = new Set(chapterConcepts.flatMap(({ id }) => id === undefined ? [] : [id]));
    const exercises = sortExercisesForDisplay(pageRows.flatMap(({ exercises, page }) => exercises.filter(({ conceptId }) => conceptId !== undefined
      ? conceptIds.has(conceptId)
      : page.chapter === chapter.title)));
    const records = (await Promise.all(exercises.flatMap(({ id }) => id === undefined ? [] : [getAbilities(exerciseAbilityModuleId(bookId, id))]))).flat();
    const abilities = sortAbilitiesForDisplay(await Promise.all(records.map(async ({ content, displayOrder, id, moduleId }): Promise<StoredAbility> => {
      try {
        return { ability: parseStoredAbility(await hydrateAbilityContent(content)), content, displayOrder, id, moduleId };
      } catch {
        return { ability: null, content, displayOrder, id, moduleId };
      }
    })));

    return { abilities, chapter, concepts: chapterConcepts, exercises };
  }));

  return {
    allAbilities: content.flatMap(({ abilities }) => abilities),
    allConcepts: content.flatMap(({ concepts }) => concepts),
    allExercises: content.flatMap(({ exercises }) => exercises),
    chapters: content,
    pageRows,
    pages
  };
}

async function deleteExerciseWithAbilities (bookId: number, exerciseId: number): Promise<void> {
  await deleteAbilities(exerciseAbilityModuleId(bookId, exerciseId));
  await deleteExercise(exerciseId);
}

export async function runFixExercisesStage ({ book, command, cost, progress, signal, throwIfAborted }: SkillsStageContext): Promise<void> {
  if (!book.language || !book.subject) {
    throw new Error('Set the book language and subject before Fix exercises.');
  }

  const content = await loadLearningContent(book.id);
  const { allAbilities, allExercises, chapters, pageRows } = content;

  if (!allExercises.length) {
    throw new Error('No Exercises are available to fix.');
  }
  if (allExercises.some(({ id }) => id === undefined)) {
    throw new Error('Every Exercise must have an id before Exercises can be fixed.');
  }

  const client = await requireClient(signal);
  const replacements = new Map<number, Exercise>();
  const duplicateIds = new Set<number>();
  const batches = chapters.filter(({ exercises }) => exercises.length).map(({ chapter, exercises }) => ({ batch: exercises, chapterTitle: chapter.title }));
  let completed = 0;

  await progress(0, allExercises.length, 'Fixing Exercise errors');
  await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async ({ batch, chapterTitle }) => {
    throwIfAborted();
    const originalIds = batch.map(({ id }) => id as number);
    const result = await requestValidatedJson(
      client,
      command.options.model || DEFAULT_PROCESSING_MODEL,
      REPAIR_SYSTEM_PROMPT(book.language as string, book.age),
      FIX_EXERCISES_REQUEST_PROMPT(exerciseRepairInput(book.language as string, batch, chapterTitle, book.age)),
      (value) => parseExerciseRepairResult(value, batch, originalIds),
      true,
      cost,
      undefined,
      undefined,
      2,
      signal
    );

    result.duplicatePairs.forEach(({ deletedExerciseId }) => duplicateIds.add(deletedExerciseId));
    result.reviews.forEach((review) => {
      if (review.hasErrors && review.exercise) {
        const id = batch[review.index]?.id;

        if (id !== undefined && !duplicateIds.has(id)) {
          replacements.set(id, review.exercise);
        }
      }
    });
    completed += batch.length;
    await progress(Math.min(allExercises.length, completed), allExercises.length, 'Fixing Exercise errors');
  });

  duplicateIds.forEach((id) => replacements.delete(id));
  const abilityContentsByExerciseId = new Map<number, string[]>();

  allExercises.forEach(({ id }) => {
    if (id !== undefined) {
      const moduleId = exerciseAbilityModuleId(book.id, id);
      abilityContentsByExerciseId.set(id, allAbilities.filter((record) => record.moduleId === moduleId).map(({ content }) => content));
    }
  });

  for (const { exercises, page } of pageRows) {
    throwIfAborted();
    const pageHasChanges = exercises.some(({ id }) => id !== undefined && (duplicateIds.has(id) || replacements.has(id)));

    if (!pageHasChanges) continue;

    const keptEntries = exercises
      .filter(({ id }) => id === undefined || !duplicateIds.has(id))
      .map((original) => ({ corrected: original.id === undefined ? original : replacements.get(original.id) ?? original, original }));

    await replaceExercisesForBookPage([book.id, page.pageNumber], keptEntries.map(({ corrected }) => exerciseForPageReplacement(corrected)));
    const storedExercises = await getExercisesForBookPage([book.id, page.pageNumber]);

    if (storedExercises.length !== keptEntries.length || storedExercises.some(({ id }) => id === undefined)) {
      throw new Error('Unable to remap Exercises after applying fixes.');
    }

    for (let index = 0; index < keptEntries.length; index++) {
      const oldId = keptEntries[index].original.id;
      const newId = storedExercises[index].id as number;

      if (oldId === undefined) continue;

      const oldModuleId = exerciseAbilityModuleId(book.id, oldId);
      const wasCorrected = replacements.has(oldId);

      if (!wasCorrected && oldId !== newId) {
        const contents = abilityContentsByExerciseId.get(oldId) ?? [];
        if (contents.length) await replaceAbilities(exerciseAbilityModuleId(book.id, newId), contents);
      }
      if (wasCorrected || oldId !== newId) await deleteAbilities(oldModuleId);
    }

    for (const deletedId of exercises.flatMap(({ id }) => id !== undefined && duplicateIds.has(id) ? [id] : [])) {
      await deleteAbilities(exerciseAbilityModuleId(book.id, deletedId));
    }
  }

  await completeBookProcessingStage(book.id, 'fixExercises');
}

export async function runAbilitiesStage ({ book, command, cost, progress, signal, throwIfAborted }: SkillsStageContext): Promise<void> {
  if (!book.language || !book.subject) {
    throw new Error('Set the book language and subject before generating Abilities.');
  }

  const content = await loadLearningContent(book.id);
  const { allAbilities, allConcepts, allExercises, chapters } = content;

  if (!allExercises.length) throw new Error('No Exercises are available to generate Abilities from.');
  if (allExercises.some(({ id }) => id === undefined)) throw new Error('Every Exercise must have an id before Abilities can be generated.');

  const existingModuleIds = new Set(allAbilities.map(({ moduleId }) => moduleId));
  const targets = command.options.onlyMissingAbilities
    ? allExercises.filter(({ id }) => id === undefined || !existingModuleIds.has(exerciseAbilityModuleId(book.id, id)))
    : allExercises;

  if (!targets.length) {
    await completeBookProcessingStage(book.id, 'abilities');
    await progress(allExercises.length, allExercises.length, 'Abilities already complete');
    return;
  }

  const targetIds = new Set(targets.map(({ id }) => id as number));
  const conceptsByIdForGeneration = new Map(allConcepts.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]));
  const sources = chapters.flatMap(({ chapter, exercises }) => exercises
    .filter(({ id }) => id !== undefined && targetIds.has(id))
    .map((exercise) => ({ chapterTitle: chapter.title, exercise, sourceConcept: exercise.conceptId === undefined ? undefined : conceptsByIdForGeneration.get(exercise.conceptId) })));
  const client = await requireClient(signal);
  const generatedByExerciseId = new Map<number, GeneratedAbility[]>();
  const conversionsCache = new Map<number, ExerciseAbilityConversion[]>();
  const pending = new Set(targetIds);
  const maxAttempts = 3;
  let lastError = '';

  await progress(0, targets.length, 'Generating Abilities');
  for (let attempt = 1; attempt <= maxAttempts && pending.size; attempt++) {
    const remaining = sources.filter(({ exercise }) => exercise.id !== undefined && pending.has(exercise.id) && !conversionsCache.has(exercise.id));

    await mapConcurrent(remaining, OPENROUTER_CONCURRENCY, async ({ chapterTitle, exercise, sourceConcept }) => {
      throwIfAborted();
      const systemPrompt = ABILITY_WORKFLOW_SYSTEM_PROMPT(book.language as string, chapterTitle, book.age);
      const runJson: AbilityWorkflowJsonRunner = (prompt, parse, options) => requestValidatedJson(
        client,
        command.options.model || DEFAULT_PROCESSING_MODEL,
        systemPrompt,
        prompt,
        parse,
        true,
        cost,
        options?.maxOutputTokens,
        options?.repairContext,
        options?.validationCycles ?? 1,
        signal
      );

      try {
        const conversions = await generateExerciseAbility(book.language as string, chapterTitle, exercise, runJson, sourceConcept);
        const exerciseId = exercise.id as number;
        const sorted = conversions.sort((a, b) => a.skillIndex - b.skillIndex);

        if (sorted.length) {
          conversionsCache.set(exerciseId, sorted);
          generatedByExerciseId.set(exerciseId, sorted.map(abilityWithImageDescriptions));
          pending.delete(exerciseId);
          await progress(generatedByExerciseId.size, targets.length, 'Generating Abilities');
        }
      } catch (reason) {
        if (signal.aborted) throw reason;
        lastError = conceptGenerationErrorMessage(reason);
      }
    });
  }

  for (const [exerciseId, abilities] of generatedByExerciseId) {
    throwIfAborted();
    await replaceAbilities(exerciseAbilityModuleId(book.id, exerciseId), abilities.map((ability) => JSON.stringify(ability)));
  }

  if (generatedByExerciseId.size || allAbilities.length) {
    await completeBookProcessingStage(book.id, 'abilities');
  }

  if (!generatedByExerciseId.size && pending.size && !allAbilities.length) {
    throw new Error(`No Abilities were generated after ${maxAttempts} attempts.${lastError ? ` Last attempt: ${lastError}` : ''}`);
  }
}

export async function runFixAbilitiesStage ({ book, command, cost, progress, signal, throwIfAborted }: SkillsStageContext): Promise<void> {
  if (!book.language || !book.subject) {
    throw new Error('Set the book language and subject before Fix abilities.');
  }

  const content = await loadLearningContent(book.id);
  const { allAbilities, allConcepts, allExercises, chapters, pages } = content;

  if (!allAbilities.length) {
    await completeBookProcessingStage(book.id, 'fixAbilities');
    return;
  }

  const client = await requireClient(signal);
  const embeddingModel = command.options.embeddingModel || await getSetting(SettingKey.CONCEPTS_EMBEDDER) || DEFAULT_STANDARDS_EMBEDDER;
  const exercisesByModuleId = new Map(allExercises.flatMap((exercise) => exercise.id === undefined ? [] : [[exerciseAbilityModuleId(book.id, exercise.id), exercise] as const]));
  const conceptsById = new Map(allConcepts.flatMap((concept) => concept.id === undefined ? [] : [[concept.id, concept] as const]));

  await progress(0, allAbilities.length, 'Checking Ability/Exercise alignment');
  const embeddingHints = await buildAbilityEmbeddingValidationHints(
    client,
    embeddingModel,
    allAbilities.map((record) => ({ ability: record.ability, abilityId: record.id, exercise: exercisesByModuleId.get(record.moduleId) })),
    cost,
    signal
  );
  const replacements = new Map<string, { ability: GeneratedAbility; record: StoredAbility }>();
  const duplicatePairs = new Map<string, { deleted: StoredAbility; kept: StoredAbility }>();
  const batches = chapters.filter(({ abilities }) => abilities.length).map(({ abilities, chapter }) => ({ batch: abilities, chapterTitle: chapter.title }));
  let completed = 0;

  await progress(0, allAbilities.length, 'Fixing Ability errors');
  await mapConcurrent(batches, OPENROUTER_CONCURRENCY, async ({ batch, chapterTitle }) => {
    throwIfAborted();
    const result = await requestValidatedJson(
      client,
      command.options.model || DEFAULT_PROCESSING_MODEL,
      REPAIR_SYSTEM_PROMPT(book.language as string, book.age),
      FIX_ABILITIES_REQUEST_PROMPT(abilityRepairInput(book.language as string, batch, chapterTitle, book.age, embeddingHints, exercisesByModuleId, conceptsById)),
      (value) => parseAbilityRepairResult(value, batch.map(({ ability }) => ability), batch.map(({ id }) => id)),
      true,
      cost,
      undefined,
      undefined,
      2,
      signal
    );
    const duplicateIds = new Set(result.duplicatePairs.map(({ deletedAbilityId }) => deletedAbilityId));

    result.duplicatePairs.forEach(({ deletedAbilityId, keptAbilityId }) => {
      const deleted = batch.find(({ id }) => id === deletedAbilityId);
      const kept = batch.find(({ id }) => id === keptAbilityId);
      if (!deleted || !kept) throw new Error('OpenRouter returned a duplicate Ability pair that does not exist in this chapter.');
      duplicatePairs.set(deletedAbilityId, { deleted, kept });
    });
    result.reviews.forEach((review) => {
      if (review.hasErrors && review.ability) {
        const record = batch[review.index];
        if (record && !duplicateIds.has(record.id)) replacements.set(record.id, { ability: review.ability, record });
      }
    });
    completed += batch.length;
    await progress(Math.min(allAbilities.length, completed), allAbilities.length, 'Fixing Ability errors');
  });

  duplicatePairs.forEach((_, id) => replacements.delete(id));
  const duplicateConceptIds = new Set<number>();
  const duplicateExerciseIds = new Set<number>();

  duplicatePairs.forEach(({ deleted }) => {
    const exercise = exercisesByModuleId.get(deleted.moduleId);
    if (exercise?.id !== undefined) duplicateExerciseIds.add(exercise.id);
    if (exercise?.conceptId !== undefined) duplicateConceptIds.add(exercise.conceptId);
  });

  for (const { ability, record } of replacements.values()) {
    throwIfAborted();
    const sourceExercise = exercisesByModuleId.get(record.moduleId);
    if (sourceExercise?.id !== undefined && (duplicateExerciseIds.has(sourceExercise.id) || (sourceExercise.conceptId !== undefined && duplicateConceptIds.has(sourceExercise.conceptId)))) continue;
    const newId = await storeAbility(record.moduleId, JSON.stringify(ability), record.displayOrder);
    if (newId !== record.id) await deleteAbility(record.id);
  }

  const pageNumbers = pages.map(({ pageNumber }) => pageNumber);
  for (const conceptId of duplicateConceptIds) {
    const concept = conceptsById.get(conceptId);
    if (concept) await deleteConceptAndDependencies(book.id, concept, pageNumbers);
  }
  for (const exerciseId of duplicateExerciseIds) {
    const exercise = allExercises.find(({ id }) => id === exerciseId);
    if (exercise?.conceptId === undefined) await deleteExerciseWithAbilities(book.id, exerciseId);
  }
  for (const { deleted } of duplicatePairs.values()) {
    if (!exercisesByModuleId.get(deleted.moduleId)) await deleteAbility(deleted.id);
  }

  await completeBookProcessingStage(book.id, 'fixAbilities');
}

function imageGenerationTargets (abilities: StoredAbility[]): Array<{ exerciseIndex: number; field: 'p' | 'i'; imageId: number; record: StoredAbility; visualPrompt: string }> {
  return abilities.flatMap((record) => record.ability
    ? record.ability.q.flatMap((exercise, exerciseIndex) => (['p', 'i'] as const).flatMap((field) => {
      const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
      const value = exercise[field].trim();
      const storedPrompt = exercise[promptField]?.trim() ?? '';
      const visualPrompt = storedPrompt || (!isTikzCode(value) ? value : '');
      const imageId = storedAbilityImageId(record, exerciseIndex, field);

      return visualPrompt && imageId !== undefined ? [{ exerciseIndex, field, imageId, record, visualPrompt }] : [];
    }))
    : []);
}

export async function runImagesStage ({ book, command, cost, progress, signal, throwIfAborted }: SkillsStageContext): Promise<void> {
  if (!book.language || !book.subject) throw new Error('Set the book language and subject before Images.');
  const { allAbilities } = await loadLearningContent(book.id);
  const allTargets = imageGenerationTargets(allAbilities);
  const targets = command.options.onlyMissingImages
    ? allTargets.filter(({ exerciseIndex, field, record }) => !isTikzCode(record.ability?.q[exerciseIndex]?.[field] ?? ''))
    : allTargets;

  if (!targets.length) {
    await resetBookProcessingStagesFrom(book.id, 'images');
    await completeBookProcessingStage(book.id, 'images');
    await progress(1, 1, 'Images complete');
    return;
  }

  const client = await requireClient(signal);
  let completed = 0;

  await progress(0, targets.length, 'Converting visual prompts to TikZ');
  await mapConcurrent(targets, OPENROUTER_CONCURRENCY, async ({ exerciseIndex, field, imageId, record, visualPrompt }) => {
    throwIfAborted();
    if (!record.ability) return;
    const tikz = cleanTikzResponse(await requestChatContentWithTruncationRetry(
      client,
      command.options.model || DEFAULT_PROCESSING_MODEL,
      'You convert precise educational visual specifications into valid, compact TikZ code. Follow the requested output contract exactly.',
      tikzRequestPrompt(book.language as string, record.ability, exerciseIndex, field, visualPrompt, book.age),
      false,
      cost,
      2_400,
      signal
    ));
    const image = await getImage(imageId);
    if (!image) throw new Error(`Image ${imageId} referenced by Ability ${record.id} was not found.`);
    await putImage({ ...image, data: tikz, prompt: visualPrompt, type: 'tikz', valid: undefined });
    completed++;
    await progress(completed, targets.length, 'Converting visual prompts to TikZ');
  });

  await resetBookProcessingStagesFrom(book.id, 'images');
  await completeBookProcessingStage(book.id, 'images');
}

function imageFixTargets (abilities: StoredAbility[]): ImageFixTarget[] {
  return abilities.flatMap((record) => record.ability
    ? record.ability.q.flatMap((exercise, exerciseIndex) => (['p', 'i'] as const).flatMap((field) => {
      const value = exercise[field];
      if (!value.trim() || !isTikzCode(value)) return [];
      const promptField = field === 'p' ? 'pPrompt' : 'iPrompt';
      const imageId = storedAbilityImageId(record, exerciseIndex, field);

      return imageId === undefined ? [] : [{ ability: record.ability as GeneratedAbility, exerciseIndex, field, imageId, originalTikz: value, prompt: exercise[promptField]?.trim() ?? '', record }];
    }))
    : []);
}

async function renderStoredTikz (services: BookProcessingWorkerServices, imageId: number, value: string): Promise<TikzPreRenderResult> {
  const image = await getImage(imageId);
  if (!image) throw new Error(`Image ${imageId} was not found while validating TikZ.`);
  const result = await services.renderTikz(value);
  const current = await getImage(imageId);

  if (current && current.data === value) {
    const nextValid = result.compiled ? true : result.retryable ? undefined : false;
    if (nextValid !== undefined && current.valid !== nextValid) await putImage({ ...current, valid: nextValid });
  }

  return result;
}

export async function runFixImagesStage ({ book, command, cost, progress, services, signal, throwIfAborted }: SkillsStageContext): Promise<void> {
  if (!book.language || !book.subject) throw new Error('Set the book language and subject before Fix images.');
  const { allAbilities } = await loadLearningContent(book.id);
  const targets = imageFixTargets(allAbilities);

  if (!targets.length) {
    await completeBookProcessingStage(book.id, 'fixImages');
    await progress(1, 1, 'No TikZ visuals to check');
    return;
  }

  const client = await requireClient(signal);
  let completed = 0;
  let changed = false;

  await progress(0, targets.length, 'Reviewing TikZ visuals');
  await mapConcurrent(targets, TIKZ_RENDER_CONCURRENCY, async (target) => {
    throwIfAborted();
    const originalPreRender = await renderStoredTikz(services, target.imageId, target.originalTikz);
    const regenerateFromSpecification = async (errors: string[]): Promise<TikzAiReview> => {
      const role = target.field === 'p' ? 'question' : 'solution';
      const visualPrompt = target.prompt || `Create the required ${role} visual for this exercise from the exercise text and correct answer. Preserve only information appropriate for a ${role} visual.`;
      const tikz = cleanTikzResponse(await requestChatContent(
        client,
        command.options.model || DEFAULT_PROCESSING_MODEL,
        'You regenerate educational diagrams as compact, browser-renderable TikZ. Return only one TikZ picture block.',
        tikzRequestPrompt(book.language as string, target.ability, target.exerciseIndex, target.field, visualPrompt, book.age),
        false,
        cost,
        4_000,
        signal
      ));
      if (tikz.trim() === target.originalTikz.trim()) throw new Error(`TikZ regeneration for ${target.ability.h} returned the unchanged rejected source.`);
      return { errors: Array.from(new Set([...errors, 'Regenerated TikZ from the original visual specification after repair attempts did not produce a usable source.'])), hasErrors: true, tikz };
    };

    let review = await requestValidatedJson(
      client,
      command.options.model || DEFAULT_PROCESSING_MODEL,
      'You are a strict educational diagram QA reviewer and TikZ repair expert. Return only the requested JSON object.',
      tikzFixReviewPrompt(book.language as string, target, originalPreRender, book.age),
      parseTikzAiReview,
      true,
      cost,
      TIKZ_REVIEW_MAX_OUTPUT_TOKENS,
      undefined,
      2,
      signal
    );

    if (!originalPreRender.compiled && !review.hasErrors) {
      review = { errors: ['TikZ Editor pre-render failed; the TikZ must be repaired before this visual can be accepted.'], hasErrors: true, tikz: review.tikz };
    }
    if (review.hasErrors && review.tikz.trim() === target.originalTikz.trim()) {
      review = await requestValidatedJson(
        client,
        command.options.model || DEFAULT_PROCESSING_MODEL,
        'You must apply the TikZ corrections you identified. Return only the requested JSON object.',
        tikzDetectedProblemsRepairPrompt(book.language as string, target, review, originalPreRender, book.age),
        parseTikzAiReview,
        true,
        cost,
        TIKZ_REVIEW_MAX_OUTPUT_TOKENS,
        undefined,
        2,
        signal
      );
      if (!review.hasErrors || review.tikz.trim() === target.originalTikz.trim()) review = await regenerateFromSpecification(review.errors);
    }

    let fixedPreRender = review.hasErrors ? await services.renderTikz(review.tikz) : originalPreRender;

    for (let attempt = 0; review.hasErrors && !fixedPreRender.compiled && attempt < 2; attempt++) {
      const rejectedTikz = review.tikz;
      const repaired = await requestValidatedJson(
        client,
        command.options.model || DEFAULT_PROCESSING_MODEL,
        'You repair rejected TikZ using real TikZ Editor pre-render diagnostics. Return only the requested JSON object.',
        tikzCompileRepairPrompt(book.language as string, target, review, fixedPreRender, book.age),
        parseTikzAiReview,
        true,
        cost,
        TIKZ_REVIEW_MAX_OUTPUT_TOKENS,
        undefined,
        2,
        signal
      );
      review = repaired.hasErrors ? repaired : { errors: review.errors.length ? review.errors : ['TikZ Editor pre-render failure was repaired.'], hasErrors: true, tikz: repaired.tikz };
      if (review.tikz === rejectedTikz && !fixedPreRender.retryable) review = await regenerateFromSpecification([...review.errors, ...fixedPreRender.diagnostics.map((item) => `Renderer: ${item}`)]);
      fixedPreRender = await services.renderTikz(review.tikz);
    }

    if (review.hasErrors && !fixedPreRender.compiled) {
      throw new Error(`Unable to produce renderable TikZ for ${target.ability.h}. ${fixedPreRender.diagnostics.slice(-6).join(' | ')}`);
    }

    if (review.hasErrors && review.tikz.trim() !== target.originalTikz.trim()) {
      const image = await getImage(target.imageId);
      if (!image) throw new Error(`Image ${target.imageId} referenced by Ability ${target.record.id} was not found.`);
      await putImage({ ...image, data: review.tikz, prompt: target.prompt || image.prompt, type: 'tikz', valid: true });
      changed = true;
    }

    completed++;
    await progress(completed, targets.length, 'Reviewing TikZ visuals');
  });

  if (changed) await resetBookProcessingStagesFrom(book.id, 'fixImages');
  await completeBookProcessingStage(book.id, 'fixImages');
}

export type { SkillsStageContext };
