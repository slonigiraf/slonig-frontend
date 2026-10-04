// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage, BookStageSpendKey, Exercise } from '@slonigiraf/db';
import { deleteAbilities, getAbilities, getExercisesForBookPage, getSetting, replaceAbilities, replaceExercisesForBookPage, SettingKey } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback } from 'react';
import { openRouterRequestGate } from '../../openrouter/concurrency.js';
import { reportOpenRouterCost } from '../../openrouter/cost.js';
import { FIX_EXERCISES_REQUEST_PROMPT, REPAIR_SYSTEM_PROMPT } from '../book/prompts/abilities.js';
import { parseExerciseRepairResult } from '../book/processing/exercises/exercises.js';
import { createOpenRouterClient } from './BookReaderProcessing.js';
import { exerciseAbilityModuleId, exerciseForPageReplacement, exercisesForExerciseChapter, singleExerciseRepairInput, type ExerciseChapterNavigationItem, type ExerciseEditableFields } from './BookReaderUtils.js';

interface UseBookExerciseEditorOptions {
  addOpenRouterStageCost: (stage: BookStageSpendKey, costUsd: number) => void;
  book: Book;
  currentExerciseChapter?: ExerciseChapterNavigationItem;
  exerciseChapterConcepts: BookConcept[];
  generateAllConceptsModel: string;
  pages: Map<number, BookPage>;
  refreshEntityCounts: () => Promise<void>;
  setError: Dispatch<SetStateAction<string>>;
  setExerciseChapterExercises: Dispatch<SetStateAction<Exercise[]>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
}

export function useBookExerciseEditor ({
  addOpenRouterStageCost,
  book,
  currentExerciseChapter,
  exerciseChapterConcepts,
  generateAllConceptsModel,
  pages,
  refreshEntityCounts,
  setError,
  setExerciseChapterExercises,
  setSkillsRefreshToken
}: UseBookExerciseEditorOptions) {
  const saveExercise = useCallback(async (exerciseId: number, value: ExerciseEditableFields): Promise<void> => {
    if (!currentExerciseChapter) {
      throw new Error('Unable to find the chapter containing this Exercise.');
    }

    try {
      const pageRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => ({
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

      const refreshedRows = await Promise.all(Array.from(pages.keys()).map(async (chapterPageNumber) => ({
        exercises: await getExercisesForBookPage([book.id, chapterPageNumber]),
        pageNumber: chapterPageNumber
      })));

      setExerciseChapterExercises(exercisesForExerciseChapter(refreshedRows, exerciseChapterConcepts, currentExerciseChapter));
      setSkillsRefreshToken((token) => token + 1);
      await refreshEntityCounts();
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save the Exercise.';

      setError(message);
      throw caught;
    }
  }, [book.id, currentExerciseChapter, exerciseChapterConcepts, pages, refreshEntityCounts]);

  const fixExerciseWithAi = useCallback(async (exercise: Exercise): Promise<void> => {
    if (exercise.id === undefined || !currentExerciseChapter) {
      throw new Error('Unable to fix an Exercise without its chapter context.');
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      throw new Error('OpenRouter API key is not configured.');
    }

    const language = book.language ?? '';
    const client = createOpenRouterClient(key);
    const response = await openRouterRequestGate.run(() => client.chat.completions.create({
      messages: [
        { content: REPAIR_SYSTEM_PROMPT(language, book.age), role: 'system' },
        { content: FIX_EXERCISES_REQUEST_PROMPT(singleExerciseRepairInput(language, exercise, currentExerciseChapter.title, book.age)), role: 'user' }
      ],
      model: generateAllConceptsModel,
      response_format: { type: 'json_object' }
    }));

    reportOpenRouterCost(response, (costUsd) => addOpenRouterStageCost('fixExercises', costUsd));
    const content = response.choices[0].message?.content?.trim();

    if (!content) {
      throw new Error('OpenRouter returned no single Exercise repair data.');
    }

    const result = parseExerciseRepairResult(content, [exercise], [exercise.id]);
    const review = result.reviews.find(({ index }) => index === 0);

    if (review?.hasErrors && review.exercise) {
      await saveExercise(exercise.id, {
        description: review.exercise.description,
        imageDescription: review.exercise.imageDescription,
        solution: review.exercise.solution,
        solutionImageDescription: review.exercise.solutionImageDescription,
        title: review.exercise.title
      });
    }
  }, [addOpenRouterStageCost, book.age, book.language, currentExerciseChapter, generateAllConceptsModel, saveExercise]);


  return {
    fixExerciseWithAi,
    saveExercise
  } as const;
}
