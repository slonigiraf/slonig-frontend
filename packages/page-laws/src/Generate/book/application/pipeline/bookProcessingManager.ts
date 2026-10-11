// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookProcessingRun, BookProcessingStageKey } from '@slonigiraf/db';
import { bypassBookProcessingStage, getBook, getBookProcessingRun, isBookProcessingStageComplete, putBookProcessingRun } from '@slonigiraf/db';

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
  /** The current UI book snapshot's real successes and explicit bypasses. */
  satisfiedStages?: readonly BookProcessingStageKey[];
  /** Persisted successes only; bypasses must never satisfy this field. */
  successfulStages?: readonly BookProcessingStageKey[];
  hasReview: boolean;
  error: string;
  onComplete: () => void;
  onBookCheckpoint?: (book: Book) => void;
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
  private verifyingStages = new Map<number, string>();

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
      failedStages: {},
      bypassedStages: [],
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
    this.publish({ ...run, status: 'failed', error, failedStages: run.currentStage ? { ...run.failedStages, [run.currentStage]: error } : run.failedStages, updatedAt: Date.now() });
  }

  /** A failure is never a success checkpoint. Only an explicit user action
   * acknowledges the failed stage and permits a run to move past it. */
  async continueAfterFailure (bookId: number): Promise<Book | undefined> {
    const run = this.runs.get(bookId);
    const stage = run?.currentStage ?? run?.triggeredStage ?? run?.stages.find((key) => !run.completed.includes(key) && !(run.bypassedStages ?? []).includes(key));

    if (!run || run.mode !== 'fastForward' || run.status !== 'failed' || !stage) return undefined;
    const updatedBook = await bypassBookProcessingStage(bookId, stage);

    if (!updatedBook) throw new Error('Book no longer exists.');
    // A different run may have started while the DB transaction was pending.
    if (this.runs.get(bookId)?.id !== run.id || this.runs.get(bookId)?.status !== 'failed') return updatedBook;
    // Old builds could falsely report a failed stage after its DB checkpoint
    // was committed. Reconcile it as a real success, not as a failed bypass.
    const alreadyComplete = isBookProcessingStageComplete(updatedBook, stage);
    const completed = alreadyComplete ? [...new Set([...run.completed, stage])] : run.completed;
    const bypassedStages = alreadyComplete ? (run.bypassedStages ?? []) : [...new Set([...(run.bypassedStages ?? []), stage])];
    const failedStages = { ...run.failedStages };

    if (alreadyComplete) delete failedStages[stage];
    else failedStages[stage] = failedStages[stage] ?? run.error ?? 'Stage failed';
    this.publish({ ...run,
      completed,
      failedStages,
      bypassedStages,
      triggeredStage: undefined,
      startedStage: false,
      currentStage: run.stages.find((key) => !completed.includes(key) && !bypassedStages.includes(key)),
      error: undefined,
      status: 'running',
      updatedAt: Date.now()
    });

    return updatedBook;
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
    this.verifyingStages.delete(bookId);
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
    const run = this.runs.get(bookId);

    // React might never paint busy=true for an immediately rejected command.
    // The command runner, not a render, is proof that the work actually began.
    // Language/subject/age only *open* their metadata dialog here and are not
    // considered started until their real extraction begins.
    if (run?.mode === 'fastForward' && run.status === 'running' && run.triggeredStage === action &&
      !['language', 'subject', 'age'].includes(action) && !run.startedStage) {
      this.publish({ ...run, startedStage: true, updatedAt: Date.now() });
    }
    // Capture the old executor: it remains alive until its awaited operation
    // finishes even if React unmounts during the request.
    void Promise.resolve().then(() => reader.execute(action)).catch(console.error).finally(() => {
      this.executing.delete(bookId);
      const current = this.runs.get(bookId);

      // Re-check the real Book checkpoint after a command that never rendered
      // busy=true. Also wake up the manager after a remount between frames.
      if (current?.mode === 'fastForward' && current.status === 'running' && current.triggeredStage === action) {
        this.publish({ ...current, updatedAt: Date.now() });
      }
      this.pulse(bookId);
    });
  }

  /**
   * Execute one Fast Forward state-machine transition. React merely reports
   * observable stage readiness and provides stage adapters; all sequencing,
   * retries, completion bookkeeping and deduplication live here.
   */
  private verifyFinishedStage (bookId: number, run: BookProcessingRun, action: PipelineAction, frame: FastForwardFrame): void {
    const stage = run.triggeredStage;

    if (!stage || this.verifyingStages.has(bookId)) return;
    this.verifyingStages.set(bookId, `${run.id}:${stage}`);
    // The UI snapshot may lag the persisted checkpoint by a render. Check the
    // authoritative Book before declaring failure or resending a paid request.
    void getBook(bookId).then((book) => {
      const latest = this.runs.get(bookId);

      if (!latest || latest.id !== run.id || latest.status !== 'running' || latest.triggeredStage !== stage) return;
      if (book && isBookProcessingStageComplete(book, stage)) {
        this.publish({ ...latest,
          completed: [...new Set([...latest.completed, stage])],
          triggeredStage: undefined,
          startedStage: false,
          currentStage: undefined,
          updatedAt: Date.now()
        });
        frame.onBookCheckpoint?.(book);
        return;
      }
      if (stage !== 'abilities' && action.onRetryMissing) {
        const retries = latest.retryCounts[stage] ?? 0;

        if (action.isResultComplete === undefined) return;
        if (!action.isResultComplete && retries < 2) {
          this.publish({ ...latest, retryCounts: { ...latest.retryCounts, [stage]: retries + 1 }, startedStage: false, updatedAt: Date.now() });
          action.onRetryMissing();
          return;
        }
      }
      const message = `Fast Forward stopped at ${action.label}: processing finished but the stage is still incomplete. The database has no success checkpoint. Open this stage’s price confirmation and choose Run to retry or Skip to bypass it.`;

      this.fail(bookId, message);
      frame.onError(message);
    }).catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : 'Could not verify stage completion.';

      this.fail(bookId, message);
      frame.onError(message);
    }).finally(() => {
      if (this.verifyingStages.get(bookId) === `${run.id}:${stage}`) this.verifyingStages.delete(bookId);
    });
  }

  stepFastForward (bookId: number, frame: FastForwardFrame): void {
    let run = this.runs.get(bookId);

    if (!run || run.mode !== 'fastForward' || run.status !== 'running') return;
    if (frame.error && run.triggeredStage && !frame.busy && !this.executing.has(bookId)) {
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
    if (run.triggeredStage && this.executing.has(bookId)) return;

    for (let scan = 0; scan <= run.stages.length; scan++) {
      const key = run.stages.find((stage) => !run!.completed.includes(stage) && !(run!.bypassedStages ?? []).includes(stage));

      if (!key) {
        this.complete(bookId);
        frame.onComplete();
        return;
      }
      const action = frame.actions.find(({ key: actionKey }) => actionKey === key);

      if (!action) {
        const message = `Fast Forward cannot run ${key}: no stage handler is registered.`;

        save({ currentStage: key });
        this.fail(bookId, message);
        frame.onError(message);
        return;
      }
      const triggered = run.triggeredStage === key;
      // The UI can briefly retain an old isDone flag after a reset. In the
      // app, require agreement with the Book's durable success checkpoint.
      const succeeded = action.isDone && (frame.successfulStages?.includes(key) ?? true);
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
        if (run.skipRefineChapters && key === 'refineChapters' && !succeeded) {
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
        if (succeeded) {
          if (key !== 'abilities' && action.onRetryMissing) {
            if (action.isResultComplete === undefined) return;
            if (!action.isResultComplete && retry()) return;
          }
          save({ completed: [...run.completed, key], currentStage: undefined });
          continue;
        }
        if (action.isDisabled) {
          // Give React a render to consume the new Book checkpoint/bypass.
          // Once it has, a still-disabled stage lacks required input. Report a
          // failure instead of remaining at the previous stage indefinitely.
          const settled = [...run.completed, ...(run.bypassedStages ?? [])];

          if (settled.length && settled.every((stage) => frame.satisfiedStages?.includes(stage))) {
            // A prior stage can finish in the same frame in which the next
            // action still reports stale disabled props. Publish the new
            // cursor once so React can recompute the next action against the
            // latest Book checkpoint before treating it as genuinely blocked.
            // This never clicks a disabled action or repeats an AI request.
            if (run.currentStage !== key) {
              save({ currentStage: key });
              return;
            }
            const message = `Fast Forward cannot start ${action.label}: this stage's prerequisites or required source content are unavailable after the previous stage. Resolve the missing input or continue explicitly.`;

            this.fail(bookId, message);
            frame.onError(message);
          }
          return;
        }
        save({ triggeredStage: key, startedStage: false, currentStage: key });
        action.onClick();
        return;
      }

      if (!run.startedStage) {
        // Some very short stages (and the IDB-only chapter skip) can persist
        // completion before React ever renders busy=true. The database stage
        // checkpoint is enough to advance without resubmitting the paid job.
        if (succeeded) {
          if (key !== 'abilities' && action.onRetryMissing) {
            if (action.isResultComplete === undefined) return;
            if (!action.isResultComplete && retry()) return;
          }
          save({ completed: [...run.completed, key], triggeredStage: undefined, startedStage: false, currentStage: undefined });
          continue;
        }
        return;
      }
      if (!succeeded) {
        // Do not infer failure from a stale React snapshot: the persisted Book
        // is the single source of truth for successful stage completion.
        this.verifyFinishedStage(bookId, run, action, frame);
        return;
      }
      save({ completed: [...run.completed, key], triggeredStage: undefined, startedStage: false, currentStage: undefined });
    }
  }
}

export const bookProcessingManager = new BookProcessingManager();
