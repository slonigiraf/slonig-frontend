// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import {
  createBook,
  completeBookProcessingStage,
  createBookConcept,
  createImage,
  ensureAbilityAnswerImage,
  deleteBook,
  getAbilities,
  getBook,
  getBookChapters,
  getBookConceptsForBookPage,
  getBookPages,
  getConceptEmbeddings,
  getImage,
  putImage,
  getSkillsForChapter,
  putBookPage,
  putConceptEmbeddings,
  replaceBookChapterAssignments,
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

  await replaceSkillsForChapter(chapter.id, [{
    bookConceptIds: [concept.id],
    description: 'Write zero.',
    rank: 0,
    title: 'Write zero'
  }]);

  const abilityModuleId = `book-${bookId}-concept-${concept.id}`;

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

  it('resets question and answer images independently across all four image stages', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('split-images');
    const tikz = '\\begin{tikzpicture}\\draw (0,0)--(1,0);\\end{tikzpicture}';
    const questionId = await createImage({ type: 'tikz', prompt: 'A horizontal segment', data: tikz, valid: true });
    const answerId = await createImage({ type: 'tikz', prompt: 'Mark the endpoint', data: tikz, valid: true });

    try {
      await storeAbility(seeded.abilityModuleId, JSON.stringify({
        h: 'Mark endpoint', i: '', q: [{ a: 'Right endpoint', h: 'Mark the endpoint.', p: questionId, i: answerId }], t: 3
      }));

      await resetBookProcessingStagesFrom(seeded.bookId, 'images');
      assert.equal((await getImage(questionId))?.data, null);
      assert.equal((await getImage(answerId))?.data, tikz, 'question image generation must preserve the answer');

      const question = await getImage(questionId);
      assert.ok(question);
      await putImage({ ...question, type: 'tikz', data: tikz });
      await resetBookProcessingStagesFrom(seeded.bookId, 'fixImages');
      assert.equal((await getImage(questionId))?.data, tikz, 'question QA must not delete question TikZ');
      assert.equal((await getImage(answerId))?.data, tikz, 'question QA must not reset answer TikZ');

      await resetBookProcessingStagesFrom(seeded.bookId, 'answerImages');
      assert.equal((await getImage(questionId))?.data, tikz, 'answer generation must preserve the question');
      assert.equal((await getImage(answerId))?.data, null);

      const answer = await getImage(answerId);
      assert.ok(answer);
      await putImage({ ...answer, type: 'tikz', data: tikz });
      await resetBookProcessingStagesFrom(seeded.bookId, 'fixAnswerImages');
      assert.equal((await getImage(questionId))?.data, tikz, 'answer QA must preserve question TikZ');
      assert.equal((await getImage(answerId))?.data, tikz, 'answer QA must preserve answer TikZ');
    } finally {
      await deleteBook(seeded.bookId);
    }
  });

  it('does not reopen Fix question images when an answer image is edited', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('answer-invalidation');
    const questionId = await createImage({ type: 'tikz', prompt: 'A line', data: '\\begin{tikzpicture}\\end{tikzpicture}', valid: undefined });
    const answerId = await createImage({ type: 'prompt', prompt: 'Mark the point', data: null, valid: undefined });

    try {
      await storeAbility(seeded.abilityModuleId, JSON.stringify({
        h: 'Mark a point', i: '', q: [{ a: 'Point', h: 'Mark it.', p: questionId, i: answerId }], t: 3
      }));
      await completeBookProcessingStage(seeded.bookId, 'fixImages');
      await completeBookProcessingStage(seeded.bookId, 'answerImages');
      const image = await getImage(answerId);
      assert.ok(image);
      await putImage({ ...image, type: 'tikz', data: '\\begin{tikzpicture}\\fill (0,0) circle (1pt);\\end{tikzpicture}' });
      const book = await getBook(seeded.bookId);

      assert.equal(book?.completedStages?.includes('fixImages'), true);
      assert.equal(book?.completedStages?.includes('answerImages'), true);
      assert.equal(book?.completedStages?.includes('fixAnswerImages'), false);
    } finally {
      await deleteBook(seeded.bookId);
    }
  });

  it('creates an answer Image reference without changing the question Image reference', async (): Promise<void> => {
    const seeded = await seedLearningArtifacts('new-answer-image');

    try {
      const questionId = await createImage({ type: 'tikz', prompt: 'A line', data: '\\begin{tikzpicture}\\end{tikzpicture}', valid: undefined });
      const abilityId = await storeAbility(seeded.abilityModuleId, JSON.stringify({
        h: 'Complete the line', i: '', q: [{ a: 'Extended line', h: 'Extend the line.', p: questionId, i: null }], t: 3
      }));
      const answerId = await ensureAbilityAnswerImage(abilityId, 0, 'Show the extended line');
      const stored = (await getAbilities(seeded.abilityModuleId)).find(({ id }) => id === abilityId);
      assert.ok(stored);
      const question = (JSON.parse(stored.content) as { q: Array<{ i: number; p: number }> }).q[0];

      assert.equal(question.p, questionId);
      assert.equal(question.i, answerId);
      assert.equal((await getImage(answerId))?.prompt, 'Show the extended line');
      assert.equal(await ensureAbilityAnswerImage(abilityId, 0, 'Other prompt'), answerId);
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
      assert.equal((await getSkillsForChapter(seeded.chapterId)).length, 0);
      assert.equal((await getAbilities(seeded.abilityModuleId)).length, 0);
    } finally {
      await deleteBook(seeded.bookId);
    }
  });
});
