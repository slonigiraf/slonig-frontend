// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { getBookProcessingRun, putBookProcessingRun } from '@slonigiraf/db';

import type { PipelineAction } from '../../../shared/types/processing.js';

import { BookProcessingManager } from './bookProcessingManager.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

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
    assert.equal(manager.getSnapshot(bookId)?.status, 'failed');
    assert.deepEqual(manager.getSnapshot(bookId)?.completed, []);
    assert.match(errors[0], /Fix abilities.*still incomplete/);
    await manager.flush(bookId);
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
