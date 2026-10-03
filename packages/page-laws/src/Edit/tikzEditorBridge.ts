// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export const TIKZ_EDITOR_URL = 'https://texlyre.github.io/tikz-editor-embed-mirror/tikz-editor/index.html';
export const TIKZ_EDITOR_ORIGIN = 'https://texlyre.github.io';
export const TIKZ_EDITOR_RENDERER_ID = 'tikz-editor@0.5.2-texlyre.1';

const TIKZ_EDITOR_RENDER_TIMEOUT_MS = 30_000;
const TIKZ_EDITOR_EXPORT_RETRY_MS = 100;
const TIKZ_EDITOR_RENDER_RETRIES = 1;
const TIKZ_EDITOR_SVG_CACHE_LIMIT = 100;

export class TikzEditorRenderError extends Error {
  readonly retryable: boolean;

  constructor (message: string, retryable = false) {
    super(message);
    this.name = 'TikzEditorRenderError';
    this.retryable = retryable;
  }
}

export function isRetryableTikzEditorError (error: unknown): boolean {
  return error instanceof TikzEditorRenderError && error.retryable;
}

function transientRendererError (message: string): TikzEditorRenderError {
  return new TikzEditorRenderError(message, true);
}

const renderedSvgCache = new Map<string, string>();

export interface TikzEditorMessage {
  data?: string;
  error?: string;
  event?: 'autosave' | 'change' | 'export' | 'init' | 'loaded' | 'save';
  format?: string;
  source?: string;
  svg?: string;
  version?: string;
  xml?: string;
}

interface PendingRender {
  exportRetryTimer?: ReturnType<typeof setTimeout>;
  reject: (reason: Error) => void;
  resolve: (svg: string) => void;
  source: string;
  timer: ReturnType<typeof setTimeout>;
}

export function parseTikzEditorMessage (value: unknown): TikzEditorMessage | undefined {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as TikzEditorMessage;
    } catch {
      return undefined;
    }
  }

  if (value && typeof value === 'object') {
    return value as TikzEditorMessage;
  }

  return undefined;
}

