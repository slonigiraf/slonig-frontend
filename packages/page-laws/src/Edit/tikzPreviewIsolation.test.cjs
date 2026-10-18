// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test tikzPreviewIsolation.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const bridge = fs.readFileSync(path.join(__dirname, 'tikzEditorBridge.ts'), 'utf8');
const compiled = ts.transpileModule(bridge, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('delayed or unattributed iframe responses cannot swap the two question image previews', async () => {
  const database = new Map();
  const listeners = new Map();
  let iframe;
  let rendering = '';
  const svg = (content) => `<svg><text>${content}</text></svg>`;
  const emit = (event, extra = {}) => {
    const listener = listeners.get('message');
    listener?.({ origin: 'https://texlyre.github.io', source: iframe.contentWindow, data: JSON.stringify({ event, ...extra }) });
  };
  const environment = {
    exports: {},
    require(spec) {
      if (spec === '@slonigiraf/db') return {
        getPersistedTikzSvg: async (version, key) => database.get(`${version}:${key}`),
        putPersistedTikzSvg: async (version, key, data) => { database.set(`${version}:${key}`, data); }
      };
      if (spec === './tikzShading.js') return { restoreTikzSvgShading: (data) => data };
      throw new Error(`Unexpected import: ${spec}`);
    },
    window: { addEventListener: (event, cb) => listeners.set(event, cb), removeEventListener: (event) => listeners.delete(event) },
    document: {
      createElement(type) {
        assert.equal(type, 'iframe');
        iframe = {
          style: {},
          setAttribute() {}, addEventListener() {}, removeEventListener() {}, remove() {},
          contentWindow: { postMessage(payload) {
            const command = JSON.parse(payload);
            if (command.action === 'load') {
              rendering = command.source;
              queueMicrotask(() => emit('loaded', { source: rendering }));
            }
            if (command.action === 'export') {
              if (rendering === 'question-two') {
                // Even an autosave tagged with the new source can carry a
                // stale preview: headless rendering must use explicit exports.
                queueMicrotask(() => emit('autosave', { source: rendering, svg: svg('first') }));
                // This response belongs to the previous Image. The iframe
                // can deliver it even though a new compile was requested.
                queueMicrotask(() => emit('export', { format: 'svg', source: 'question-one', data: svg('first') }));
                queueMicrotask(() => emit('export', { format: 'svg', data: svg('unattributed') }));
              }
              queueMicrotask(() => emit('export', { format: 'svg', source: rendering, data: svg(rendering) }));
            }
          } }
        };
        return iframe;
      },
      body: { appendChild() { queueMicrotask(() => emit('init')); } }
    },
    Object, Map, Promise, Error, setTimeout, clearTimeout
  };
  vm.runInNewContext(compiled, environment);
  const [one, two] = await Promise.all([
    environment.exports.renderTikzWithEditor('question-one'),
    environment.exports.renderTikzWithEditor('question-two')
  ]);
  assert.match(one, /question-one/);
  assert.match(two, /question-two/);
  assert.doesNotMatch(two, /first|unattributed/);
  assert.equal(await environment.exports.getCachedTikzEditorSvg('question-one'), one);
  assert.equal(await environment.exports.getCachedTikzEditorSvg('question-two'), two);
});
