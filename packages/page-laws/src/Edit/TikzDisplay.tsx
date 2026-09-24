// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';
import { embedTikzSourceInSvg } from './tikz.js';
import { getTikzRenderConcurrency } from './tikzConcurrency.js';
import { convertTikzTextToPaths } from './tikzGlyphPaths.js';

interface Props {
  alt: string;
  hasCompileError?: boolean;
  onCompileStateChange?: (hasError: boolean) => Promise<void> | void;
  value: string;
}

interface TikzJaxOptions {
  assetBaseUrl?: string;
  maxRetries?: number;
  renderTimeout?: number;
  restartWorkerOnFail?: boolean;
  workerPool?: {
    enabled?: boolean;
    initializationRetries?: number;
    maxWorkers?: number;
    reserveCpuCores?: number;
    useDeviceMemory?: boolean;
  };
}

type TikzJaxWindow = Window & {
  TikzJaxOptions?: TikzJaxOptions;
};

export interface TikzPreRenderResult {
  compiled: boolean;
  diagnostics: string[];
  renderedSvg: string;
  texInput: string;
}

// Keep runtime assets on the same release as the installed package bundle.
// TikZJax needs these files at runtime in addition to its JavaScript bundle.
const TIKZJAX_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/@rod2ik/tikzjax@1.6.0/dist';
const TIKZJAX_FONT_STYLESHEET = `${TIKZJAX_ASSET_BASE}/fonts.min.css`;
const TIKZJAX_FONT_BASE = `${TIKZJAX_ASSET_BASE}/fonts`;
const TIKZ_COMPILE_TIMEOUT_MS = 3_000;
const TIKZ_RENDER_CONCURRENCY = getTikzRenderConcurrency();
let tikzJaxPromise: Promise<void> | undefined;
let activePreRenders = 0;
const pendingPreRenders: Array<{ reject: (reason?: unknown) => void; resolve: (result: TikzPreRenderResult) => void; value: string }> = [];

function ensureFontStylesheet (): void {
  if (document.querySelector('link[data-tikzjax-fonts]')) {
    return;
  }

  const link = document.createElement('link');

  link.dataset.tikzjaxFonts = 'true';
  link.href = TIKZJAX_FONT_STYLESHEET;
  link.rel = 'stylesheet';
  document.head.appendChild(link);
}

export function ensureTikzJax (): Promise<void> {
  if (tikzJaxPromise) {
    return tikzJaxPromise;
  }

  ensureFontStylesheet();

  const tikzWindow = window as TikzJaxWindow;
  const current = tikzWindow.TikzJaxOptions ?? {};

  tikzWindow.TikzJaxOptions = {
    ...current,
    assetBaseUrl: current.assetBaseUrl ?? TIKZJAX_ASSET_BASE,
    maxRetries: current.maxRetries ?? 1,
    renderTimeout: TIKZ_COMPILE_TIMEOUT_MS,
    restartWorkerOnFail: current.restartWorkerOnFail ?? true,
    workerPool: {
      // The application deliberately allows two TikZ renders per logical CPU.
      // Do not apply a second CPU or memory reservation inside TikZJax, otherwise
      // its effective worker pool could be smaller than the app-level queue.
      enabled: true,
      initializationRetries: current.workerPool?.initializationRetries ?? 1,
      maxWorkers: TIKZ_RENDER_CONCURRENCY,
      reserveCpuCores: 0,
      useDeviceMemory: false
    }
  };

  // Import the package's prebuilt browser bundle directly. Importing the package root can
  // make some Webpack setups resolve the generic `main` entry and traverse Node-oriented
  // transitive dependencies instead of honoring the package's `browser` field.
  tikzJaxPromise = import('@rod2ik/tikzjax/dist/tikzjax.min.js').then(() => undefined);

  return tikzJaxPromise;
}

function eventDetailText (event: Event): string {
  const detail = (event as CustomEvent<unknown>).detail;

  if (typeof detail === 'string') {
    return detail;
  }

  if (detail && typeof detail === 'object') {
    try {
      return JSON.stringify(detail);
    } catch {
      return String(detail);
    }
  }

  return '';
}


function findTikzFallbackImage (root: ParentNode): HTMLImageElement | undefined {
  return Array.from(root.querySelectorAll('img')).find((image) => /(?:broken|error|fallback)/i.test(`${image.src} ${image.alt} ${image.title}`));
}

