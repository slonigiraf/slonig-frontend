// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { completeBookProcessingStage, createBook, deleteBook, getBook, getBookProcessingRun, isBookProcessingStageComplete, isBookProcessingStageSatisfied, putBookProcessingRun } from '@slonigiraf/db';

import type { PipelineAction } from '../../../shared/types/processing.js';

import { BookProcessingManager } from './bookProcessingManager.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

const awaitRunStatus = async (manager: BookProcessingManager, bookId: number, status: string): Promise<void> => {
  for (let attempt = 0; attempt < 100; attempt++) {
    if (manager.getSnapshot(bookId)?.status === status) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  assert.fail(`Fast Forward did not transition to ${status}`);
};

const advanceMicrotasks = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
};

describe('BookProcessingManager', (): void => {
  it('executes every Fast Forward stage exactly once, even when React reports the same frame again', async (): Promise<void> => {
    const manager = new BookProcessingManager();
    const bookId = 902701;
    const clicks: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'recognize', label: 'Recognize', isDone: false, isDisabled: false, onClick: () => clicks.push('recognize') },
      { key: 'chapters', label: 'Chapters', isDone: false, isDisabled: false, onClick: () => clicks.push('chapters') }
    ];
    let completed = 0;

    await manager.startFastForward(bookId, ['recognize', 'chapters'], false, { generation: 'model-1', embedding: 'model-2', standards: 'model-3' });
    const frame = (busy: boolean) => ({
      actions,
      busy,
      contentReady: true,
      error: '',
      hasReview: false,
      onComplete: () => { completed++; },
      onError: (message: string) => { throw new Error(message); }
    });

    manager.stepFastForward(bookId, frame(false));
    manager.stepFastForward(bookId, frame(false));
    assert.deepEqual(clicks, ['recognize']);
    manager.stepFastForward(bookId, frame(true));
    actions[0].isDone = true;
    manager.stepFastForward(bookId, frame(false));
    assert.deepEqual(clicks, ['recognize', 'chapters']);
    manager.stepFastForward(bookId, frame(true));
    actions[1].isDone = true;
    manager.stepFastForward(bookId, frame(false));
    manager.stepFastForward(bookId, frame(false));

    assert.equal(completed, 1);
    assert.equal(manager.getSnapshot(bookId)?.status, 'completed');
    await manager.flush(bookId);
    assert.equal((await getBookProcessingRun(bookId))?.status, 'completed');
  });

  it('hands off no-split Refine chapters to Abilities after a stale disabled frame without aborting', async (): Promise<void> => {
    const bookId = await createBook({
      contentHash: `fast-forward-no-split-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'No split refinement', opfsName: 'no-split.pdf', size: 1
    });
    const manager = new BookProcessingManager();
    const clicks: string[] = [];
    const errors: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'refineChapters', label: 'Refine chapters', isDone: false, isDisabled: false,
        onClick: () => clicks.push('refineChapters') },
      { key: 'abilities', label: 'Abilities', isDone: false, isDisabled: true,
        onClick: () => clicks.push('abilities') }
    ];
    let latestBook = (await getBook(bookId))!;
    const frame = (busy = false) => ({
      actions, busy, contentReady: true, hasReview: false, error: '',
      satisfiedStages: [...(latestBook.completedStages ?? []), ...(latestBook.bypassedStages ?? [])],
      successfulStages: latestBook.completedStages ?? [],
      onComplete: () => undefined, onError: (message: string) => errors.push(message)
    });

    try {
      await manager.startFastForward(bookId, ['refineChapters', 'abilities'], false, { generation: 'g', embedding: 'e', standards: 's' });
      manager.stepFastForward(bookId, frame());
      manager.stepFastForward(bookId, frame(true));
      assert.deepEqual(clicks, ['refineChapters']);

      // AI decided no split was needed. The stage still saved a real checkpoint.
      latestBook = (await completeBookProcessingStage(bookId, 'refineChapters'))!;
      assert.equal(isBookProcessingStageSatisfied(latestBook, 'refineChapters'), true);
      actions[0].isDone = true;
      // The next action still carries its previous render's disabled flag.
      manager.stepFastForward(bookId, frame());
      assert.equal(manager.getSnapshot(bookId)?.status, 'running');
      assert.equal(manager.getSnapshot(bookId)?.currentStage, 'abilities');
      assert.deepEqual(clicks, ['refineChapters']);
      assert.deepEqual(errors, []);

      // The next React render uses the latest Book prerequisite checkpoint.
      actions[1].isDisabled = !isBookProcessingStageSatisfied(latestBook, 'refineChapters');
      manager.stepFastForward(bookId, frame());
      assert.deepEqual(clicks, ['refineChapters', 'abilities']);
      assert.equal(manager.getSnapshot(bookId)?.status, 'running');
      assert.deepEqual(errors, []);
    } finally {
      await manager.flush(bookId);
      await deleteBook(bookId);
    }
  });

  it('still stops at Abilities when it remains disabled after the checkpoint handoff', async (): Promise<void> => {
    const bookId = await createBook({
      contentHash: `fast-forward-abilities-blocked-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'Abilities missing source', opfsName: 'missing-source.pdf', size: 1
    });
    const manager = new BookProcessingManager();
    const errors: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'refineChapters', label: 'Refine chapters', isDone: true, isDisabled: false, onClick: () => undefined },
      { key: 'abilities', label: 'Abilities', isDone: false, isDisabled: true, onClick: () => assert.fail('Blocked stage was started') }
    ];

    try {
      const book = (await completeBookProcessingStage(bookId, 'refineChapters'))!;
      const frame = () => ({
        actions, busy: false, contentReady: true, hasReview: false, error: '',
        satisfiedStages: book.completedStages ?? [], successfulStages: book.completedStages ?? [],
        onComplete: () => undefined, onError: (message: string) => errors.push(message)
      });

      await manager.startFastForward(bookId, ['refineChapters', 'abilities'], false, { generation: 'g', embedding: 'e', standards: 's' });
      manager.stepFastForward(bookId, frame()); // Allow a fresh render at the new stage.
      assert.equal(manager.getSnapshot(bookId)?.status, 'running');
      manager.stepFastForward(bookId, frame()); // Still blocked: missing source is real.
      assert.equal(manager.getSnapshot(bookId)?.status, 'failed');
      assert.match(errors[0], /cannot start Abilities/);
    } finally {
      await manager.flush(bookId);
      await deleteBook(bookId);
    }
  });

  it('advances directly from Concepts to Fix concepts without automatically regenerating missing chapters', async (): Promise<void> => {
    const manager = new BookProcessingManager();
    const bookId = 902709;
    const clicks: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'concepts', label: 'Concepts', isDone: false, isDisabled: false,
        isResultComplete: false, onClick: () => clicks.push('concepts') },
      { key: 'fixConcepts', label: 'Fix concepts', isDone: false, isDisabled: false,
        onClick: () => clicks.push('fixConcepts') }
    ];
    const frame = (busy: boolean) => ({
      actions, busy, contentReady: true, error: '', hasReview: false,
      onComplete: () => undefined,
      onError: (message: string) => { throw new Error(message); }
    });

    await manager.startFastForward(bookId, ['concepts', 'fixConcepts'], false, { generation: 'model-1', embedding: 'model-2', standards: 'model-3' });
    manager.stepFastForward(bookId, frame(false));
    manager.stepFastForward(bookId, frame(true));
    // One chapter produced concepts; a different chapter may still have none.
    // This stage's checkpoint is enough to move on to Fix concepts.
    actions[0].isDone = true;
    manager.stepFastForward(bookId, frame(false));

    assert.deepEqual(clicks, ['concepts', 'fixConcepts']);
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['concepts']);
    assert.deepEqual(manager.getSnapshot(bookId)?.retryCounts, {});
    await manager.flush(bookId);
  });

  it('keeps Fix concepts running through review and save, then advances after its checkpoint', async (): Promise<void> => {
    const manager = new BookProcessingManager();
    const bookId = 902710;
    const clicks: string[] = [];
    const errors: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'fixConcepts', label: 'Fix concepts', isDone: false, isDisabled: false,
        onClick: () => clicks.push('fixConcepts') },
      { key: 'embeddings', label: 'Embedings', isDone: false, isDisabled: false,
        onClick: () => clicks.push('embeddings') }
    ];
    const frame = (busy: boolean) => ({
      actions, busy, contentReady: true, error: '', hasReview: false,
      onComplete: () => undefined,
      onError: (message: string) => errors.push(message)
    });

    await manager.startFastForward(bookId, ['fixConcepts', 'embeddings'], false, { generation: 'model-1', embedding: 'model-2', standards: 'model-3' });
    manager.stepFastForward(bookId, frame(false));
    assert.deepEqual(clicks, ['fixConcepts']);

    // The extraction request completes, but a Fix concepts review now exists.
    // Auto-applying the review and persisting the stage checkpoint are still
    // part of Fix concepts: the reader must report busy during both phases.
    manager.stepFastForward(bookId, frame(true)); // extracting
    manager.stepFastForward(bookId, frame(true)); // review ready
    manager.stepFastForward(bookId, frame(true)); // saving reviewed changes
    assert.equal(manager.getSnapshot(bookId)?.status, 'running');
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, []);
    assert.deepEqual(errors, []);

    actions[0].isDone = true; // applied and persisted in IndexedDB
    manager.stepFastForward(bookId, frame(false));
    assert.deepEqual(clicks, ['fixConcepts', 'embeddings']);
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['fixConcepts']);
    assert.deepEqual(errors, []);
    await manager.flush(bookId);
  });

  it('does not stop Deduplicate concepts while its generated review is being applied and saved', async (): Promise<void> => {
    const bookId = await createBook({
      contentHash: `fast-forward-dedup-review-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'Dedup review handoff', opfsName: 'dedup.pdf', size: 1
    });
    const manager = new BookProcessingManager();
    const clicked: string[] = [];
    const errors: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'deduplicateConcepts', label: 'Deduplicate concepts', isDone: false, isDisabled: false,
        onClick: () => clicked.push('deduplicateConcepts') },
      { key: 'sortConcepts', label: 'Sort concepts', isDone: false, isDisabled: false,
        onClick: () => clicked.push('sortConcepts') }
    ];
    const frame = (busy: boolean) => ({
      actions, busy, contentReady: true, error: '', hasReview: false,
      successfulStages: actions.filter(({ isDone }) => isDone).map(({ key }) => key),
      onComplete: () => undefined,
      onError: (message: string) => errors.push(message)
    });

    try {
      await manager.startFastForward(bookId, ['deduplicateConcepts', 'sortConcepts'], false, { generation: 'g', embedding: 'e', standards: 's' });
      manager.stepFastForward(bookId, frame(false));
      manager.stepFastForward(bookId, frame(true)); // AI extraction
      manager.stepFastForward(bookId, frame(true)); // review pending
      manager.stepFastForward(bookId, frame(true)); // applying approved deletions
      assert.equal(isBookProcessingStageComplete((await getBook(bookId))!, 'deduplicateConcepts'), false);
      assert.equal(manager.getSnapshot(bookId)?.status, 'running');
      assert.deepEqual(errors, []);

      await completeBookProcessingStage(bookId, 'deduplicateConcepts');
      actions[0].isDone = true;
      manager.stepFastForward(bookId, frame(false));
      assert.deepEqual(clicked, ['deduplicateConcepts', 'sortConcepts']);
      assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['deduplicateConcepts']);
      assert.deepEqual(errors, []);
    } finally {
      await deleteBook(bookId);
    }
  });

  it('moves from partially generated Abilities to Fix abilities without targeted retries', async (): Promise<void> => {
    const bookId = 902707;
    const manager = new BookProcessingManager();
    const clicked: string[] = [];
    let missingRetryCount = 0;
    const actions: PipelineAction[] = [
      { key: 'abilities', label: 'Abilities', isDone: false, isDisabled: false,
        isResultComplete: false, onClick: () => clicked.push('abilities'),
        onRetryMissing: () => { missingRetryCount++; } },
      { key: 'fixAbilities', label: 'Fix abilities', isDone: false, isDisabled: false,
        onClick: () => clicked.push('fixAbilities') }
    ];

    await manager.startFastForward(bookId, ['abilities', 'fixAbilities'], false, { generation: 'model-1', embedding: 'model-2', standards: 'model-3' });
    const frame = (busy: boolean) => ({
      actions, busy, contentReady: true, error: '', hasReview: false,
      onComplete: () => undefined,
      onError: (message: string) => { throw new Error(message); }
    });

    manager.stepFastForward(bookId, frame(false));
    manager.stepFastForward(bookId, frame(true));
    // The Ability stage persisted its completion checkpoint because one Concept
    // produced an Ability, although other Concepts remain without Abilities.
    actions[0].isDone = true;
    manager.stepFastForward(bookId, frame(false));

    assert.equal(missingRetryCount, 0);
    assert.deepEqual(clicked, ['abilities', 'fixAbilities']);
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['abilities']);
    assert.deepEqual(manager.getSnapshot(bookId)?.retryCounts, {});
    await manager.flush(bookId);
  });

  it('reports an unresolved Ability repair instead of leaving Fast Forward at 100% forever', async (): Promise<void> => {
    const bookId = 902705;
    const manager = new BookProcessingManager();
    const errors: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'fixAbilities', label: 'Fix abilities', isDone: false, isDisabled: false, onClick: () => undefined },
      { key: 'images', label: 'Images', isDone: false, isDisabled: false, onClick: () => { throw new Error('Should not run images'); } }
    ];

    await manager.startFastForward(bookId, ['fixAbilities', 'images'], false, { generation: 'model-1', embedding: 'model-2', standards: 'model-3' });
    const frame = (busy: boolean) => ({
      actions, busy, contentReady: true, error: '', hasReview: false,
      onComplete: () => undefined,
      onError: (message: string) => errors.push(message)
    });

    manager.stepFastForward(bookId, frame(false));
    manager.stepFastForward(bookId, frame(true));
    // AI returned a review which was applied, but unresolved entries left the
    // fixAbilities database stage incomplete. The UI has stopped being busy.
    manager.stepFastForward(bookId, frame(false));
    await awaitRunStatus(manager, bookId, 'failed');
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, []);
    assert.match(errors[0], /Fix abilities.*still incomplete/);
    await manager.flush(bookId);
  });

  it('persists a failed stage separately from success, allows explicit continuation, and verifies a stale checkpoint against the database', async (): Promise<void> => {
    const bookId = await createBook({
      contentHash: `fast-forward-bypass-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'Fast forward bypass', opfsName: 'bypass.pdf', size: 1
    });
    const manager = new BookProcessingManager();
    const clicked: string[] = [];
    const errors: string[] = [];
    const actions: PipelineAction[] = [
      { key: 'fixConcepts', label: 'Fix concepts', isDone: false, isDisabled: false, onClick: () => clicked.push('fixConcepts') },
      { key: 'embeddings', label: 'Embedings', isDone: false, isDisabled: false, onClick: () => clicked.push('embeddings') }
    ];
    const frame = (busy = false) => ({
      actions, busy, contentReady: true, error: '', hasReview: false,
      onComplete: () => undefined,
      onError: (message: string) => errors.push(message)
    });

    try {
      await manager.startFastForward(bookId, ['fixConcepts', 'embeddings'], false, { generation: 'g', embedding: 'e', standards: 's' });
      manager.stepFastForward(bookId, frame());
      manager.stepFastForward(bookId, frame(true));
      manager.stepFastForward(bookId, frame());
      await awaitRunStatus(manager, bookId, 'failed');

      assert.deepEqual(manager.getSnapshot(bookId)?.completed, []);
      assert.ok(manager.getSnapshot(bookId)?.failedStages?.fixConcepts);
      assert.equal(isBookProcessingStageComplete((await getBook(bookId))!, 'fixConcepts'), false);

      const updated = await manager.continueAfterFailure(bookId);

      assert.ok(updated);
      assert.equal(isBookProcessingStageComplete(updated!, 'fixConcepts'), false);
      assert.equal(isBookProcessingStageSatisfied(updated!, 'fixConcepts'), true);
      assert.deepEqual(manager.getSnapshot(bookId)?.bypassedStages, ['fixConcepts']);
      manager.stepFastForward(bookId, frame());
      assert.deepEqual(clicked, ['fixConcepts', 'embeddings']);

      manager.stepFastForward(bookId, frame(true));
      // The DB checkpoint exists, but the UI action still reports isDone:false.
      await completeBookProcessingStage(bookId, 'embeddings');
      manager.stepFastForward(bookId, frame());
      for (let attempt = 0; attempt < 100 && !manager.getSnapshot(bookId)?.completed.includes('embeddings'); attempt++) {
        await new Promise((resolve) => setTimeout(resolve, 2));
      }
      assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['embeddings']);
      assert.deepEqual(manager.getSnapshot(bookId)?.bypassedStages, ['fixConcepts']);
      assert.equal(errors.length, 1);
    } finally {
      await deleteBook(bookId);
    }
  });

  it('recovers an old false failure as success if its Book checkpoint was already saved', async (): Promise<void> => {
    const bookId = await createBook({
      contentHash: `fast-forward-recovered-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'Recovered checkpoint', opfsName: 'recovered.pdf', size: 1
    });
    const manager = new BookProcessingManager();

    try {
      await manager.startFastForward(bookId, ['fixConcepts', 'embeddings'], false, { generation: 'g', embedding: 'e', standards: 's' });
      manager.fail(bookId, 'Old UI reported Fix concepts incomplete.');
      await completeBookProcessingStage(bookId, 'fixConcepts');
      const recovered = await manager.continueAfterFailure(bookId);

      assert.ok(recovered);
      assert.equal(isBookProcessingStageComplete(recovered!, 'fixConcepts'), true);
      assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['fixConcepts']);
      assert.deepEqual(manager.getSnapshot(bookId)?.bypassedStages, []);
      assert.equal(manager.getSnapshot(bookId)?.status, 'running');
      assert.equal(manager.getSnapshot(bookId)?.currentStage, 'embeddings');
    } finally {
      await deleteBook(bookId);
    }
  });

  it('detects command completion even when a failed fast command never rendered busy=true', async (): Promise<void> => {
    const bookId = await createBook({
      contentHash: `fast-forward-no-busy-${Date.now()}-${Math.random()}`,
      created: Date.now(), name: 'No busy frame', opfsName: 'no-busy.pdf', size: 1
    });
    const manager = new BookProcessingManager();
    const errors: string[] = [];
    const state = {
      ageSamplePageCount: 0, ageSampleTextCount: 0, conceptChapterCount: 1,
      isAssigningStandards: false, isDeduplicatingConcepts: false, isEmbeddingConcepts: false,
      isFixingConcepts: false, isGeneratingAllConcepts: false, isIdentifyingChapters: false,
      isMmdConversionComplete: true, isRecognizingAll: false, isRefiningChapters: false,
      isSortingConcepts: false, totalPages: 1
    };
    const unregister = manager.registerReader(bookId, () => ({
      state, execute: async () => undefined // rejected/empty stage with no busy render
    }));
    const actions: PipelineAction[] = [{
      key: 'fixConcepts', label: 'Fix concepts', isDone: false, isDisabled: false,
      onClick: () => manager.enqueue(bookId, 'fixConcepts')
    }];
    const frame = () => ({
      actions, busy: false, contentReady: true, hasReview: false, error: '',
      onComplete: () => undefined, onError: (message: string) => errors.push(message)
    });

    try {
      await manager.startFastForward(bookId, ['fixConcepts'], false, { generation: 'g', embedding: 'e', standards: 's' });
      manager.stepFastForward(bookId, frame());
      await new Promise((resolve) => setTimeout(resolve, 0));
      assert.equal(manager.getSnapshot(bookId)?.startedStage, true);
      manager.stepFastForward(bookId, frame());
      await awaitRunStatus(manager, bookId, 'failed');
      assert.ok(manager.getSnapshot(bookId)?.failedStages?.fixConcepts);
      assert.equal(errors.length, 1);
    } finally {
      unregister();
      await deleteBook(bookId);
    }
  });

  it('advances a completed fast stage even if busy=true was never rendered', async (): Promise<void> => {
    const bookId = 902706;
    const manager = new BookProcessingManager();
    let completed = 0;
    const actions: PipelineAction[] = [
      { key: 'fixAbilities', label: 'Fix abilities', isDone: false, isDisabled: false, onClick: () => undefined }
    ];

    await manager.startFastForward(bookId, ['fixAbilities'], false, { generation: 'model-1', embedding: 'model-2', standards: 'model-3' });
    const frame = () => ({
      actions, busy: false, contentReady: true, error: '', hasReview: false,
      onComplete: () => { completed++; },
      onError: (message: string) => { throw new Error(message); }
    });

    manager.stepFastForward(bookId, frame());
    actions[0].isDone = true;
    manager.stepFastForward(bookId, frame());
    assert.equal(manager.getSnapshot(bookId)?.status, 'completed');
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['fixAbilities']);
    assert.equal(completed, 1);
    await manager.flush(bookId);
  });

  it('retains queued work and the cancellation signal when reader adapters detach', async (): Promise<void> => {
    const manager = new BookProcessingManager();
    let executed = 0;
    let finish!: () => void;
    const inFlight = new Promise<void>((resolve) => { finish = resolve; });
    const state = {
      ageSamplePageCount: 3, ageSampleTextCount: 3, conceptChapterCount: 1,
      isAssigningStandards: false, isDeduplicatingConcepts: false, isEmbeddingConcepts: false,
      isFixingConcepts: false, isGeneratingAllConcepts: false, isIdentifyingChapters: false,
      isMmdConversionComplete: true, isRecognizingAll: false, isRefiningChapters: false,
      isSortingConcepts: false, totalPages: 10
    };

    manager.enqueue(902702, 'recognize');
    const detach = manager.registerReader(902702, () => ({
      execute: async () => { executed++; await inFlight; }, state
    }));

    await advanceMicrotasks();
    detach();
    assert.equal(manager.signal(902702).aborted, false);
    assert.equal(executed, 1);
    finish();
    await advanceMicrotasks();
    manager.enqueue(902702, 'chapters');
    assert.equal(executed, 1);
    const detachNext = manager.registerReader(902702, () => ({
      execute: async () => { executed++; }, state
    }));

    await advanceMicrotasks();
    assert.equal(executed, 2);
    detachNext();
  });

  it('restores interrupted paid runs as paused rather than silently resubmitting them', async (): Promise<void> => {
    const bookId = 902703;
    await putBookProcessingRun({
      bookId, id: 'previous-tab', mode: 'fastForward', status: 'running',
      stages: ['recognize', 'chapters'], startStage: 'recognize',
      currentStage: 'chapters', triggeredStage: 'chapters',
      startedStage: true, completed: ['recognize'], retryCounts: {},
      skipRefineChapters: false, models: { generation: 'model-1', embedding: 'model-2', standards: 'model-3' }, updatedAt: 1
    });
    const manager = new BookProcessingManager();

    await manager.restore(bookId);
    assert.equal(manager.getSnapshot(bookId)?.status, 'paused');
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['recognize']);
    manager.resume(bookId);
    assert.equal(manager.getSnapshot(bookId)?.triggeredStage, undefined);
    assert.equal(manager.getSnapshot(bookId)?.status, 'running');
    assert.equal(manager.getSnapshot(bookId)?.currentStage, 'chapters');
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, ['recognize']);
    assert.deepEqual(manager.getSnapshot(bookId)?.stages, ['recognize', 'chapters']);

    const clicks: string[] = [];
    manager.stepFastForward(bookId, {
      actions: [
        { key: 'recognize', label: 'Recognize', isDone: true, isDisabled: false, onClick: () => clicks.push('recognize') },
        { key: 'chapters', label: 'Chapters', isDone: false, isDisabled: false, onClick: () => clicks.push('chapters') }
      ],
      busy: false, contentReady: true, hasReview: false, error: '',
      onComplete: () => undefined,
      onError: (message: string) => { throw new Error(message); }
    });
    assert.deepEqual(clicks, ['chapters']);
    await manager.flush(bookId);
  });

  it('does not recurse when the Skills cancel adapter calls the parent cancellation callback', (): void => {
    const manager = new BookProcessingManager();
    let calls = 0;

    manager.registerSkillsAbort(902704, () => {
      calls++;
      manager.cancel(902704);
    });
    manager.cancel(902704);
    assert.equal(calls, 1);
  });
});
