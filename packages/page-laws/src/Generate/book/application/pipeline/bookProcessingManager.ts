// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookProcessingRun, BookProcessingStageKey } from '@slonigiraf/db';
import { getBookProcessingRun, putBookProcessingRun } from '@slonigiraf/db';

import type { PipelineAction } from '../../../shared/types/processing.js';
import type { BookProcessingRunnerState } from './bookProcessingCommand.js';
import type { BookReaderCommandAction } from './bookPipeline.js';

import { isBookProcessingCommandReady } from './bookProcessingCommand.js';

interface ReaderExecutor {
  state: BookProcessingRunnerState;
  execute: (action: BookReaderCommandAction) => Promise<void> | void;
}

export interface FastForwardFrame {
  actions: readonly PipelineAction[];
  busy: boolean;
  contentReady: boolean;
  hasReview: boolean;
  error: string;
  onComplete: () => void;
  onError: (message: string) => void;
}

/**
 * Main-thread job owner. The React reader supplies the current rendering/AI
 * adapters, but does not own the job, its signal, command queue, or stage cursor.
 * Unregistering an adapter NEVER cancels an in-flight operation.
 *
 * A destroyed tab cannot keep executing JavaScript. Records restored from IDB
 * are paused until the user explicitly opts in to retrying a potentially paid
 * request (the remote provider may have accepted it before the tab closed).
 */
export class BookProcessingManager {
  private runs = new Map<number, BookProcessingRun>();
  private listeners = new Map<number, Set<() => void>>();
  private readers = new Map<number, () => ReaderExecutor>();
  private commands = new Map<number, BookReaderCommandAction[]>();
  private executing = new Set<number>();
  private controllers = new Map<number, AbortController>();
  private skillsAborts = new Map<number, () => void>();
  private restoration = new Map<number, Promise<void>>();
  private nextId = 0;

  getSnapshot = (bookId: number): BookProcessingRun | undefined => this.runs.get(bookId);

  subscribe = (bookId: number, listener: () => void): (() => void) => {
    const listeners = this.listeners.get(bookId) ?? new Set<() => void>();

    listeners.add(listener);
    this.listeners.set(bookId, listeners);

    return () => {
      listeners.delete(listener);

      if (!listeners.size) this.listeners.delete(bookId);
    };
  };

  private publish (run: BookProcessingRun): void {
    this.runs.set(run.bookId, run);
    this.listeners.get(run.bookId)?.forEach((notify) => notify());
    // Serialize writes per book so a slower intermediate checkpoint cannot
    // overwrite a later stage transition in IndexedDB.
    const previous = this.writes.get(run.bookId) ?? Promise.resolve();
    const write = previous.catch(() => undefined).then(() => putBookProcessingRun(run));

    this.writes.set(run.bookId, write);
    void write.catch(console.error);
  }

  private writes = new Map<number, Promise<void>>();

  async restore (bookId: number): Promise<void> {
    if (this.runs.has(bookId)) return;
    const previous = this.restoration.get(bookId);

    if (previous) return previous;
    const loading = (async (): Promise<void> => {
      const saved = await getBookProcessingRun(bookId);

      if (!saved || this.runs.has(bookId)) return;
      // Do not automatically resend a possibly charged request on reload.
      const restored = saved.status === 'running' || saved.status === 'queued'
        ? { ...saved, status: 'paused' as const, updatedAt: Date.now() }
        : saved;

      this.publish(restored);
    })();

    this.restoration.set(bookId, loading);

    try {
      await loading;
    } finally {
      this.restoration.delete(bookId);
    }
  }

  async startFastForward (bookId: number, stages: BookProcessingStageKey[], skipRefineChapters: boolean, models: BookProcessingRun['models']): Promise<void> {
    if (!stages.length) throw new Error('No Fast Forward stages were selected.');
    const active = this.runs.get(bookId);

    if (active?.status === 'running' || this.executing.has(bookId) || this.commands.get(bookId)?.length) {
      throw new Error('This Book is already processing.');
    }
    const run: BookProcessingRun = {
      bookId,
      id: `${Date.now()}-${++this.nextId}`,
      mode: 'fastForward',
      status: 'running',
      stages,
      startStage: stages[0],
      currentStage: stages[0],
      completed: [],
      startedStage: false,
      retryCounts: {},
      skipRefineChapters,
      models,
      updatedAt: Date.now()
    };

    // The durable initial checkpoint must exist before any paid stage begins.
    await putBookProcessingRun(run);
    this.publish(run);
  }

  resume (bookId: number): void {
    const run = this.runs.get(bookId);

    if (!run || run.mode !== 'fastForward' || run.status !== 'paused') return;
    // Preserve finished stages; the interrupted one may need to run again.
    this.publish({ ...run, status: 'running', triggeredStage: undefined, startedStage: false, updatedAt: Date.now() });
  }

  complete (bookId: number): void {
    const run = this.runs.get(bookId);

    if (run?.status !== 'running') return;
    this.publish({ ...run, status: 'completed', currentStage: undefined, triggeredStage: undefined, updatedAt: Date.now() });
  }

  fail (bookId: number, error: string): void {
    const run = this.runs.get(bookId);

    if (run?.status !== 'running') return;
    this.publish({ ...run, status: 'failed', error, updatedAt: Date.now() });
  }

  cancel (bookId: number): void {
    const skillsAbort = this.skillsAborts.get(bookId);

    // An abort adapter may call the UI's onAbortAutoRun, which calls cancel()
    // again. Unregister it before invoking it to avoid recursive cancellation.
    this.skillsAborts.delete(bookId);
    this.controllers.get(bookId)?.abort();
    this.commands.delete(bookId);
    const run = this.runs.get(bookId);

    if (run?.status === 'running' || run?.status === 'paused') {
      this.publish({ ...run, status: 'cancelled', updatedAt: Date.now() });
    }
    skillsAbort?.();
  }

