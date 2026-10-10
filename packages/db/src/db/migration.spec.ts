// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { SlonigDB } from './index.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

const productionSchema = {
  agreements: '&id',
  canceledInsurances: '&workerSign',
  canceledLetters: '&pubSign',
  cidCache: '&cid,time',
  insurances: '&workerSign,created,workerId,[employer+workerId],[referee+letterId]',
  lessons: '&id,created,tutor,deadline',
  letters: '&pubSign,created,workerId,knowledgeId,[workerId+knowledgeId],[referee+letterId]',
  letterTemplates: '&[cid+lesson],[lesson+stage],lesson,letterId,penalizedTime',
  pseudonyms: '&publicKey',
  reexaminations: null,
  reexams: '&[pubSign+lesson],lesson',
  reimbursements: '&workerSign,referee,[referee+letterId]',
  settings: '&id',
  signers: '&publicKey',
  usageRights: '&[pubSign+employer],[referee+letterId]',
  skillTemplates: '&id,moduleId',
  repetitions: '&[workerId+knowledgeId],lastExamined',
  learnRequests: '&id,created',
  scheduledEvents: '++id,type,[type+id]'
};

describe('IndexedDB production migration', (): void => {
  it('upgrades version 64 in bounded batches without losing user data', async (): Promise<void> => {
    const databaseName = `slonig-migration-${Date.now()}-${Math.random()}`;
    const legacy = new Dexie(databaseName);
    let upgraded: SlonigDB | undefined;

    legacy.version(64).stores(productionSchema);

    try {
      await legacy.open();
      await legacy.table('settings').put({ id: 'language', value: 'sr' });
      await legacy.table('lessons').put({
        cid: 'lesson-cid',
        created: 123,
        dPrice: '1',
        dValidity: 10,
        dWarranty: '2',
        id: 'lesson-1',
        isPaid: true,
        lastAction: 'validate',
        learnStep: 2,
        reexamineStep: 3,
        student: 'student',
        toLearnCount: 4,
        toReexamineCount: 5,
        tutor: 'tutor'
      });
      await legacy.table('scheduledEvents').add({ data: 'keep me', deadline: 456, type: 'LOG' });

      const abilityCount = 125;
      const legacyAbilities = Array.from({ length: abilityCount }, (_, index) => ({
        content: JSON.stringify({
          h: `Ability ${index}`,
          i: '',
          q: [{ a: 'answer', h: 'question', i: '', p: `diagram ${index}` }],
          t: 3
        }),
        id: `ability-${String(index).padStart(3, '0')}`,
        moduleId: `module-${index}`
      }));

      await legacy.table('skillTemplates').bulkPut([
        ...legacyAbilities,
        { content: 'legacy non-JSON content', id: 'malformed', moduleId: 'malformed-module' }
      ]);
      legacy.close();

      upgraded = new SlonigDB(databaseName);
      await upgraded.open();

      assert.equal(upgraded.verno, 100);
      assert.equal(upgraded.tables.some(({ name }) => name === 'standardEmbeddings'), true);
      await upgraded.standardEmbeddings.put({ id: 'CCSS.6.RP.A.2', embedding: [0.25, 0.75] });
      assert.deepEqual(await upgraded.standardEmbeddings.get('CCSS.6.RP.A.2'), { id: 'CCSS.6.RP.A.2', embedding: [0.25, 0.75] });
      assert.equal(upgraded.tables.some(({ name }) => name === 'conceptEmbeddings'), true);
      assert.equal(upgraded.tables.some(({ name }) => name === 'mathpixPdfJobs'), true);
      assert.equal(upgraded.tables.some(({ name }) => name === 'tikzSvgCache'), true);
      assert.equal(upgraded.tables.some(({ name }) => name === 'bookProcessingRuns'), true);
      assert.equal(await upgraded.tikzSvgCache.count(), 0, 'cache begins empty; no old SVG cache migration');
      await upgraded.mathpixPdfJobs.put({ bookId: 7, created: 1234, endPage: 40, pdfId: 'pdf-resume-7-1', startPage: 1 });
      assert.deepEqual(await upgraded.mathpixPdfJobs.get([7, 1, 40]), { bookId: 7, created: 1234, endPage: 40, pdfId: 'pdf-resume-7-1', startPage: 1 });
      await upgraded.conceptEmbeddings.put({ id: 42, bookId: 7, input: 'Slope\nRate of change', embedding: [0.1, 0.9] });
      assert.deepEqual(await upgraded.conceptEmbeddings.get(42), { id: 42, bookId: 7, input: 'Slope\nRate of change', embedding: [0.1, 0.9] });
      assert.deepEqual(await upgraded.settings.get('language'), { id: 'language', value: 'sr' });
      assert.equal((await upgraded.lessons.get('lesson-1'))?.cid, 'lesson-cid');
      assert.equal((await upgraded.scheduledEvents.toArray())[0]?.data, 'keep me');
      assert.equal(await upgraded.abilities.count(), abilityCount + 1);
      assert.equal(await upgraded.images.count(), abilityCount);
      assert.equal((await upgraded.abilities.get('malformed'))?.content, 'legacy non-JSON content');
      assert.equal(upgraded.tables.some(({ name }) => name === 'skillTemplates'), false);

      const migrated = await upgraded.abilities.get('ability-124');
      const content = JSON.parse(migrated?.content ?? '{}') as { q?: Array<{ i?: unknown; p?: unknown }> };
      const imageId = content.q?.[0]?.p;

      assert.equal(content.q?.[0]?.i, null);
      assert.equal(typeof imageId, 'number');
      assert.deepEqual(await upgraded.images.get(imageId as number), {
        data: null,
        id: imageId,
        prompt: 'diagram 124',
        type: 'prompt',
        valid: undefined
      });

      upgraded.close();
      upgraded = new SlonigDB(databaseName);
      await upgraded.open();

      assert.equal(await upgraded.abilities.count(), abilityCount + 1);
      assert.equal(await upgraded.images.count(), abilityCount, 'reopening must not repeat migration fixups');
      assert.equal((await upgraded.mathpixPdfJobs.get([7, 1, 40]))?.pdfId, 'pdf-resume-7-1', 'pending Mathpix jobs must survive reloads');
    } finally {
      legacy.close();
      upgraded?.close();
      await Dexie.delete(databaseName);
    }
  });
  it('upgrades version 99 without dropping runs and revokes legacy Fix Images approvals', async (): Promise<void> => {
    const name = `slonig-visual-qa-migration-${Date.now()}-${Math.random()}`;
    const previous = new Dexie(name);
    let upgraded: SlonigDB | undefined;

    // Version 99 already contained the manager's table before visual QA
    // added a separate migration at version 100.
    previous.version(99).stores({
      books: '&id,name,created',
      bookProcessingRuns: '&bookId,status,updatedAt'
    });

    try {
      await previous.open();
      await previous.table('books').bulkPut([
        { id: 17, name: 'Previously processed', contentHash: 'hash', opfsName: 'old.pdf', size: 1, created: 1,
          completedStages: ['recognize', 'abilities', 'images', 'fixImages', 'standards', 'fixStandards'] },
        { id: 18, name: 'Still generating', contentHash: 'hash', opfsName: 'new.pdf', size: 1, created: 2,
          completedStages: ['recognize', 'abilities', 'images'] }
      ]);
      await previous.table('bookProcessingRuns').put({
        bookId: 17, id: 'old-run', mode: 'fastForward', status: 'completed',
        stages: ['images', 'fixImages', 'standards'], startStage: 'images', completed: ['images', 'fixImages', 'standards'],
        startedStage: false, retryCounts: {}, skipRefineChapters: false,
        models: { generation: 'model-a', embedding: 'model-b', standards: 'model-c' }, updatedAt: 12
      });
      await previous.table('bookProcessingRuns').put({
        bookId: 18, id: 'in-progress', mode: 'fastForward', status: 'running',
        stages: ['images', 'fixImages', 'standards'], startStage: 'images', currentStage: 'images', completed: [],
        startedStage: true, retryCounts: {}, skipRefineChapters: false,
        models: { generation: 'model-a', embedding: 'model-b', standards: 'model-c' }, updatedAt: 15
      });
      previous.close();

      upgraded = new SlonigDB(name);
      await upgraded.open();
      assert.equal(upgraded.verno, 100);
      assert.deepEqual((await upgraded.books.get(17))?.completedStages, ['recognize', 'abilities', 'images']);
      assert.deepEqual((await upgraded.books.get(18))?.completedStages, ['recognize', 'abilities', 'images']);
      const run = await upgraded.bookProcessingRuns.get(17);
      assert.ok(run, 'the version 99 processing-run record survives');
      assert.equal(run.status, 'failed', 'an old completion is no longer considered valid');
      assert.deepEqual(run.completed, ['images']);
      assert.match(run.error ?? '', /PNG-based visual QA/);
      const notYetReviewed = await upgraded.bookProcessingRuns.get(18);
      assert.equal(notYetReviewed?.status, 'running', 'do not invalidate an unfinished stage merely because visual QA is planned');
      assert.deepEqual(notYetReviewed?.completed, []);
    } finally {
      previous.close();
      upgraded?.close();
      await Dexie.delete(name);
    }
  });

});
