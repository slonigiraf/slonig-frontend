// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, BookProcessingStageKey, Exercise } from '@slonigiraf/db';
import { deleteAbilities, getAbilities, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, isBookProcessingStageComplete, replaceAbilities, replaceExercisesForBookPage, SettingKey } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { mapConcurrent } from '../../../../common/concurrency.js';
import { OPENROUTER_CONCURRENCY, openRouterRequestGate } from '../../../../openrouter/concurrency.js';
import { reportOpenRouterCost } from '../../../../openrouter/cost.js';
import { processExtractedChapterContent } from '../../../book/application/processing/bookProcessing.js';
import { DEFAULT_STANDARDS_MODEL } from '../../../book/application/config.js';
import { type ConceptChapterNavigationItem } from '../../../book/domain/concepts/conceptRecognition.js';
import { bookLanguageLabel } from '../../../book/domain/metadata/bookLanguage.js';
import { hasChapterStandards, needsChapterStandardsIdentification, standardsChapterKey, standardsConceptFingerprint, standardsConceptInputs, standardsPathForBookSubject, type StoredBookStandards } from '../../../book/domain/standards/standards.js';
import { loadStandardsCatalogsForBookSubject } from '../../../book/infrastructure/standards/standardsCatalog.js';
import { storeBookStandards } from '../../../book/infrastructure/storage/standardsStorage.js';
import { cachedConceptEmbeddingMap, ensureStandardEmbeddingCache } from '../../../book/infrastructure/ai/standardsEmbeddings.js';
import { stripMarkdownImageReferences } from '../../../book/infrastructure/pdf/bookImageRefs.js';
import { createOpenRouterClient, getChapterStandardsConceptRows, requestChapterStandards } from '../../../book/application/workspace/bookReaderProcessing.js';
import { conceptsForNavigationChapter, exerciseAbilityModuleId, exerciseForPageReplacement, getBookConceptInventory } from '../../../book/application/workspace/bookReaderWorkspace.js';
import { type ReaderPane } from '../../../shared/types/bookWorkspace.js';
interface UseBookLearningContentProcessingOptions {
  addExercisesCost: (costUsd: number) => void;
  addStandardsCost: (costUsd: number) => void;
  book: Book;
  completeStage: (stage: BookProcessingStageKey) => Promise<void>;
  conceptChapters: ConceptChapterNavigationItem[];
  currentReaderProcessingSignal: () => AbortSignal;
  embeddingModel: string;
  generateAllConceptsModel: string;
  generateOnlyMissingExercises: boolean;
  isAssigningStandards: boolean;
  isGeneratingAllConcepts: boolean;
  isGeneratingAllExercises: boolean;
  isIdentifyingChapters: boolean;
  isRecognizingAll: boolean;
  isRefiningChapters: boolean;
  onProcessingComplete: () => void;
  pages: Map<number, BookPage>;
  processingPage?: number;
  refreshEntityCounts: () => Promise<void>;
  revealPane: (pane: ReaderPane) => void;
  setConceptEmbeddingsRefreshToken: Dispatch<SetStateAction<number>>;
  setError: Dispatch<SetStateAction<string>>;
  setGeneratedExercisesPageCount: Dispatch<SetStateAction<number>>;
  setIsAssigningStandards: Dispatch<SetStateAction<boolean>>;
  setIsGeneratingAllExercises: Dispatch<SetStateAction<boolean>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
  setStandardsAssignedChapterCount: Dispatch<SetStateAction<number>>;
  setStandardsTargetChapterCount: Dispatch<SetStateAction<number>>;
  setStandardsByChapter: Dispatch<SetStateAction<StoredBookStandards>>;
  standardsByChapter: StoredBookStandards;
  standardsModel: string;
  totalPages: number;
}

