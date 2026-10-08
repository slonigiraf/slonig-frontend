// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookProcessingStageKey, BookProcessingWorker } from '@slonigiraf/db';
import { getBook, getBookProcessingWorker, getBookProcessingWorkers, putBookProcessingWorker, subscribeBookProcessingWorkers, updateBookFields, updateBookProcessingWorker } from '@slonigiraf/db';

import { loadBookStageTimes } from '../../infrastructure/storage/bookStageTime.js';
import { BOOK_PROCESSING_STAGE_LABELS, type BookProcessingWorkerCommand, type BookProcessingWorkerMessage, type BookProcessingWorkerOptions, type BookProcessingWorkerRenderTikzResult } from './bookProcessingWorkerProtocol.js';

const activePorts = new Map<string, MessagePort>();
const workerCommands = new Map<string, BookProcessingWorkerCommand>();
const lastWorkerContact = new Map<string, number>();
// A service worker can be killed without closing the page's MessagePort.
// Recover the durable job without requiring a document reload.
const HEARTBEAT_TIMEOUT_MS = 15_000;
const RECOVERY_INTERVAL_MS = 5_000;

function closeWorkerPort (workerId: string): void {
  activePorts.get(workerId)?.close();
  activePorts.delete(workerId);
  workerCommands.delete(workerId);
  lastWorkerContact.delete(workerId);
}

if (typeof window !== 'undefined') {
  window.setInterval(() => {
    for (const workerId of workerCommands.keys()) {
      if (Date.now() - (lastWorkerContact.get(workerId) ?? 0) > HEARTBEAT_TIMEOUT_MS) {
        // Re-dispatch with the same durable ID. A surviving service worker
        // simply reattaches; a restarted one resumes from IndexedDB.
        closeWorkerPort(workerId);
        void getBookProcessingWorker(workerId).then((status) => {
          if (status && (status.state === 'queued' || status.state === 'running')) {
            resumeBookProcessingWorker(status);
          }
        }).catch(console.error);
      }
    }
  }, RECOVERY_INTERVAL_MS);
}

let serviceWorkerPromise: Promise<ServiceWorker> | undefined;

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    serviceWorkerPromise = undefined;
  });
}

function createWorkerId (bookId: number, stage: BookProcessingStageKey): string {
  const random = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  return `book-${bookId}-${stage}-${random}`;
}

function waitForActivatedServiceWorker (registration: ServiceWorkerRegistration): Promise<ServiceWorker> {
  // In development, prefer a newly installing/waiting worker over the old
  // active instance. The service-worker entry calls skipWaiting() in dev, so
  // waiting for the update here avoids dispatching the next processing command
  // to a stale bundle after webpack recompiles it. Production keeps the normal
  // active-worker preference so an update cannot interrupt an in-flight job.
  const serviceWorker = process.env.NODE_ENV === 'development'
    ? registration.installing ?? registration.waiting ?? registration.active
    : registration.active ?? registration.installing ?? registration.waiting;

  if (!serviceWorker) {
    return Promise.reject(new Error('Book processing service worker did not install.'));
  }

  if (serviceWorker.state === 'activated') {
    return Promise.resolve(serviceWorker);
  }

  return new Promise((resolve, reject) => {
    const handleStateChange = (): void => {
      if (serviceWorker.state === 'activated') {
        serviceWorker.removeEventListener('statechange', handleStateChange);
        resolve(serviceWorker);
      } else if (serviceWorker.state === 'redundant') {
        serviceWorker.removeEventListener('statechange', handleStateChange);
        reject(new Error('Book processing service worker became redundant before activation.'));
      }
    };

    serviceWorker.addEventListener('statechange', handleStateChange);
    handleStateChange();
  });
}

async function getBookProcessingServiceWorker (): Promise<ServiceWorker> {
  if (!('serviceWorker' in navigator)) {
    throw new Error('Service workers are not supported in this browser.');
  }

  serviceWorkerPromise ??= navigator.serviceWorker
    .register('book-processing-service-worker.js', { updateViaCache: 'none' })
    .then(waitForActivatedServiceWorker)
    .catch((error: unknown) => {
      serviceWorkerPromise = undefined;
      throw error;
    });

  return serviceWorkerPromise;
}

