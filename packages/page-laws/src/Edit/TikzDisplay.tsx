// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';
import { embedTikzSourceInSvg } from './tikz.js';

interface Props {
  alt: string;
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
const PRERENDER_TIMEOUT_MS = 35_000;
let tikzJaxPromise: Promise<void> | undefined;
let preRenderQueue: Promise<void> = Promise.resolve();

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
    renderTimeout: current.renderTimeout ?? 30000,
    restartWorkerOnFail: current.restartWorkerOnFail ?? true,
    workerPool: {
      enabled: current.workerPool?.enabled ?? true,
      initializationRetries: current.workerPool?.initializationRetries ?? 1,
      maxWorkers: current.workerPool?.maxWorkers ?? 3,
      reserveCpuCores: current.workerPool?.reserveCpuCores ?? 1,
      useDeviceMemory: current.workerPool?.useDeviceMemory ?? true
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

function logText (values: unknown[]): string {
  return values.map((value) => {
    if (typeof value === 'string') {
      return value;
    }

    try {
      return JSON.stringify(value);
    } catch {
      return String(value);
    }
  }).join(' ');
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
    const originals = {
      error: console.error,
      log: console.log,
      warn: console.warn
    };

    const restoreConsole = (): void => {
      console.error = originals.error;
      console.log = originals.log;
      console.warn = originals.warn;
    };
    const cleanup = (): void => {
      if (timer) {
        clearTimeout(timer);
      }

      document.removeEventListener('tikzjax-load-finished', onFinished as EventListener, true);
      document.removeEventListener('tikzjax-tex-input', onTexInput as EventListener, true);
      observer.disconnect();
      restoreConsole();
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
    const captureConsole = (method: 'error' | 'log' | 'warn') => (...values: unknown[]): void => {
      originals[method](...values);
      const message = logText(values).trim();

      // data-show-console makes TeX diagnostics available through the console.
      // Keep only likely renderer/TeX lines so unrelated application logging does
      // not get sent to the AI review.
      if (message && /(?:tikz|tex|latex|pgf|error|undefined|missing|fatal|!\s)/i.test(message)) {
        diagnostics.push(message.slice(0, 4_000));
      }
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
      const fallback = Array.from(host.querySelectorAll('img')).find((image) => /(?:broken|error|fallback)/i.test(`${image.src} ${image.alt} ${image.title}`));

      if (fallback) {
        diagnostics.push(`TikZJax produced a fallback image: ${fallback.src || fallback.alt || 'render failure'}`);
        finish(false);
      }
    });

    console.error = captureConsole('error');
    console.log = captureConsole('log');
    console.warn = captureConsole('warn');
    document.addEventListener('tikzjax-load-finished', onFinished as EventListener, true);
    document.addEventListener('tikzjax-tex-input', onTexInput as EventListener, true);
    observer.observe(host, { childList: true, subtree: true });

    const script = document.createElement('script');

    script.type = 'text/tikz';
    script.dataset.disableCache = 'true';
    script.dataset.showConsole = 'true';
    script.dataset.debugTimings = 'true';
    script.textContent = value;
    host.appendChild(script);

    timer = setTimeout(() => {
      const svg = host.querySelector('svg');

      if (svg instanceof SVGElement) {
        finish(true, svg.outerHTML);
      } else {
        diagnostics.push('TikZJax pre-render timed out before a successful SVG was produced.');
        finish(false);
      }
    }, PRERENDER_TIMEOUT_MS);
  });
}

/**
 * Compile one diagram through the same TikZJax runtime used by the UI before AI
 * review. Calls are serialized because data-show-console reports diagnostics via
 * the global console and otherwise concurrent validation could mix messages.
 */
export function preRenderTikz (value: string): Promise<TikzPreRenderResult> {
  const run = preRenderQueue.then(() => runTikzPreRender(value), () => runTikzPreRender(value));

  preRenderQueue = run.then(() => undefined, () => undefined);

  return run;
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

  return embedTikzSourceInSvg(standaloneSvg, value);
}

export default function TikzDisplay ({ alt, value }: Props): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let isCancelled = false;
    const host = hostRef.current;

    if (!host) {
      return;
    }

    host.replaceChildren();
    setError('');

    ensureTikzJax()
      .then(() => {
        if (isCancelled || !hostRef.current) {
          return;
        }

        const script = document.createElement('script');

        script.type = 'text/tikz';
        script.dataset.ariaLabel = alt;
        script.textContent = value;
        hostRef.current.replaceChildren(script);
      })
      .catch((reason: unknown) => {
        if (!isCancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to load TikZ renderer.');
        }
      });

    return () => {
      isCancelled = true;
      host.replaceChildren();
    };
  }, [alt, value]);

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