export function useBookLearningContentProcessing ({
  addExercisesCost,
  addStandardsCost,
  book,
  completeStage,
  conceptChapters,
  currentReaderProcessingSignal,
  embeddingModel,
  generateAllConceptsModel,
  generateOnlyMissingExercises,
  isAssigningStandards,
  isGeneratingAllConcepts,
  isGeneratingAllExercises,
  isIdentifyingChapters,
  isRecognizingAll,
  isRefiningChapters,
  onProcessingComplete,
  pages,
  processingPage,
  refreshEntityCounts,
  revealPane,
  setConceptEmbeddingsRefreshToken,
  setError,
  setGeneratedExercisesPageCount,
  setIsAssigningStandards,
  setIsGeneratingAllExercises,
  setOpenRouterSpent,
  setSkillsRefreshToken,
  setStandardsAssignedChapterCount,
  setStandardsTargetChapterCount,
  setStandardsByChapter,
  standardsByChapter,
  standardsModel,
  totalPages
}: UseBookLearningContentProcessingOptions) {
  const generateAllExercises = useCallback(async (): Promise<void> => {
    if (!totalPages || processingPage !== undefined || isGeneratingAllConcepts || isRecognizingAll || isGeneratingAllExercises || isIdentifyingChapters || isRefiningChapters) {
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

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const storedPages = (await getBookPages(book.id))
        .filter(({ chapter, chapterId, conceptsProcessed, excludedFromAnalysis }) => conceptsProcessed && !excludedFromAnalysis && (chapterId !== undefined || Boolean(chapter.trim())))
        .sort((a, b) => a.pageNumber - b.pageNumber);
      const pageRows = await Promise.all(storedPages.map(async (storedPage) => {
        const [concepts, exercises] = await Promise.all([
          getBookConceptsForBookPage(book.id, storedPage.pageNumber),
          getExercisesForBookPage([book.id, storedPage.pageNumber])
        ]);

        return { concepts, exercises, storedPage };
      }));
      const conceptInventory = pageRows.flatMap(({ concepts }) => concepts);
      const exerciseConceptIds = new Set(pageRows.flatMap(({ exercises }) => exercises.flatMap(({ conceptId }) => conceptId === undefined ? [] : [conceptId])));
      const existingExercisesByPage = new Map(pageRows.map(({ exercises, storedPage }) => [storedPage.pageNumber, exercises] as const));
      const chapterInputs = conceptChapters.flatMap((chapter) => {
        const chapterConcepts = conceptsForNavigationChapter(conceptInventory, chapter);
        const targetConcepts = chapterConcepts.filter(({ id }) => !generateOnlyMissingExercises || id === undefined || !exerciseConceptIds.has(id));

        if (targetConcepts.some(({ id }) => id === undefined)) {
          throw new Error(`Every Concept must have an id before Exercises can be generated (${chapter.title || 'untitled chapter'}).`);
        }

        const conceptsByPage = new Map<number, BookConcept[]>();

        targetConcepts.forEach((concept) => {
          const pageConcepts = conceptsByPage.get(concept.bookPage[1]) ?? [];

          pageConcepts.push(concept);
          conceptsByPage.set(concept.bookPage[1], pageConcepts);
        });
        const chapterPages = Array.from(conceptsByPage.entries())
          .sort(([a], [b]) => a - b)
          .map(([conceptPageNumber, concepts]) => ({
            concepts: concepts.map(({ description, id, title }) => ({ description, sourceId: id as number, title })),
            pageNumber: conceptPageNumber
          }));

        return chapterPages.length ? [{ chapter: chapter.title, pages: chapterPages }] : [];
      });
      const generatedExercisesByPage = new Map<number, Array<Omit<Exercise, 'bookPage' | 'id'>>>();

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
          const pageExercises = generatedExercisesByPage.get(processed.pageNumber) ?? [];

          pageExercises.push(...generatedExercises);
          generatedExercisesByPage.set(processed.pageNumber, pageExercises);
        }
      });

      for (const { storedPage } of pageRows) {
        const generatedExercises = generatedExercisesByPage.get(storedPage.pageNumber) ?? [];
        const originalExercises = existingExercisesByPage.get(storedPage.pageNumber) ?? [];

        if (generateOnlyMissingExercises && !generatedExercises.length) {
          setGeneratedExercisesPageCount((count) => count + 1);
          continue;
        }

        const abilityContentsByExerciseId = new Map<number, string[]>();

        if (generateOnlyMissingExercises) {
          await Promise.all(originalExercises.map(async ({ id }) => {
            if (id !== undefined) {
              abilityContentsByExerciseId.set(id, (await getAbilities(exerciseAbilityModuleId(book.id, id))).map(({ content }) => content));
            }
          }));
        }

        const replacements = generateOnlyMissingExercises
          ? [...originalExercises.map(exerciseForPageReplacement), ...generatedExercises]
          : generatedExercises;

        await replaceExercisesForBookPage([book.id, storedPage.pageNumber], replacements);

        if (generateOnlyMissingExercises) {
          const storedExercises = await getExercisesForBookPage([book.id, storedPage.pageNumber]);

          if (storedExercises.length !== replacements.length || storedExercises.some(({ id }) => id === undefined)) {
            throw new Error(`Unable to preserve existing Exercises while adding missing Exercises on page ${storedPage.pageNumber}.`);
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
        }

        setGeneratedExercisesPageCount((count) => count + 1);
      }

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
  }, [currentReaderProcessingSignal, addExercisesCost, completeStage, book.age, book.id, book.language, conceptChapters, generateAllConceptsModel, generateOnlyMissingExercises, isGeneratingAllConcepts, isIdentifyingChapters, isRecognizingAll, isRefiningChapters, isGeneratingAllExercises, onProcessingComplete, pages, processingPage, refreshEntityCounts, revealPane, totalPages]);

  const assignStandards = useCallback(async (force = false): Promise<void> => {
    if (!conceptChapters.length || isAssigningStandards) {
      return;
    }

    if (!isBookProcessingStageComplete(book, 'fixImages')) {
      setError('Complete Fix images before identifying Standards.');
      return;
    }

    if (!isBookProcessingStageComplete(book, 'embeddings')) {
      setError('Complete Embedings before identifying Standards.');
      return;
    }

    setError('');
    setIsAssigningStandards(true);
    setStandardsAssignedChapterCount(0);
    setStandardsTargetChapterCount(0);
    setOpenRouterSpent(0);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const catalogs = await loadStandardsCatalogsForBookSubject(book.subject);
      const conceptInventory = await getBookConceptInventory(book.id, pages.keys());
      const conceptEmbeddings = await cachedConceptEmbeddingMap(embeddingModel, conceptInventory);
      const missingConceptEmbeddings = conceptInventory.filter(({ id, title, description }) => (
        id !== undefined && Number.isSafeInteger(id) && id > 0 && (title.trim() || description.trim()) && !conceptEmbeddings.has(id)
      ));

      if (missingConceptEmbeddings.length) {
        throw new Error('Concept Embedings are missing or stale for the selected model. Run Embedings again before Standards.');
      }

      // Determine the chapters to retry before making expensive OpenRouter calls.
      // Preserve successful chapter mappings, even on a partial run.
      const requests = conceptChapters.map((chapter) => {
        const rows = getChapterStandardsConceptRows(conceptInventory, chapter);
        const concepts = standardsConceptInputs(rows);
        const fingerprint = standardsConceptFingerprint(concepts, standardsPathForBookSubject(book.subject) ?? 'no-standards');
        const chapterKey = standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers);

        return { chapter, chapterKey, concepts, fingerprint, rows };
      }).filter(({ chapterKey, fingerprint }) => needsChapterStandardsIdentification(standardsByChapter[chapterKey], fingerprint, force));

      setStandardsTargetChapterCount(requests.length);

      if (!requests.length) {
        await completeStage('standards');
        revealPane('standards');
        return;
      }

      const standardEmbeddings = await ensureStandardEmbeddingCache(client, embeddingModel, catalogs, addStandardsCost);

      setConceptEmbeddingsRefreshToken((token) => token + 1);
      const results = await mapConcurrent(requests, OPENROUTER_CONCURRENCY, async ({ chapter, chapterKey, concepts, fingerprint, rows }) => {
        try {
          const chapterEmbeddings = rows.flatMap(({ id }) => id === undefined ? [] : (conceptEmbeddings.get(id) ? [conceptEmbeddings.get(id) as number[]] : []));
          const standards = await requestChapterStandards(client, standardsModel || DEFAULT_STANDARDS_MODEL, chapter.title, concepts, chapterEmbeddings, catalogs, standardEmbeddings, addStandardsCost);

          return { chapterKey, entry: { conceptFingerprint: fingerprint, standards }, status: 'fulfilled' as const };
        } catch (reason) {
          return { chapterKey, reason, status: 'rejected' as const };
        } finally {
          setStandardsAssignedChapterCount((count) => count + 1);
        }
      });
      const next = { ...standardsByChapter };
      let failures = 0;
      let succeeded = 0;

      results.forEach((result) => {
        if (result.status === 'rejected') {
          failures++;
        } else {
          succeeded++;
          next[result.chapterKey] = result.entry;
        }
      });

      setStandardsByChapter(next);
      storeBookStandards(book.id, next);
      revealPane('standards');

      // A partial run is successful: available mappings remain usable, and
      // missing chapters are clearly marked for a targeted retry.
      if (succeeded || conceptChapters.some((chapter) => hasChapterStandards(next[standardsChapterKey(chapter.chapterId, chapter.title, chapter.pageNumbers)]))) {
        await completeStage('standards');
      }

      if (failures) {
        setError(`${failures} of ${requests.length} chapter${requests.length === 1 ? '' : 's'} could not have standards identified. Successful chapters were saved. Retry only chapters missing standards.`);
      }
    } finally {
      setIsAssigningStandards(false);
    }
  }, [currentReaderProcessingSignal, addStandardsCost, completeStage, book, book.id, book.subject, conceptChapters, embeddingModel, isAssigningStandards, pages, revealPane, standardsByChapter, standardsModel]);

  return {
    assignStandards,
    generateAllExercises
  } as const;
}
