// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const OPENROUTER_CONCURRENCY = 100;
const OPENROUTER_MAX_ATTEMPTS = 4;
const OPENROUTER_RETRY_BASE_DELAY_MS = 1_000;

interface RequestGateOptions {
  signal?: AbortSignal;
}

export interface RequestGate {
  pause: (milliseconds: number) => void;
  run: <T>(request: () => Promise<T>, options?: RequestGateOptions) => Promise<T>;
}

function errorStatus (error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('status' in error)) {
    return undefined;
  }

  const status = (error as { status?: unknown }).status;

  return typeof status === 'number' ? status : undefined;
}

function retryAfterMs (error: unknown): number | undefined {
  if (typeof error !== 'object' || error === null || !('headers' in error)) {
    return undefined;
  }

  const headers = (error as { headers?: unknown }).headers;
  let retryAfter: unknown;

  if (typeof headers === 'object' && headers !== null && 'get' in headers && typeof (headers as { get?: unknown }).get === 'function') {
    retryAfter = (headers as { get: (name: string) => unknown }).get('retry-after');
  } else if (typeof headers === 'object' && headers !== null) {
    const record = headers as Record<string, unknown>;

    retryAfter = record['retry-after'] ?? record['Retry-After'];
  }

  if (typeof retryAfter === 'number' && Number.isFinite(retryAfter)) {
    return Math.max(0, retryAfter * 1_000);
  }

  if (typeof retryAfter !== 'string' || !retryAfter.trim()) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1_000);
  }

  const date = Date.parse(retryAfter);

  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}

function isRetryableOpenRouterError (error: unknown): boolean {
  const status = errorStatus(error);

  if (status !== undefined) {
    return status === 408 || status === 409 || status === 429 || (status >= 500 && status <= 599);
  }

  if (error instanceof DOMException && error.name === 'AbortError') {
    return false;
  }

  if (typeof error === 'object' && error !== null && 'name' in error) {
    const name = (error as { name?: unknown }).name;

    if (name === 'APIConnectionError' || name === 'APITimeoutError') {
      return true;
    }
  }

  return error instanceof Error && /(?:network|fetch|timed out|timeout)/i.test(error.message);
}

function abortError (): DOMException {
  return new DOMException('Processing aborted.', 'AbortError');
}

async function abortableDelay (milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    throw abortError();
  }

  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, milliseconds);
    const onAbort = (): void => {
      clearTimeout(timer);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

class OpenRouterHttpError extends Error {
  public readonly headers: Headers;
  public readonly status: number;

  constructor(response: Response) {
    super(`OpenRouter request failed (${response.status}).`);
    this.name = 'OpenRouterHttpError';
    this.headers = response.headers;
    this.status = response.status;
  }
}

export function createRequestGate (maxConcurrent: number): RequestGate {
  if (!Number.isSafeInteger(maxConcurrent) || maxConcurrent < 1) {
    throw new Error('OpenRouter concurrency must be a positive integer.');
  }

  let active = 0;
  let pauseUntil = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const queue: Array<() => void> = [];

  const pump = (): void => {
    if (active >= maxConcurrent || !queue.length) {
      return;
    }

    const wait = pauseUntil - Date.now();

    if (wait > 0) {
      if (timer === undefined) {
        timer = setTimeout(() => {
          timer = undefined;
          pump();
        }, wait);
      }

      return;
    }

    while (active < maxConcurrent && queue.length) {
      const start = queue.shift();

      if (!start) {
        break;
      }

      active++;
      start();
    }
  };

  const pause = (milliseconds: number): void => {
    pauseUntil = Math.max(pauseUntil, Date.now() + Math.max(0, milliseconds));

    if (timer !== undefined) {
      clearTimeout(timer);
      timer = undefined;
    }

    pump();
  };

  return {
    pause,
    run: <T,>(request: () => Promise<T>, options?: RequestGateOptions): Promise<T> => new Promise<T>((resolve, reject) => {
      let queued = true;
      let start: () => void;
      const onAbort = (): void => {
        if (!queued) {
          return;
        }

        const queueIndex = queue.indexOf(start);

        if (queueIndex >= 0) {
          queue.splice(queueIndex, 1);
        }

        queued = false;
        reject(abortError());
        pump();
      };
      start = (): void => {
        queued = false;
        options?.signal?.removeEventListener('abort', onAbort);

        const execute = async (): Promise<T> => {
          let lastError: unknown;

          for (let attempt = 0; attempt < OPENROUTER_MAX_ATTEMPTS; attempt++) {
            if (options?.signal?.aborted) {
              throw abortError();
            }

            try {
              return await request();
            } catch (error) {
              lastError = error;

              if (!isRetryableOpenRouterError(error) || attempt === OPENROUTER_MAX_ATTEMPTS - 1) {
                throw error;
              }

              const backoff = retryAfterMs(error) ?? OPENROUTER_RETRY_BASE_DELAY_MS * (2 ** attempt);

              pause(backoff);
              await abortableDelay(backoff, options?.signal);
            }
          }

          throw lastError instanceof Error ? lastError : new Error('OpenRouter request failed after retries.');
        };

        Promise.resolve()
          .then(execute)
          .then(resolve, reject)
          .finally(() => {
            active--;
            pump();
          });
      };

      if (options?.signal?.aborted) {
        queued = false;
        reject(abortError());
        return;
      }

      options?.signal?.addEventListener('abort', onAbort, { once: true });
      queue.push(start);
      pump();
    })
  };
}

// One app-wide gate means separate screens and request types cannot each open
// their own independent pool and accidentally exceed the intended OpenRouter
// concurrency ceiling when they overlap. Retry/backoff also lives here so every
// SDK request shares the same 429/5xx behavior.
export const openRouterRequestGate = createRequestGate(OPENROUTER_CONCURRENCY);

/**
 * Raw-fetch OpenRouter paths use the same gate/retry policy as SDK calls.
 * Retryable HTTP statuses are converted to thrown errors inside the gate so the
 * response cannot escape before centralized backoff has had a chance to run.
 */
export async function openRouterFetch (url: string, init: RequestInit, signal?: AbortSignal): Promise<Response> {
  return openRouterRequestGate.run(async () => {
    const response = await fetch(url, { ...init, ...(signal ? { signal } : {}) });

    if (response.status === 408 || response.status === 409 || response.status === 429 || (response.status >= 500 && response.status <= 599)) {
      throw new OpenRouterHttpError(response);
    }

    return response;
  }, { signal });
}