export function normalizeTikzEditorSvg (value: string): string {
  const svg = value.trim();

  if (!/^<svg\b/i.test(svg) || !/<\/svg>$/i.test(svg)) {
    throw new TikzEditorRenderError('TikZ Editor returned invalid SVG markup.');
  }

  if (/broken-image\.svg(?:[?#"']|$)/i.test(svg)) {
    throw new TikzEditorRenderError('TikZ Editor produced a fallback broken image instead of a compiled SVG.');
  }

  return /<svg\b[^>]*\sxmlns\s*=/i.test(svg)
    ? svg
    : svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

/** Remember an SVG produced by the visible TikZ Editor for this exact source. */
export function cacheTikzEditorSvg (source: string, value: string): string {
  const key = source.trim();
  const svg = normalizeTikzEditorSvg(value);

  if (!key) {
    throw new Error('Cannot cache TikZ Editor SVG for empty source.');
  }

  // Refresh insertion order so the small module-level cache behaves like LRU.
  renderedSvgCache.delete(key);
  renderedSvgCache.set(key, svg);

  while (renderedSvgCache.size > TIKZ_EDITOR_SVG_CACHE_LIMIT) {
    const oldest = renderedSvgCache.keys().next().value as string | undefined;

    if (oldest === undefined) {
      break;
    }

    renderedSvgCache.delete(oldest);
  }

  return svg;
}

export function getCachedTikzEditorSvg (source: string): string | undefined {
  const key = source.trim();
  const svg = renderedSvgCache.get(key);

  if (svg !== undefined) {
    renderedSvgCache.delete(key);
    renderedSvgCache.set(key, svg);
  }

  return svg;
}

function svgFromMessage (message: TikzEditorMessage): string | undefined {
  if ((message.event === 'autosave' || message.event === 'save') && typeof message.svg === 'string') {
    return message.svg;
  }

  if (message.event === 'export' && message.format === 'svg') {
    if (typeof message.data === 'string') {
      return message.data;
    }

    if (typeof message.svg === 'string') {
      return message.svg;
    }
  }

  return undefined;
}

class TikzEditorRenderer {
  readonly #iframe: HTMLIFrameElement;
  #destroyedError: Error | undefined;
  #pending: PendingRender | undefined;
  #readyPromise: Promise<void>;
  #resolveReady: (() => void) | undefined;
  #rejectReady: ((reason: Error) => void) | undefined;
  #tail: Promise<void> = Promise.resolve();

  constructor () {
    this.#iframe = document.createElement('iframe');
    this.#iframe.allow = 'clipboard-read; clipboard-write';
    this.#iframe.setAttribute('aria-hidden', 'true');
    this.#iframe.tabIndex = -1;
    this.#iframe.title = 'TikZ Editor renderer';
    this.#iframe.src = TIKZ_EDITOR_URL;

    Object.assign(this.#iframe.style, {
      border: '0',
      height: '800px',
      left: '-12000px',
      opacity: '0',
      pointerEvents: 'none',
      position: 'fixed',
      top: '0',
      width: '1200px',
      zIndex: '-1'
    });

    this.#readyPromise = new Promise<void>((resolve, reject) => {
      this.#resolveReady = resolve;
      this.#rejectReady = reject;
    });

    window.addEventListener('message', this.#onMessage);
    this.#iframe.addEventListener('error', this.#onIframeError, { once: true });
    document.body.appendChild(this.#iframe);
  }

  render (source: string): Promise<string> {
    if (this.#destroyedError) {
      return Promise.reject(this.#destroyedError);
    }

    const result = this.#tail.then(() => this.#renderOne(source));

    this.#tail = result.then(() => undefined, () => undefined);

    return result;
  }

  #post (payload: object): void {
    this.#iframe.contentWindow?.postMessage(JSON.stringify(payload), TIKZ_EDITOR_ORIGIN);
  }

  #onIframeError = (): void => {
    const error = transientRendererError('Unable to load the TikZ Editor renderer.');

    this.#rejectReady?.(error);
    this.#rejectReady = undefined;
    this.#resolveReady = undefined;
    this.#failPending(error);
  };

  #onMessage = (event: MessageEvent): void => {
    if (event.origin !== TIKZ_EDITOR_ORIGIN || event.source !== this.#iframe.contentWindow) {
      return;
    }

    const message = parseTikzEditorMessage(event.data);

    if (!message?.event) {
      return;
    }

    if (message.event === 'init') {
      this.#resolveReady?.();
      this.#resolveReady = undefined;
      this.#rejectReady = undefined;
      return;
    }

    const pending = this.#pending;

    if (!pending) {
      return;
    }

    // `loaded` means the source has been applied, not that the asynchronous
    // preview SVG is ready. The embed deliberately resets `lastKnownSvg` on
    // load and can answer the first export with "SVG is not ready yet".
    // Start polling exports until the preview becomes available.
    if (message.event === 'loaded') {
      this.#requestSvgExport(pending);
      return;
    }

    const source = message.source ?? message.xml;

    if (typeof source === 'string' && source !== pending.source) {
      return;
    }

    const svg = svgFromMessage(message);

    if (!svg) {
      if (message.event === 'export' && message.format?.toLowerCase().includes('svg')) {
        if (message.error && !/not ready/i.test(message.error)) {
          this.#failPending(new Error(`TikZ Editor SVG export failed: ${message.error}`));
        } else {
          this.#scheduleSvgExportRetry(pending);
        }
      }

      return;
    }

    try {
      const normalized = normalizeTikzEditorSvg(svg);

      clearTimeout(pending.timer);
      if (pending.exportRetryTimer) {
        clearTimeout(pending.exportRetryTimer);
      }
      this.#pending = undefined;
      pending.resolve(normalized);
    } catch (error) {
      this.#failPending(error instanceof Error ? error : new Error(String(error)));
    }
  };

  #requestSvgExport (pending: PendingRender): void {
    if (this.#pending !== pending) {
      return;
    }

    this.#post({ action: 'export', format: 'svg' });
  }

  #scheduleSvgExportRetry (pending: PendingRender): void {
    if (this.#pending !== pending || pending.exportRetryTimer) {
      return;
    }

    pending.exportRetryTimer = setTimeout(() => {
      pending.exportRetryTimer = undefined;
      this.#requestSvgExport(pending);
    }, TIKZ_EDITOR_EXPORT_RETRY_MS);
  }

  #failPending (error: Error): void {
    const pending = this.#pending;

    if (!pending) {
      return;
    }

    clearTimeout(pending.timer);
    if (pending.exportRetryTimer) {
      clearTimeout(pending.exportRetryTimer);
    }
    this.#pending = undefined;
    pending.reject(error);
  }

  destroy (reason: Error = transientRendererError('TikZ Editor renderer was reset.')): void {
    if (this.#destroyedError) {
      return;
    }

    this.#destroyedError = reason;
    window.removeEventListener('message', this.#onMessage);
    this.#iframe.removeEventListener('error', this.#onIframeError);
    this.#failPending(reason);
    this.#rejectReady?.(reason);
    this.#rejectReady = undefined;
    this.#resolveReady = undefined;
    this.#iframe.remove();
  }

  async #renderOne (source: string): Promise<string> {
    if (this.#destroyedError) {
      throw this.#destroyedError;
    }

    if (!source.trim()) {
      throw new TikzEditorRenderError('TikZ source is empty.');
    }

    let readyTimeout: ReturnType<typeof setTimeout> | undefined;

    try {
      await Promise.race([
        this.#readyPromise,
        new Promise<never>((_, reject) => {
          readyTimeout = setTimeout(() => reject(transientRendererError('TikZ Editor renderer initialization timed out.')), TIKZ_EDITOR_RENDER_TIMEOUT_MS);
        })
      ]);
    } finally {
      if (readyTimeout) {
        clearTimeout(readyTimeout);
      }
    }

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.#failPending(transientRendererError('TikZ Editor rendering timed out.'));
      }, TIKZ_EDITOR_RENDER_TIMEOUT_MS);

      this.#pending = { reject, resolve, source, timer };
      this.#post({ action: 'load', autosave: 1, source });
    });
  }
}

let renderer: TikzEditorRenderer | undefined;

/** Render TikZ through the same parser/semantic/SVG engine used by TikZ Editor. */
export async function renderTikzWithEditor (source: string): Promise<string> {
  const cached = getCachedTikzEditorSvg(source);

  if (cached !== undefined) {
    return cached;
  }

  let lastError: unknown;

  for (let attempt = 0; attempt <= TIKZ_EDITOR_RENDER_RETRIES; attempt++) {
    const activeRenderer = renderer ??= new TikzEditorRenderer();

    try {
      const svg = await activeRenderer.render(source);

      return cacheTikzEditorSvg(source, svg);
    } catch (error) {
      lastError = error;

      if (isRetryableTikzEditorError(error)) {
        // A timed-out/failed iframe can remain alive while no longer producing
        // preview events. Never leave that poisoned singleton in the queue.
        if (renderer === activeRenderer) {
          renderer = undefined;
        }
        activeRenderer.destroy(error instanceof Error ? error : transientRendererError(String(error)));

        if (attempt < TIKZ_EDITOR_RENDER_RETRIES) {
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError instanceof Error ? lastError : new TikzEditorRenderError('Unable to render TikZ.');
}