  async flush (bookId: number): Promise<void> {
    await this.writes.get(bookId);
  }

  forget (bookId: number): void {
    this.commands.delete(bookId);
    this.controllers.delete(bookId);
    this.readers.delete(bookId);
    this.runs.delete(bookId);
    this.listeners.get(bookId)?.forEach((notify) => notify());
  }

  signal (bookId: number): AbortSignal {
    let controller = this.controllers.get(bookId);

    if (!controller || controller.signal.aborted) {
      controller = new AbortController();
      this.controllers.set(bookId, controller);
    }

    return controller.signal;
  }

  registerSkillsAbort (bookId: number, abort: () => void): () => void {
    this.skillsAborts.set(bookId, abort);

    return () => {
      if (this.skillsAborts.get(bookId) === abort) this.skillsAborts.delete(bookId);
    };
  }

  registerReader (bookId: number, provider: () => ReaderExecutor): () => void {
    this.readers.set(bookId, provider);
    this.pulse(bookId);

    return () => {
      if (this.readers.get(bookId) === provider) this.readers.delete(bookId);
    };
  }

  enqueue (bookId: number, action: BookReaderCommandAction): void {
    const queue = this.commands.get(bookId) ?? [];

    // A second stage must not overlap the in-flight stage. In particular,
    // rerendering or remounting the reader never resubmits the old command.
    queue.push(action);
    this.commands.set(bookId, queue);
    this.pulse(bookId);
  }

  pulse (bookId: number): void {
    if (this.executing.has(bookId)) return;
    const reader = this.readers.get(bookId)?.();
    const queue = this.commands.get(bookId);

    if (!reader || !queue?.length || !isBookProcessingCommandReady(queue[0], reader.state)) return;
    const action = queue.shift()!;

    if (!queue.length) this.commands.delete(bookId);
    this.executing.add(bookId);
    // Capture the old executor: it remains alive until its awaited operation
    // finishes even if React unmounts during the request.
    void Promise.resolve().then(() => reader.execute(action)).catch(console.error).finally(() => {
      this.executing.delete(bookId);
      this.pulse(bookId);
    });
  }

  /**
   * Execute one Fast Forward state-machine transition. React merely reports
   * observable stage readiness and provides stage adapters; all sequencing,
   * retries, completion bookkeeping and deduplication live here.
   */
  stepFastForward (bookId: number, frame: FastForwardFrame): void {
    let run = this.runs.get(bookId);

    if (!run || run.mode !== 'fastForward' || run.status !== 'running') return;
    if (frame.error && run.triggeredStage && !frame.busy) {
      this.fail(bookId, frame.error);
      frame.onError(frame.error);
      return;
    }
    if (!frame.contentReady || frame.hasReview) return;

    const save = (patch: Partial<BookProcessingRun>): void => {
      run = { ...run!, ...patch, updatedAt: Date.now() };
      this.publish(run!);
    };

    if (run.triggeredStage && frame.busy) {
      if (!run.startedStage) save({ startedStage: true });
      return;
    }

    for (let scan = 0; scan <= run.stages.length; scan++) {
      const key = run.stages.find((stage) => !run!.completed.includes(stage));

      if (!key) {
        this.complete(bookId);
        frame.onComplete();
        return;
      }
      const action = frame.actions.find(({ key: actionKey }) => actionKey === key);

      if (!action) {
        save({ completed: [...run.completed, key], currentStage: undefined });
        continue;
      }
      const triggered = run.triggeredStage === key;
      const retry = (): boolean => {
        const retries = run!.retryCounts[key] ?? 0;

        if (retries >= 2) {
          const message = `Fast Forward stopped at ${action.label}: the stage is still incomplete after two targeted retries.`;

          this.fail(bookId, message);
          frame.onError(message);
          return true;
        }
        save({ retryCounts: { ...run!.retryCounts, [key]: retries + 1 }, triggeredStage: key, startedStage: false, currentStage: key });
        action.onRetryMissing?.();
        return true;
      };

      if (!triggered) {
        if (run.skipRefineChapters && key === 'refineChapters' && !action.isDone) {
          if (action.isDisabled || !action.onSkip) return;
          // Prevent duplicate async skip requests while its IDB writes settle.
          save({ triggeredStage: key, startedStage: false, currentStage: key });
          void action.onSkip().catch((reason: unknown) => {
            const message = reason instanceof Error ? reason.message : 'Fast Forward could not skip Refine chapters.';

            this.fail(bookId, message);
            frame.onError(message);
          });
          return;
        }
        if (action.isDone) {
          if (action.onRetryMissing) {
            if (action.isResultComplete === undefined) return;
            if (!action.isResultComplete && retry()) return;
          }
          save({ completed: [...run.completed, key], currentStage: undefined });
          continue;
        }
        if (action.isDisabled) return;
        save({ triggeredStage: key, startedStage: false, currentStage: key });
        action.onClick();
        return;
      }

      if (!run.startedStage) {
        // Skip is an IDB operation rather than an AI job with busy=true.
        if (run.skipRefineChapters && key === 'refineChapters' && action.isDone) {
          save({ completed: [...run.completed, key], triggeredStage: undefined, currentStage: undefined });
        }
        return;
      }
      if (action.onRetryMissing) {
        if (action.isResultComplete === undefined) return;
        if (!action.isResultComplete && retry()) return;
      } else if (!action.isDone) {
        return;
      }
      save({ completed: [...run.completed, key], triggeredStage: undefined, startedStage: false, currentStage: undefined });
    }
  }
}

export const bookProcessingManager = new BookProcessingManager();
