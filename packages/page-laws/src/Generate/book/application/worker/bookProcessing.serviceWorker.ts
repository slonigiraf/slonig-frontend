// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference lib="webworker" />

import { addBookStageTime, getBook, getBookProcessingWorker, isBookProcessingStageComplete, updateBookProcessingWorker } from '@slonigiraf/db';

import { runBookProcessingStage } from './runBookProcessingStage.js';
import { BOOK_PROCESSING_STAGE_LABELS, type BookProcessingWorkerCommand, type BookProcessingWorkerIncomingMessage, type BookProcessingWorkerMessage, type BookProcessingWorkerRenderTikzResult } from './bookProcessingWorkerProtocol.js';

const scope = self as unknown as ServiceWorkerGlobalScope;

type PendingTikzRender = {
  message: Extract<BookProcessingWorkerMessage, { type: 'renderTikz' }>;
  reject: (reason: Error) => void;
  resolve: (result: NonNullable<BookProcessingWorkerRenderTikzResult['result']>) => void;
};

type ActiveJob = {
  command: BookProcessingWorkerCommand;
  abortController: AbortController;
  pendingTikzRenders: Map<string, PendingTikzRender>;
  ports: Set<MessagePort>;
  latestPort: MessagePort;
  promise: Promise<void>;
};

const activeJobs = new Map<string, ActiveJob>();

// Abort promptly even when the job is waiting on a long external API request.
// IndexedDB polling below is kept as a fallback for missed messages/restarts.
if (typeof BroadcastChannel !== 'undefined') {
  const abortChannel = new BroadcastChannel('slonig-book-processing-abort');
  abortChannel.addEventListener('message', (event: MessageEvent<{ type?: string; workerId?: string }>) => {
    if (event.data?.type === 'abort' && event.data.workerId) {
      activeJobs.get(event.data.workerId)?.abortController.abort();
    }
  });
}

// Development rebuilds the service-worker script frequently. Activate the new
// bundle immediately there so the page cannot keep dispatching work to a stale
// service worker whose async chunks no longer exist. Production intentionally
// uses the browser's normal update lifecycle so an active processing job is not
// replaced mid-stage.
if (process.env.NODE_ENV === 'development') {
  scope.addEventListener('install', (event: ExtendableEvent) => {
    event.waitUntil(scope.skipWaiting());
  });
  scope.addEventListener('activate', (event: ExtendableEvent) => {
    event.waitUntil(scope.clients.claim());
  });
}

function postToPorts (job: ActiveJob, message: BookProcessingWorkerMessage): void {
  job.ports.forEach((port) => {
    try {
      port.postMessage(message);
    } catch {
      job.ports.delete(port);
    }
  });
}

function handlePortMessage (job: ActiveJob, { data }: MessageEvent<BookProcessingWorkerIncomingMessage>): void {
  if (!('type' in data) || data.type !== 'renderTikzResult') {
    return;
  }

  const pending = job.pendingTikzRenders.get(data.requestId);

  if (!pending) {
    return;
  }

  job.pendingTikzRenders.delete(data.requestId);
  if (data.result) {
    pending.resolve(data.result);
  } else {
    pending.reject(new Error(data.error || 'Unable to render TikZ on the page thread.'));
  }
}

function attachPort (job: ActiveJob, port: MessagePort): void {
  job.ports.add(port);
  job.latestPort = port;
  port.addEventListener('message', (event: MessageEvent<BookProcessingWorkerIncomingMessage>) => handlePortMessage(job, event));
  port.start();

  port.postMessage({ type: 'heartbeat', workerId: job.command.workerId });

  // A document reload replaces the old MessagePort. Re-send any page-only
  // rendering requests that were in flight so the new page can satisfy them.
  job.pendingTikzRenders.forEach(({ message }) => port.postMessage(message));
}

function renderTikzOnPage (job: ActiveJob, value: string): Promise<NonNullable<BookProcessingWorkerRenderTikzResult['result']>> {
  const requestId = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return new Promise((resolve, reject) => {
    const message = { requestId, type: 'renderTikz', value, workerId: job.command.workerId } satisfies Extract<BookProcessingWorkerMessage, { type: 'renderTikz' }>;

    job.pendingTikzRenders.set(requestId, { message, reject, resolve });

    try {
      job.latestPort.postMessage(message);
    } catch (error) {
      job.pendingTikzRenders.delete(requestId);
      reject(error instanceof Error ? error : new Error('Unable to request TikZ rendering from the page.'));
    }
  });
}

