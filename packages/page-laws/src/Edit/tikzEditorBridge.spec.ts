// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { cacheTikzEditorSvg, getCachedTikzEditorSvg, normalizeTikzEditorSvg, parseTikzEditorMessage } from './tikzEditorBridge.js';

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

  it('reuses SVG produced by the visible editor for the exact Cyrillic source', (): void => {
    const source = '\\begin{tikzpicture}\\node {человек без признака};\\end{tikzpicture}';
    const svg = cacheTikzEditorSvg(source, '<svg><text>человек без признака</text></svg>');

    assert.equal(getCachedTikzEditorSvg(source), svg);
    assert.match(svg, /человек без признака/);
  });

  it('rejects non-SVG output', (): void => {
    assert.throws(() => normalizeTikzEditorSvg('<div>not svg</div>'), /invalid SVG/i);
  });
});
