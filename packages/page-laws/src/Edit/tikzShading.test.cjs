// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test tikzShading.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, 'tikzShading.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const context = { exports: {}, module: { exports: {} } };
vm.runInNewContext(compiled, context);
const { restoreTikzSvgShading } = context.exports;
const ball = '\\begin{tikzpicture}\\shade[ball color=red] (0,0) circle (1cm);\\end{tikzpicture}';

test('Restores a genuine 3-D radial shading instead of TikZ Editor black fill', () => {
  const result = restoreTikzSvgShading('<svg xmlns="http://www.w3.org/2000/svg"><circle cx="5" cy="5" r="5" fill="black"/></svg>', ball);
  assert.match(result, /<radialGradient/);
  assert.match(result, /stop-color="#ff4040"/);
  assert.match(result, /fill="url\(#slonig-shade-0\)"/);
  assert.doesNotMatch(result, /fill="black"/);
});

test('Restores multiple shaded 3-D spheres with distinct colors', () => {
  const source = '\\shade[ball color=green] (0,0) circle (1);\\shade[ball color=blue!35!white] (2,0) circle (1);';
  const svg = '<svg><circle fill="#000000" r="1"/><circle fill="black" r="1"/></svg>';
  const result = restoreTikzSvgShading(svg, source);
  assert.match(result, /stop-color="#40ff40"/);
  assert.match(result, /stop-color="#bcbcff"/);
  assert.match(result, /url\(#slonig-shade-0\)/);
  assert.match(result, /url\(#slonig-shade-1\)/);
});

test('Restores axis color blending (not just spheres)', () => {
  const result = restoreTikzSvgShading('<svg><path style="stroke:#222;fill:#000" d="M0 0h4v4z"/></svg>', '\\shadedraw[left color=red,right color=yellow] (0,0) rectangle (1,1);');
  assert.match(result, /<linearGradient/);
  assert.match(result, /x2="100%"/);
  assert.match(result, /stop-color="#ff0000"/);
  assert.match(result, /stop-color="#ffff00"/);
  assert.match(result, /fill:url\(#slonig-shade-0\)/);
});

test('Keeps ordinary black shapes and diagrams with an ambiguous shape count unchanged', () => {
  const svg = '<svg><path fill="black"/><path fill="black"/></svg>';
  assert.equal(restoreTikzSvgShading(svg, ball), svg);
  assert.equal(restoreTikzSvgShading('<svg><path fill="black"/></svg>', '\\fill (0,0) circle (1);'), '<svg><path fill="black"/></svg>');
});

test('Does not disturb already-correct colored or gradient SVG fills', () => {
  const svg = '<svg><defs><radialGradient id="ball"/></defs><circle fill="url(#ball)"/></svg>';
  assert.equal(restoreTikzSvgShading(svg, ball), svg);
});

test('Recognizes space-separated TikZ shading options on a fill path', () => {
  const svg = '<svg><path fill="#000" d="M0 0h1v1z"/></svg>';
  const result = restoreTikzSvgShading(svg, '\\path[shade, ball color = blue] (0,0) rectangle (1,1);');
  assert.match(result, /<radialGradient/);
  assert.match(result, /stop-color="#4040ff"/);
});

const { hasTikzBallShading } = context.exports;
const bridge = fs.readFileSync(path.join(__dirname, 'tikzEditorBridge.ts'), 'utf8');
const visual = fs.readFileSync(path.join(__dirname, 'TikzVisual.tsx'), 'utf8');
const display = fs.readFileSync(path.join(__dirname, 'TikzDisplay.tsx'), 'utf8');
const exactSphere = '\\begin{tikzpicture}\\shade[ball color=blue!65] (0,0) circle (1.2);\\end{tikzpicture}';
const knownRadial = '\\shade[shading=radial, inner color=white, outer color=cyan!35!blue!45] (0,0) circle (1.5);';

test('SVG compilation always loads ORIGINAL TikZ, without rewriting ball color', () => {
  assert.match(bridge, /this\.#pending = \{ reject, resolve, source, timer \}/);
  assert.match(bridge, /this\.#post\(\{ action: 'load', autosave: 1, source \}\)/);
  assert.doesNotMatch(bridge, /tikzForSvgConversion|needsTikzBallColorConversion|renderSource/);
  assert.match(bridge, /restoreTikzSvgShading\(normalizeTikzEditorSvg\(value\), key\)/);
  assert.match(bridge, /return cacheTikzEditorSvg\(key, svg\)/);
  assert.doesNotMatch(visual, /convertedForSvg|conversion-only copy/);
});

test('Old rewrite-failed sphere images are recompiled, but unrelated failures remain respected', () => {
  assert.equal(hasTikzBallShading(exactSphere), true);
  assert.equal(hasTikzBallShading(knownRadial), false);
  assert.equal(hasTikzBallShading('\\shade[shading=ball] (0,0) circle (1);'), true);
  assert.equal(hasTikzBallShading('\\draw[fill=black] (0,0) circle (1);'), false);
  assert.match(display, /hasCompileError && !forceCompile && !hasTikzBallShading\(value\)/);
});

test('Blue ball-color blend becomes a properly colored SVG radialGradient after compilation', () => {
  const result = restoreTikzSvgShading('<svg><circle r="1" fill="black"/></svg>', exactSphere);
  assert.match(result, /<radialGradient/);
  assert.match(result, /stop-color="#8383ff"/);
  assert.match(result, /fill="url\(#slonig-shade-0\)"/);
  assert.match(result, /<circle r="1"/);
});


// Captured example from the converter: the path is NOT black-filled. Its
// gradient URL must resolve to a matching colored paint-server definition.
const exportedBallPath = '<path data-source-id="path:0" d="M 0 0 M 34.1433 0 A 34.1433 34.1433 0 0 0 -34.1433 0 A 34.1433 34.1433 0 0 0 34.1433 0 Z" stroke="none" fill="url(#tikz-shading-ball-1)" stroke-width="0.4" stroke-linecap="butt" stroke-linejoin="miter" stroke-opacity="1" fill-opacity="1"></path>';

test('Fixes the exact compiled TikZ ball path when its URL paint server is missing', () => {
  const input = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-40 -40 80 80">${exportedBallPath}</svg>`;
  const result = restoreTikzSvgShading(input, exactSphere);
  assert.match(result, /<radialGradient id="tikz-shading-ball-1"/);
  assert.match(result, /stop-color="#8383ff"/);
  assert.ok(result.includes(exportedBallPath), 'original path and gradient reference must be unchanged');
  assert.equal((result.match(/id="tikz-shading-ball-1"/g) || []).length, 1);
});

test('Does not modify a working ball gradient definition or other black fills', () => {
  const good = '<radialGradient id="tikz-shading-ball-1"><stop offset="0%" stop-color="#ffffff"/><stop offset="100%" stop-color="#0000ff"/></radialGradient>';
  const input = `<svg><defs>${good}</defs>${exportedBallPath}<rect fill="black"/></svg>`;
  assert.equal(restoreTikzSvgShading(input, exactSphere), input);
});

test('Repairs a black-only referenced SVG gradient without changing the path', () => {
  const input = `<svg><defs><radialGradient id="tikz-shading-ball-1"><stop offset="0" stop-color="black"/><stop offset="1" stop-color="#000"/></radialGradient></defs>${exportedBallPath}</svg>`;
  const result = restoreTikzSvgShading(input, exactSphere);
  assert.match(result, /stop-color="#8383ff"/);
  assert.ok(result.includes(exportedBallPath));
  assert.doesNotMatch(result, /stop-color="black"/);
  assert.equal((result.match(/id="tikz-shading-ball-1"/g) || []).length, 1);
});

test('Leaves an unrelated missing URL paint server untouched', () => {
  const input = '<svg><path fill="url(#some-unrelated-asset)"/></svg>';
  assert.equal(restoreTikzSvgShading(input, exactSphere), input);
});

test('Leaves ball URL references unchanged if source-color matching is ambiguous', () => {
  const input = `<svg>${exportedBallPath}<path fill="url(#tikz-shading-ball-2)"/></svg>`;
  assert.equal(restoreTikzSvgShading(input, exactSphere), input);
});

test('Matches multiple referenced balls to their original colors in order', () => {
  const tikz = '\\shade[ball color=red] (0,0) circle (1);\\shade[ball color=blue] (3,0) circle (1);';
  const input = '<svg><path fill="url(#tikz-shading-ball-1)"/><path fill="url(#tikz-shading-ball-2)"/></svg>';
  const result = restoreTikzSvgShading(input, tikz);
  assert.match(result, /id="tikz-shading-ball-1"[^>]*>[\s\S]*?stop-color="#ff4040"/);
  assert.match(result, /id="tikz-shading-ball-2"[^>]*>[\s\S]*?stop-color="#4040ff"/);
});

test('Existing successful radial shading and ordinary black paths remain untouched', () => {
  const blackDrawing = '<svg><rect fill="black"/><circle fill="url(#g)"/></svg>';
  assert.equal(restoreTikzSvgShading(blackDrawing, knownRadial), blackDrawing);
  const mixedBlack = '<svg><path fill="black"/><circle fill="black"/></svg>';
  assert.equal(restoreTikzSvgShading(mixedBlack, exactSphere), mixedBlack);
});

test('Embedding a valid SVG is never gated on successful gradient repair', () => {
  const svg = '<svg><rect fill="black"/><circle fill="black"/></svg>';
  // Multiple black shapes in a document are ambiguous; return the valid SVG
  // unchanged rather than preventing the original editor export.
  assert.equal(restoreTikzSvgShading(svg, exactSphere), svg);
});

// Exercise the real render bridge with a minimal mock of the iframe protocol.
// This catches a regression where a transformed source is sent to the embedded
// compiler even though the pure shading unit tests keep passing.
test('Iframe bridge compiles original ball TikZ and stores a valid, corrected SVG', async () => {
  const bridgeCompiled = ts.transpileModule(bridge, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const messages = [];
  const database = new Map();
  const eventListeners = new Map();
  let iframe;
  const exportedSvg = '<svg><circle cx="1" cy="1" r="1" fill="black"/></svg>';
  const send = (event, extra = {}) => {
    const cb = eventListeners.get('message');
    if (cb) cb({ origin: 'https://texlyre.github.io', source: iframe.contentWindow, data: JSON.stringify({ event, ...extra }) });
  };
  const env = {
    exports: {},
    require(spec) {
      if (spec === '@slonigiraf/db') {
        return {
          getPersistedTikzSvg: async (version, key) => database.get(`${version}:${key}`),
          putPersistedTikzSvg: async (version, key, value) => { database.set(`${version}:${key}`, value); }
        };
      }
      if (spec === './tikzShading.js') return context.exports;
      throw new Error(`Unexpected import: ${spec}`);
    },
    window: {
      addEventListener(event, cb) { eventListeners.set(event, cb); },
      removeEventListener(event) { eventListeners.delete(event); }
    },
    document: {
      createElement(type) {
        assert.equal(type, 'iframe');
        iframe = {
          allow: '', tabIndex: 0, title: '', style: {}, src: '',
          setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {},
          contentWindow: {
            postMessage(data) {
              const message = JSON.parse(data);
              messages.push(message);
              if (message.action === 'load') queueMicrotask(() => send('loaded'));
              if (message.action === 'export') queueMicrotask(() => send('export', { format: 'svg', source: exactSphere, data: exportedSvg }));
            }
          }
        };
        return iframe;
      },
      body: { appendChild() { queueMicrotask(() => send('init')); } }
    },
    Object, Map, Promise, Error, setTimeout, clearTimeout
  };
  vm.runInNewContext(bridgeCompiled, env);
  const svg = await env.exports.renderTikzWithEditor(exactSphere);
  assert.equal(messages.find((m) => m.action === 'load')?.source, exactSphere);
  assert.match(svg, /radialGradient/);
  assert.match(svg, /fill="url\(#slonig-shade-0\)"/);
  const cached = await env.exports.getCachedTikzEditorSvg(exactSphere);
  assert.equal(svg, cached);
});