async function runTikzPreRender (value: string): Promise<TikzPreRenderResult> {
  await ensureTikzJax();

  const host = document.createElement('div');
  const diagnostics: string[] = [];
  let texInput = '';

  // TikZJax prioritizes visible work. Keep the pre-render attached and layout-capable,
  // but move it far outside the viewport so validation does not flash in the UI.
  Object.assign(host.style, {
    height: '800px',
    left: '-12000px',
    opacity: '0',
    overflow: 'hidden',
    pointerEvents: 'none',
    position: 'fixed',
    top: '0',
    width: '1200px',
    zIndex: '-1'
  });
  document.body.appendChild(host);

  return new Promise<TikzPreRenderResult>((resolve) => {
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
      }

      document.removeEventListener('tikzjax-load-finished', onFinished as EventListener, true);
      document.removeEventListener('tikzjax-tex-input', onTexInput as EventListener, true);
      observer.disconnect();
      host.remove();
    };
    const finish = (compiled: boolean, renderedSvg = ''): void => {
      if (settled) {
        return;
      }

      settled = true;
      cleanup();
      resolve({ compiled, diagnostics: Array.from(new Set(diagnostics)).slice(-80), renderedSvg, texInput });
    };
    const onTexInput = (event: Event): void => {
      const target = event.target;

      if (target instanceof Node && host.contains(target)) {
        texInput = eventDetailText(event).slice(0, 20_000);
      }
    };
    const onFinished = (event: Event): void => {
      const target = event.target;

      if (!(target instanceof Element) || !host.contains(target)) {
        return;
      }

      const svg = target.matches('svg') ? target : target.querySelector('svg');

      if (svg instanceof SVGElement) {
        finish(true, svg.outerHTML);
      }
    };
    const observer = new MutationObserver(() => {
      // A failed TikZJax render is replaced by a configured broken/fallback image.
      // Success is finalized by tikzjax-load-finished instead, so ordinary loader
      // elements do not produce a false positive.
      const fallback = findTikzFallbackImage(host);

      if (fallback) {
        diagnostics.push(`TikZJax produced a fallback image: ${fallback.src || fallback.alt || 'render failure'}`);
        finish(false);
      }
    });

    document.addEventListener('tikzjax-load-finished', onFinished as EventListener, true);
    document.addEventListener('tikzjax-tex-input', onTexInput as EventListener, true);
    observer.observe(host, { childList: true, subtree: true });

    const script = document.createElement('script');

    script.type = 'text/tikz';
    script.dataset.disableCache = 'true';
    script.textContent = value;

    // Arm the timeout before insertion so even an immediately completed render
    // can cancel it from the authoritative completion event.
    timer = setTimeout(() => {
      // Do not treat arbitrary SVG markup as success here. TikZJax may insert
      // transient/loader SVG before TeX compilation has actually completed.
      // Only tikzjax-load-finished is authoritative for a successful render.
      diagnostics.push('TikZJax pre-render timed out after 3 seconds before compilation finished.');
      finish(false);
    }, TIKZ_COMPILE_TIMEOUT_MS);
    host.appendChild(script);
  });
}

function drainPreRenderQueue (): void {
  while (activePreRenders < TIKZ_RENDER_CONCURRENCY && pendingPreRenders.length) {
    const next = pendingPreRenders.shift();

    if (!next) {
      return;
    }

    activePreRenders += 1;
    runTikzPreRender(next.value)
      .then(next.resolve, next.reject)
      .finally(() => {
        activePreRenders -= 1;
        drainPreRenderQueue();
      });
  }
}

/**
 * Compile one diagram through the same TikZJax runtime used by the UI before AI
 * review. Work is bounded by the current computer's reported CPU capacity so a
 * batch can render in parallel without flooding the browser with hidden hosts.
 */
export function preRenderTikz (value: string): Promise<TikzPreRenderResult> {
  return new Promise<TikzPreRenderResult>((resolve, reject) => {
    pendingPreRenders.push({ reject, resolve, value });
    drainPreRenderQueue();
  });
}

/**
 * Compile TikZ into a complete standalone SVG suitable for persistence. Unlike
 * the AI-review prompt, publication must never truncate the rendered markup.
 */
