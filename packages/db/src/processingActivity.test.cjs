// Copyright 2026 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, 'processingActivity.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;

test('backup is blocked until both simultaneous book processes end', () => {
  const env = { exports: {}, Set, Symbol };
  vm.runInNewContext(compiled, env);
  const { getIsBookProcessingActive, setBookProcessingActivity, subscribeBookProcessingActivity } = env.exports;
  const changes = [];
  const unsubscribe = subscribeBookProcessingActivity(() => changes.push(getIsBookProcessingActive()));
  const first = Symbol('manual stage');
  assert.equal(getIsBookProcessingActive(), false);
  setBookProcessingActivity(first, true);
  setBookProcessingActivity('fastForward:42', true);
  assert.equal(getIsBookProcessingActive(), true);
  setBookProcessingActivity(first, false);
  assert.equal(getIsBookProcessingActive(), true);
  setBookProcessingActivity('fastForward:42', false);
  assert.equal(getIsBookProcessingActive(), false);
  assert.deepEqual(changes, [true, false]);
  unsubscribe();
});
