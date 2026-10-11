// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import {
  createBook,
  createBookConcept,
  createImage,
  deleteBook,
  getAbilities,
  getBookChapters,
  getBookConceptsForBookPage,
  getBookPages,
  getConceptEmbeddings,
  getExercisesForBookPage,
  getImage,
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

      assert.equal((await getBookChapters(seeded.bookId)).length, 0, 'a full Chapters rerun deletes its previous rows');
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

  it('preserves existing Chapters during an explicitly targeted missing-only retry', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('chapters-missing');

    try {
      await resetBookProcessingStagesFrom(seeded.bookId, 'chapters', { onlyMissing: true });

      assert.equal((await getBookChapters(seeded.bookId)).length, 1);
      assert.equal((await getBookConceptsForBookPage(seeded.bookId, 1)).length, 0);
    } finally {
      await deleteBook(seeded.bookId);
    }
  });

  it('deletes Concepts rows on a full rerun but preserves them on missing-only retry', async (): Promise<void> => {
    const targeted = await seedLearningArtifacts('concepts-missing');
    const full = await seedLearningArtifacts('concepts-full');

    try {
      await resetBookProcessingStagesFrom(targeted.bookId, 'concepts', { onlyMissing: true });
      assert.equal((await getBookConceptsForBookPage(targeted.bookId, 1)).length, 1);
      assert.equal((await getConceptEmbeddings([targeted.conceptId])).length, 0);

      await resetBookProcessingStagesFrom(full.bookId, 'concepts');
      assert.equal((await getBookConceptsForBookPage(full.bookId, 1)).length, 0);
      assert.equal((await getBookChapters(full.bookId)).length, 1);
      assert.equal((await getBookPages(full.bookId))[0]?.conceptsProcessed, false);
    } finally {
      await deleteBook(targeted.bookId);
      await deleteBook(full.bookId);
    }
  });

  it('deletes the selected Embeddings and Abilities outputs during full reruns', async (): Promise<void> => {
    const embeddings = await seedLearningArtifacts('embeddings-full');
    const abilities = await seedLearningArtifacts('abilities-full');

    try {
      await resetBookProcessingStagesFrom(embeddings.bookId, 'embeddings');
      assert.equal((await getConceptEmbeddings([embeddings.conceptId])).length, 0);
      assert.equal((await getBookConceptsForBookPage(embeddings.bookId, 1)).length, 1);

      await resetBookProcessingStagesFrom(abilities.bookId, 'abilities');
      assert.equal((await getAbilities(abilities.abilityModuleId)).length, 0);
      assert.equal((await getBookConceptsForBookPage(abilities.bookId, 1)).length, 1);
    } finally {
      await deleteBook(embeddings.bookId);
      await deleteBook(abilities.bookId);
    }
  });

  it('resets full Image output while retaining Ability foreign keys and semantic prompts', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('images-full');

    try {
      const imageId = await createImage({ type: 'tikz', prompt: 'A number line', data: '\\begin{tikzpicture}\\end{tikzpicture}', valid: true });
      await storeAbility(`book-${seeded.bookId}-concept-${seeded.conceptId}`, JSON.stringify({
        h: 'Number line', i: '', q: [{ a: '0', h: 'Locate zero', i: null, p: imageId }], t: 1
      }));

      await resetBookProcessingStagesFrom(seeded.bookId, 'images');
      const image = await getImage(imageId);

      assert.equal(image?.type, 'prompt');
      assert.equal(image?.data, null);
      assert.equal(image?.prompt, 'A number line');
      assert.equal((await getAbilities(`book-${seeded.bookId}-concept-${seeded.conceptId}`)).length, 1);
    } finally {
      await deleteBook(seeded.bookId);
    }
  });

  it('preserves all Concepts, including previous Fix concepts additions, on a full rerun', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('fix-concepts-additions');

    try {
      await createBookConcept({ attempt: 2, bookPage: [seeded.bookId, 1], chapterId: seeded.chapterId,
        title: 'Later correction', description: 'Generated by Fix concepts' });
      await resetBookProcessingStagesFrom(seeded.bookId, 'fixConcepts');

      const concepts = await getBookConceptsForBookPage(seeded.bookId, 1);

      assert.deepEqual(concepts.map(({ attempt }) => attempt).sort((a, b) => a - b), [0, 2]);
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