export async function renderTikzToSvg (value: string): Promise<string> {
  const result = await preRenderTikz(value);

  if (!result.compiled || !result.renderedSvg.trim()) {
    const detail = result.diagnostics.slice(-3).join(' | ');

    throw new Error(detail ? `Unable to compile TikZ for publishing: ${detail}` : 'Unable to compile TikZ for publishing.');
  }

  const svg = result.renderedSvg.trim();

  if (!/^<svg\b/i.test(svg) || !/<\/svg>$/i.test(svg)) {
    throw new Error('TikZ renderer returned invalid SVG markup.');
  }

  const standaloneSvg = /<svg\b[^>]*\sxmlns\s*=/i.test(svg)
    ? svg
    : svg.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');

  const outlinedSvg = await convertTikzTextToPaths(standaloneSvg, TIKZJAX_FONT_BASE);

  return embedTikzSourceInSvg(outlinedSvg, value);
}

export default function TikzDisplay ({ alt, hasCompileError = false, onCompileStateChange, value }: Props): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const onCompileStateChangeRef = useRef(onCompileStateChange);
  const [error, setError] = useState('');

  useEffect(() => {
    onCompileStateChangeRef.current = onCompileStateChange;
  }, [onCompileStateChange]);

  useEffect(() => {
    let isCancelled = false;
    let didReportCompileState = false;
    let compileTimer: ReturnType<typeof setTimeout> | undefined;
    const host = hostRef.current;

    if (!host) {
      return;
    }

    host.replaceChildren();
    setError('');

    if (hasCompileError) {
      setError('TikZ compilation previously failed for this code. Edit the TikZ code to retry.');

      return;
    }

    const reportCompileState = (hasError: boolean, message = ''): void => {
      if (didReportCompileState || isCancelled) {
        return;
      }

      didReportCompileState = true;

      if (hasError) {
        setError(message);
      }

      Promise.resolve(onCompileStateChangeRef.current?.(hasError)).catch((reason: unknown) => {
        console.error('Unable to persist TikZ compile state.', reason);
      });
    };
    const onFinished = (event: Event): void => {
      const target = event.target;

      if (!(target instanceof Element) || !host.contains(target)) {
        return;
      }

      const svg = target.matches('svg') ? target : target.querySelector('svg');

      if (!(svg instanceof SVGElement)) {
        return;
      }

      if (compileTimer) {
        clearTimeout(compileTimer);
        compileTimer = undefined;
      }

      reportCompileState(false);
    };
    const observer = new MutationObserver(() => {
      // A fallback image is authoritative failure. Do not use the mere presence
      // of an SVG as success: TikZJax can insert transient/loader SVG while the
      // actual TeX compile is still running.
      if (findTikzFallbackImage(host)) {
        if (compileTimer) {
          clearTimeout(compileTimer);
          compileTimer = undefined;
        }

        reportCompileState(true, 'TikZ compilation failed. Edit the TikZ code to retry.');
      }
    });

    document.addEventListener('tikzjax-load-finished', onFinished as EventListener, true);
    observer.observe(host, { childList: true, subtree: true });

    ensureTikzJax()
      .then(() => {
        if (isCancelled || !hostRef.current) {
          return;
        }

        const script = document.createElement('script');

        script.type = 'text/tikz';
        script.dataset.ariaLabel = alt;
        script.textContent = value;

        // Arm the timeout before insertion so an immediate completion event can
        // clear it and cannot be followed by a stale timeout that removes the SVG.
        compileTimer = setTimeout(() => {
          // If the authoritative completion event did not arrive within 3s, the
          // exact current source is invalid. Transient SVG children do not count.
          host.replaceChildren();
          reportCompileState(true, 'TikZ compilation timed out after 3 seconds. Edit the TikZ code to retry.');
        }, TIKZ_COMPILE_TIMEOUT_MS);
        hostRef.current.replaceChildren(script);
      })
      .catch((reason: unknown) => {
        if (!isCancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to load TikZ renderer.');
        }
      });

    return () => {
      isCancelled = true;

      if (compileTimer) {
        clearTimeout(compileTimer);
      }

      document.removeEventListener('tikzjax-load-finished', onFinished as EventListener, true);
      observer.disconnect();
      host.replaceChildren();
    };
  }, [alt, hasCompileError, value]);

  return <>
    <TikzHost
      aria-label={alt}
      ref={hostRef}
      role='img'
    />
    {error && <RenderError>{error}</RenderError>}
  </>;
}

const TikzHost = styled.div`
  align-items: center;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 0.35rem;
  box-sizing: border-box;
  display: flex;
  justify-content: center;
  min-height: 220px;
  overflow: auto;
  padding: 0.75rem;
  width: 100%;

  > svg,
  > * > svg {
    height: auto;
    max-width: 100%;
  }
`;

const RenderError = styled.small`
  color: #c33;
`;
