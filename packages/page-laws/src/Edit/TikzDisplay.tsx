// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';
import { embedTikzSourceInSvg } from './tikz.js';
import { getCachedTikzEditorSvg, isRetryableTikzEditorError, renderTikzWithEditor } from './tikzEditorBridge.js';

interface Props {
  alt: string;
  displayMode?: 'default' | 'modal' | 'thumbnail';
  hasCompileError?: boolean;
  onCompileStateChange?: (hasError: boolean, renderedValue: string) => Promise<void> | void;
  recompileToken?: number;
  value: string;
}

export interface TikzPreRenderResult {
  compiled: boolean;
  diagnostics: string[];
  renderedSvg: string;
  retryable?: boolean;
  texInput: string;
}

function mountSvg (host: HTMLElement, svg: string): void {
  const documentResult = new DOMParser().parseFromString(svg, 'image/svg+xml');
  const parserError = documentResult.querySelector('parsererror');
  const svgElement = documentResult.documentElement;

  if (parserError || svgElement.nodeName.toLowerCase() !== 'svg') {
    throw new Error('TikZ Editor returned SVG that could not be parsed.');
  }

  host.replaceChildren(document.importNode(svgElement, true));
}

/**
 * Render one diagram through TikZ Editor's parser/semantic/SVG pipeline before
 * AI review. `texInput` remains for the existing review-prompt contract and is
 * the original TikZ source because there is no intermediate TeX compilation.
 */
export async function preRenderTikz (value: string): Promise<TikzPreRenderResult> {
  try {
    const renderedSvg = await renderTikzWithEditor(value);

    return {
      compiled: true,
      diagnostics: [],
      renderedSvg,
      retryable: false,
      texInput: value
    };
  } catch (error) {
    return {
      compiled: false,
      diagnostics: [error instanceof Error ? error.message : String(error)],
      renderedSvg: '',
      retryable: isRetryableTikzEditorError(error),
      texInput: value
    };
  }
}

/** Render TikZ into a standalone editable SVG suitable for persistence. */
export async function renderTikzToSvg (value: string): Promise<string> {
  const result = await preRenderTikz(value);

  if (!result.compiled || !result.renderedSvg.trim()) {
    const detail = result.diagnostics.slice(-3).join(' | ');

    throw new Error(detail ? `Unable to render TikZ for publishing: ${detail}` : 'Unable to render TikZ for publishing.');
  }

  return embedTikzSourceInSvg(result.renderedSvg, value);
}

export default function TikzDisplay ({ alt, displayMode = 'default', hasCompileError = false, onCompileStateChange, recompileToken = 0, value }: Props): React.ReactElement {
  const hostRef = useRef<HTMLDivElement>(null);
  const lastRecompileTokenRef = useRef(recompileToken);
  const onCompileStateChangeRef = useRef(onCompileStateChange);
  const [error, setError] = useState('');

  useEffect(() => {
    onCompileStateChangeRef.current = onCompileStateChange;
  }, [onCompileStateChange]);

  useEffect(() => {
    let isCancelled = false;
    const host = hostRef.current;
    const forceCompile = recompileToken !== lastRecompileTokenRef.current;

    lastRecompileTokenRef.current = recompileToken;

    if (!host) {
      return;
    }

    host.replaceChildren();
    setError('');

    const reportCompileState = (hasError: boolean): void => {
      if (isCancelled) {
        return;
      }

      Promise.resolve(onCompileStateChangeRef.current?.(hasError, value)).catch((reason: unknown) => {
        console.error('Unable to persist TikZ render state.', reason);
      });
    };

    // A visible editor Save/Autosave produces a known-good SVG even when a
    // stale compile-error flag has not yet been cleared by the parent. Look
    // for it in Dexie before suppressing rendering due to that flag.
    // Normal rendering checks Dexie itself, avoiding a duplicate DB lookup.
    if (hasCompileError && !forceCompile) {
      void getCachedTikzEditorSvg(value).then((cachedSvg) => {
        if (isCancelled) {
          return;
        }

        if (cachedSvg === undefined) {
          setError('TikZ rendering previously failed for this code. Open Edit and Save and exit to retry.');
          return;
        }

        try {
          mountSvg(host, cachedSvg);
          reportCompileState(false);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Unable to display rendered TikZ SVG.');
          reportCompileState(true);
        }
      });

      return () => {
        isCancelled = true;
        host.replaceChildren();
      };
    }

    preRenderTikz(value)
      .then((result) => {
        if (isCancelled) {
          return;
        }

        if (!result.compiled || !result.renderedSvg) {
          const detail = result.diagnostics.slice(-3).join(' | ') || 'TikZ rendering failed.';

          setError(result.retryable ? `${detail} Temporary renderer failure; retrying later will not mark this TikZ invalid.` : `${detail} Edit the TikZ code to retry.`);
          if (!result.retryable) {
            reportCompileState(true);
          }
          return;
        }

        try {
          mountSvg(host, result.renderedSvg);
          reportCompileState(false);
        } catch (reason) {
          setError(reason instanceof Error ? reason.message : 'Unable to display rendered TikZ SVG.');
          reportCompileState(true);
        }
      })
      .catch((reason: unknown) => {
        if (!isCancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to render TikZ.');
          reportCompileState(true);
        }
      });

    return () => {
      isCancelled = true;
      host.replaceChildren();
    };
  }, [hasCompileError, recompileToken, value]);

  return <>
    <TikzHost
      aria-label={alt}
      className={displayMode === 'default' ? undefined : `tikzDisplay--${displayMode}`}
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
  margin-inline: auto;
  max-height: 32rem;
  max-width: min(100%, 42rem);
  min-height: 220px;
  overflow: auto;
  padding: 0.75rem;
  width: 100%;

  > svg,
  > * > svg {
    height: auto;
    max-height: 30rem;
    max-width: 100%;
    width: auto;
  }

  &.tikzDisplay--thumbnail {
    border: 0;
    cursor: zoom-in;
    height: 150px;
    margin-inline: 0;
    max-height: 150px;
    max-width: min(100%, 32rem);
    min-height: 0;
    overflow: hidden;
    padding: 5px 0 0;
    width: 150px;

    > svg,
    > * > svg {
      height: auto;
      max-height: 100%;
      max-width: 100%;
      width: 100%;
    }
  }

  &.tikzDisplay--modal {
    border: 0;
    margin-inline: auto;
    max-height: calc(100dvh - 9rem);
    max-width: 100%;
    min-height: 0;
    overflow: auto;
    padding: 5px 0 0;
    width: 100%;

    > svg,
    > * > svg {
      height: auto;
      max-height: calc(100dvh - 9rem);
      max-width: 100%;
      width: auto;
    }
  }
`;

const RenderError = styled.small`
  color: #c33;
`;
