// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import {
  createBook,
  createBookConcept,
  deleteBook,
  getAbilities,
  getBookChapters,
  getBookConceptsForBookPage,
  getBookPages,
  getConceptEmbeddings,
  getExercisesForBookPage,
  getSkillsForChapter,
  putBookPage,
  putConceptEmbeddings,
  replaceBookChapterAssignments,
  replaceExercisesForBookPage,
  replaceSkillsForChapter,
  resetBookProcessingStagesFrom,
  storeAbility
} from './index.js';

async function seedLearningArtifacts(label: string) {
  const bookId = await createBook({
    contentHash: `stage-invalidation-${label}-${Date.now()}-${Math.random()}`,
    created: Date.now(),
    name: `Stage invalidation ${label}`,
    opfsName: `${label}.pdf`,
    size: 1
  });

  await putBookPage({
    bookId,
    chapter: '',
    conceptsProcessed: true,
    pageNumber: 1
  });

  const [chapter] = await replaceBookChapterAssignments(bookId, [{ startPage: 1, title: 'Numbers' }]);

  if (chapter.id === undefined) {
    throw new Error('Expected a stored chapter id.');
  }

  const concept = await createBookConcept({
    attempt: 0,
    bookPage: [bookId, 1],
    chapterId: chapter.id,
    description: 'Write the numeral zero.',
    title: 'Writing numeral 0'
  });

  if (concept.id === undefined) {
    throw new Error('Expected a stored concept id.');
  }

  await putConceptEmbeddings([{
    bookId,
    embedding: [1, 0],
    id: concept.id,
    input: `${concept.title}\n${concept.description}`,
    model: 'test-embedder'
  }]);

  const [exercise] = await replaceExercisesForBookPage([bookId, 1], [{
    conceptId: concept.id,
    description: 'Write 0.',
    solution: '0',
    source: 'generated',
    title: 'Write zero'
  }]);

  if (exercise.id === undefined) {
    throw new Error('Expected a stored exercise id.');
  }

  await replaceSkillsForChapter(chapter.id, [{
    bookConceptIds: [concept.id],
    description: 'Write zero.',
    exerciseIds: [exercise.id],
    rank: 0,
    title: 'Write zero'
  }]);

  const abilityModuleId = `book-${bookId}-exercise-${exercise.id}`;

  await storeAbility(abilityModuleId, JSON.stringify({ h: 'Write zero', i: '0', q: [], t: 1 }));

  return { abilityModuleId, bookId, chapterId: chapter.id, conceptId: concept.id };
}

describe('book stage entity invalidation', (): void => {
  it('wipes Concepts and all later persisted learning entities when Chapters is rerun', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('chapters');

    try {
      await resetBookProcessingStagesFrom(seeded.bookId, 'chapters');

      assert.equal((await getBookChapters(seeded.bookId)).length, 1, 'the Chapters stage owns the chapter rows, so they remain for the rerun to replace');
      assert.equal((await getBookConceptsForBookPage(seeded.bookId, 1)).length, 0);
      assert.equal((await getConceptEmbeddings([seeded.conceptId])).length, 0);
      assert.equal((await getExercisesForBookPage([seeded.bookId, 1])).length, 0);
      assert.equal((await getSkillsForChapter(seeded.chapterId)).length, 0);
      assert.equal((await getAbilities(seeded.abilityModuleId)).length, 0);
      assert.equal((await getBookPages(seeded.bookId))[0]?.conceptsProcessed, false);
    } finally {
      await deleteBook(seeded.bookId);
    }
  });

  it('keeps reviewed Concepts but wipes Embedings and later entities when Fix concepts is rerun', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('fix-concepts');

    try {
      await resetBookProcessingStagesFrom(seeded.bookId, 'fixConcepts');

      assert.equal((await getBookConceptsForBookPage(seeded.bookId, 1)).length, 1);
      assert.equal((await getConceptEmbeddings([seeded.conceptId])).length, 0);
      assert.equal((await getExercisesForBookPage([seeded.bookId, 1])).length, 0);
      assert.equal((await getSkillsForChapter(seeded.chapterId)).length, 0);
      assert.equal((await getAbilities(seeded.abilityModuleId)).length, 0);
    } finally {
      await deleteBook(seeded.bookId);
    }
  });
});