function failServiceWorkerLaunch (command: BookProcessingWorkerCommand, port: MessagePort, reason: unknown): void {
  if (activePorts.get(command.workerId) !== port) {
    return;
  }
  closeWorkerPort(command.workerId);
  void updateBookProcessingWorker(command.workerId, {
    error: reason instanceof Error ? reason.message : 'Unable to start the book processing service worker.',
    finishedAt: Date.now(),
    state: 'failed'
  });
}

function launchWorker (command: BookProcessingWorkerCommand): void {
  if (activePorts.has(command.workerId)) {
    return;
  }

  const channel = new MessageChannel();
  const port = channel.port1;

  activePorts.set(command.workerId, port);
  workerCommands.set(command.workerId, command);
  lastWorkerContact.set(command.workerId, Date.now());
  port.addEventListener('message', ({ data }: MessageEvent<BookProcessingWorkerMessage>) => {
    if (activePorts.get(command.workerId) !== port) {
      return;
    }
    lastWorkerContact.set(command.workerId, Date.now());
    if (data?.type === 'heartbeat') {
      return;
    }
    if (data?.type === 'renderTikz' && data.workerId === command.workerId) {
      void import('../../../../Edit/TikzDisplay.js')
        .then(({ preRenderTikz }) => preRenderTikz(data.value))
        .then((result) => {
          const response: BookProcessingWorkerRenderTikzResult = { requestId: data.requestId, result, type: 'renderTikzResult' };

          port.postMessage(response);
        })
        .catch((reason: unknown) => {
          const response: BookProcessingWorkerRenderTikzResult = {
            error: reason instanceof Error ? reason.message : 'Unable to render TikZ.',
            requestId: data.requestId,
            type: 'renderTikzResult'
          };

          port.postMessage(response);
        });
      return;
    }

    if (data?.type === 'done' && data.workerId === command.workerId) {
      closeWorkerPort(command.workerId);
    }
  });
  port.start();

  void getBookProcessingServiceWorker()
    .then((serviceWorker) => {
      if (activePorts.get(command.workerId) === port) {
        serviceWorker.postMessage(command, [channel.port2]);
      } else {
        channel.port2.close();
      }
    })
    .catch((reason: unknown) => failServiceWorkerLaunch(command, port, reason));
}

async function createDurableWorker (bookId: number, stages: BookProcessingStageKey[], options: BookProcessingWorkerOptions, isPipeline: boolean): Promise<string> {
  const book = await getBook(bookId);

  if (!book) {
    throw new Error('Book not found.');
  }
  if (!stages.length) {
    throw new Error('No book-processing stages were requested.');
  }

  // Stage timing used to live only in localStorage, which a service worker
  // cannot access. Seed the durable IndexedDB field before dispatch so existing
  // timing history is preserved when the service worker starts adding to it.
  await updateBookFields(bookId, { stageTime: loadBookStageTimes(bookId) });

  const allActive = await getBookProcessingWorkers({ activeOnly: true });
  if (allActive.some((worker) => worker.bookId !== bookId)) {
    throw new Error('Another book is still processing. Wait for it to finish before starting a new book.');
  }
  const active = allActive.filter((worker) => worker.bookId === bookId);
  const duplicate = isPipeline
    ? active.find((worker) => worker.isPipeline)
    : active.find((worker) => !worker.isPipeline && worker.stage === stages[0]);

  if (duplicate) {
    launchWorker({
      bookId: duplicate.bookId,
      options: duplicate.options ?? {},
      stage: duplicate.stage,
      ...(duplicate.isPipeline
        ? {
          stages: duplicate.stageSequence?.length ? duplicate.stageSequence : [duplicate.stage],
          startStageIndex: duplicate.stageIndex ?? 0
        }
        : {}),
      workerId: duplicate.workerId
    });

    return duplicate.workerId;
  }

  const stage = stages[0];
  const workerId = createWorkerId(bookId, stage);
  const now = Date.now();

  await putBookProcessingWorker({
    bookId,
    bookName: book.name,
    isPipeline,
    options,
    progressTotal: 1,
    progressValue: 0,
    spent: 0,
    stage,
    stageIndex: 0,
    stageLabel: BOOK_PROCESSING_STAGE_LABELS[stage],
    ...(isPipeline ? { stageSequence: stages } : {}),
    startedAt: now,
    state: 'queued',
    updatedAt: now,
    workerId
  });

  launchWorker({
    bookId,
    options,
    stage,
    ...(isPipeline ? { stages, startStageIndex: 0 } : {}),
    workerId
  });

  return workerId;
}

