// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import 'fake-indexeddb/auto';

import { cacheTikzEditorSvg, getCachedTikzEditorSvg, isRetryableTikzEditorError, normalizeTikzEditorSvg, parseTikzEditorMessage, TikzEditorRenderError } from './tikzEditorBridge.js';

describe('TikZ Editor renderer bridge', (): void => {
  it('parses the JSON-stringified postMessage format used by the embed', (): void => {
    const message = parseTikzEditorMessage(JSON.stringify({
      event: 'export',
      format: 'svg',
      source: '\\begin{tikzpicture}\\end{tikzpicture}',
      data: '<svg></svg>'
    }));

    assert.equal(message?.event, 'export');
    assert.equal(message?.format, 'svg');
    assert.equal(message?.data, '<svg></svg>');
  });

  it("parses the embed's temporary SVG-not-ready export response", (): void => {
    const message = parseTikzEditorMessage(JSON.stringify({
      event: 'export',
      format: 'svg',
      source: '\\begin{tikzpicture}\\end{tikzpicture}',
      error: 'SVG is not ready yet. Wait for the preview to finish rendering and try again.',
      data: '',
      svg: ''
    }));

    assert.match(message?.error ?? '', /not ready/i);
    assert.equal(message?.data, '');
  });

  it('preserves Cyrillic text while making exported SVG standalone', (): void => {
    const svg = normalizeTikzEditorSvg('<svg><text>человек без признака</text></svg>');

    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg">/);
    assert.match(svg, /человек без признака/);
  });

  it('persists SVG produced by the visible editor without an in-memory cache', async (): Promise<void> => {
    const source = '\\begin{tikzpicture}\\node {человек без признака};\\end{tikzpicture}';
    const svg = cacheTikzEditorSvg(source, '<svg><text>человек без признака</text></svg>');

    assert.equal(await getCachedTikzEditorSvg(source), svg);
    assert.match(svg, /человек без признака/);
  });

  it('keeps the latest persisted SVG when the editor saves the same source repeatedly', async (): Promise<void> => {
    const source = '\\begin{tikzpicture}\\node {updated};\\end{tikzpicture}';

    cacheTikzEditorSvg(source, '<svg><text>first</text></svg>');
    const latest = cacheTikzEditorSvg(source, '<svg><text>latest</text></svg>');

    assert.equal(await getCachedTikzEditorSvg(source), latest);
  });

  it('rejects non-SVG output', (): void => {
    assert.throws(() => normalizeTikzEditorSvg('<div>not svg</div>'), /invalid SVG/i);
  });

  it('rejects TikZJax broken-image fallback SVGs as compile failures', (): void => {
    assert.throws(
      () => normalizeTikzEditorSvg('<svg><image href="https://cdn.jsdelivr.net/npm/@rod2ik/tikzjax@1.6.0/dist/assets/broken-image.svg" /></svg>'),
      /fallback broken image/i
    );
  });

  it('distinguishes transient renderer errors from deterministic compile errors', (): void => {
    assert.equal(isRetryableTikzEditorError(new TikzEditorRenderError('timeout', true)), true);
    assert.equal(isRetryableTikzEditorError(new TikzEditorRenderError('bad svg')), false);
    assert.equal(isRetryableTikzEditorError(new Error('other')), false);
  });
});