async function run (job: ActiveJob): Promise<void> {
  const { command } = job;
  const controller = job.abortController;
  controller.signal.addEventListener('abort', () => {
    // Do not leave a stage blocked forever waiting for a browser-side render.
    job.pendingTikzRenders.forEach(({ reject }) => reject(new DOMException('Processing aborted.', 'AbortError')));
    job.pendingTikzRenders.clear();
  }, { once: true });
  const heartbeat = setInterval(() => {
    postToPorts(job, { type: 'heartbeat', workerId: command.workerId });
  }, 3_000);
  const poll = setInterval(() => {
    getBookProcessingWorker(command.workerId)
      .then((status) => {
        if (status?.abortRequested) {
          controller.abort();
        }
      })
      .catch(() => undefined);
  }, 250);

  try {
    const status = await getBookProcessingWorker(command.workerId);

    // A stale page can race a just-finished job when reconnecting. Never turn a
    // terminal IndexedDB record back into an active service-worker job.
    if (!status || (status.state !== 'queued' && status.state !== 'running')) {
      return;
    }
    if (status.abortRequested) {
      controller.abort();
    }

    const stages = command.stages?.length ? command.stages : [command.stage];
    const firstIndex = Math.max(0, Math.min(command.startStageIndex ?? 0, stages.length - 1));

    await updateBookProcessingWorker(command.workerId, { state: 'running' });

    for (let index = firstIndex; index < stages.length; index++) {
      if (controller.signal.aborted) {
        throw new DOMException('Processing aborted.', 'AbortError');
      }

      const stage = stages[index];
      const latestBook = await getBook(command.bookId);
      const pipelineStageAlreadyCommitted = Boolean(command.stages?.length) && latestBook && isBookProcessingStageComplete(latestBook, stage);

      // Fast Forward resets completion from its requested start stage before
      // creating the pipeline. A completed stage here therefore means a
      // recreated service-worker job is resuming after that stage committed.
      if (pipelineStageAlreadyCommitted) {
        continue;
      }

      await updateBookProcessingWorker(command.workerId, {
        error: undefined,
        progressTotal: 1,
        progressValue: 0,
        spent: 0,
        stage,
        stageIndex: index,
        stageLabel: BOOK_PROCESSING_STAGE_LABELS[stage],
        state: 'running'
      });

      const stageStartedAt = Date.now();

      try {
        await runBookProcessingStage({ ...command, stage }, controller.signal, {
          renderTikz: (value) => renderTikzOnPage(job, value)
        });
      } finally {
        // Persist elapsed wall-clock time in IndexedDB, which is available to
        // service workers. Failed/aborted attempts are intentionally included,
        // matching the old page timer's accumulated-time semantics.
        await addBookStageTime(command.bookId, stage, Date.now() - stageStartedAt);
      }
    }

    if (controller.signal.aborted) {
      throw new DOMException('Processing aborted.', 'AbortError');
    }

    await updateBookProcessingWorker(command.workerId, {
      finishedAt: Date.now(),
      state: 'completed'
    });
  } catch (error) {
    const aborted = controller.signal.aborted || (error instanceof Error && error.name === 'AbortError');

    await updateBookProcessingWorker(command.workerId, {
      error: aborted ? undefined : error instanceof Error ? error.message : 'Unknown background processing error.',
      finishedAt: Date.now(),
      state: aborted ? 'aborted' : 'failed'
    });
  } finally {
    clearInterval(poll);
    clearInterval(heartbeat);
    job.pendingTikzRenders.forEach(({ reject }) => reject(new Error('Book processing service worker finished before TikZ rendering completed.')));
    job.pendingTikzRenders.clear();
    postToPorts(job, { type: 'done', workerId: command.workerId });
    job.ports.forEach((port) => port.close());
    job.ports.clear();
    activeJobs.delete(command.workerId);
  }
}

scope.addEventListener('message', (event: ExtendableMessageEvent) => {
  const data = event.data as BookProcessingWorkerIncomingMessage;

  if (!data || ('type' in data && data.type === 'renderTikzResult')) {
    return;
  }

  const port = event.ports[0];

  if (!port) {
    return;
  }

  const existing = activeJobs.get(data.workerId);

  if (existing) {
    attachPort(existing, port);
    event.waitUntil(existing.promise);
    return;
  }

  const job = {
    command: data,
    abortController: new AbortController(),
    latestPort: port,
    pendingTikzRenders: new Map<string, PendingTikzRender>(),
    ports: new Set<MessagePort>(),
    promise: Promise.resolve()
  } satisfies ActiveJob;

  attachPort(job, port);
  job.promise = run(job);
  activeJobs.set(data.workerId, job);
  event.waitUntil(job.promise);
});
