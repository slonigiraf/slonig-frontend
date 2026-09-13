// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';

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

// Keep runtime assets on the same release as the installed package bundle.
// TikZJax needs these files at runtime in addition to its JavaScript bundle.
const TIKZJAX_ASSET_BASE = 'https://cdn.jsdelivr.net/npm/@rod2ik/tikzjax@1.6.0/dist';
const TIKZJAX_FONT_STYLESHEET = `${TIKZJAX_ASSET_BASE}/fonts.min.css`;
let tikzJaxPromise: Promise<void> | undefined;

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

function ensureTikzJax (): Promise<void> {
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