export async function startBookProcessingWorker (bookId: number, stage: BookProcessingStageKey, options: BookProcessingWorkerOptions = {}): Promise<string> {
  return createDurableWorker(bookId, [stage], options, false);
}

/**
 * Starts one service-worker job that owns the complete remaining pipeline.
 * React may unmount/change route; continuation no longer depends on route-level effects.
 */
export async function startBookProcessingPipeline (bookId: number, stages: BookProcessingStageKey[], options: BookProcessingWorkerOptions = {}): Promise<string> {
  return createDurableWorker(bookId, stages, options, true);
}

/**
 * Re-dispatches a durable job after a browser document reload or service-worker
 * restart. A live service-worker job with the same workerId only attaches the
 * new page message port instead of starting duplicate processing.
 */
export function resumeBookProcessingWorker (status: BookProcessingWorker): void {
  if ((status.state !== 'queued' && status.state !== 'running') || activePorts.has(status.workerId)) {
    return;
  }

  if (!status.isPipeline) {
    launchWorker({
      bookId: status.bookId,
      options: status.options ?? {},
      stage: status.stage,
      workerId: status.workerId
    });
    return;
  }

  const stages = status.stageSequence?.length ? status.stageSequence : [status.stage];
  const storedIndex = status.stageIndex ?? Math.max(0, stages.indexOf(status.stage));
  const startStageIndex = Math.max(0, Math.min(storedIndex, stages.length - 1));

  launchWorker({
    bookId: status.bookId,
    options: status.options ?? {},
    stage: stages[startStageIndex],
    stages,
    startStageIndex,
    workerId: status.workerId
  });
}

export async function resumeBookProcessingWorkers (): Promise<void> {
  const workers = await getBookProcessingWorkers({ activeOnly: true });

  workers.forEach(resumeBookProcessingWorker);
}

export async function waitForBookProcessingWorker (workerId: string): Promise<BookProcessingWorker> {
  const current = await getBookProcessingWorker(workerId);

  if (!current) {
    throw new Error('Background book processing worker was not found.');
  }

  if (current.state !== 'queued' && current.state !== 'running') {
    return current;
  }

  return new Promise<BookProcessingWorker>((resolve) => {
    let unsubscribe = (): void => undefined;

    unsubscribe = subscribeBookProcessingWorkers((workers) => {
      const worker = workers.find((candidate) => candidate.workerId === workerId);

      if (worker && worker.state !== 'queued' && worker.state !== 'running') {
        unsubscribe();
        resolve(worker);
      }
    });
  });
}

export async function runBookProcessingWorker (bookId: number, stage: BookProcessingStageKey, options: BookProcessingWorkerOptions = {}): Promise<BookProcessingWorker> {
  const workerId = await startBookProcessingWorker(bookId, stage, options);
  const worker = await waitForBookProcessingWorker(workerId);

  if (worker.state === 'failed') {
    throw new Error(worker.error || `${BOOK_PROCESSING_STAGE_LABELS[stage]} failed.`);
  }

  if (worker.state === 'aborted') {
    throw new DOMException('Processing aborted.', 'AbortError');
  }

  return worker;
}
