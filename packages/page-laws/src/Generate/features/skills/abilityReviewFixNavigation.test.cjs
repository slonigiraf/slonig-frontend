// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test abilityReviewFixNavigation.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, 'components/AbilityReviewMode.tsx'), 'utf8');
const ast = ts.createSourceFile('AbilityReviewMode.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

function compile (body) {
  return ts.transpileModule(`module.exports = ${body};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
}

function findNode (matches) {
  let result;
  function walk (node) {
    if (matches(node)) result = node;
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.ok(result, 'Expected element in AbilityReviewMode');
  return result;
}

function extractCallback (name, context) {
  const declaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
  assert.ok(ts.isCallExpression(declaration.initializer));
  const code = compile(declaration.initializer.arguments[0].getText(ast));
  const sandbox = { module: { exports: null }, ...context };
  vm.runInNewContext(code, sandbox);
  return sandbox.module.exports;
}

function queueHarness ({ failsQueue = false, failsReview = false, isAlreadyReviewed = false } = {}) {
  const record = { id: 'first', reviewed: isAlreadyReviewed };
  const events = [];
  let releaseQueue;
  const queueGate = new Promise((resolve) => { releaseQueue = resolve; });
  const ctx = {
    advance: () => events.push('advance'),
    Error,
    current: { record },
    onError: (error) => events.push(`error:${error}`),
    onQueueFix: async () => {
      events.push('queue');
      await queueGate;
      if (failsQueue) throw new Error('Queue failed');
      events.push('queued');
    },
    onReviewed: async () => {
      events.push('review');
      if (failsReview) throw new Error('Review failed');
      events.push('reviewed');
    },
    setSaving: (saving) => events.push(saving ? 'saving' : 'idle'),
    useCallback: (callback) => callback
  };
  return { action: extractCallback('queueFixAndReview', ctx), events, record, releaseQueue, ctx };
}

test('Fix with AI queues, marks the Ability reviewed, then moves one forward', async () => {
  const { action, events, record, releaseQueue } = queueHarness();
  const operation = action(record, { overall: 'Fix the image' });
  assert.deepEqual(events, ['saving', 'queue']);
  releaseQueue();
  await operation;
  assert.deepEqual(events, ['saving', 'queue', 'queued', 'review', 'reviewed', 'advance', 'idle']);
});

test('Failed scheduling cannot mark reviewed or advance', async () => {
  const { action, events, record, releaseQueue } = queueHarness({ failsQueue: true });
  const operation = action(record, {});
  releaseQueue();
  await assert.rejects(operation, /Queue failed/);
  assert.deepEqual(events, ['saving', 'queue', 'idle']);
});

test('Failed review save keeps Ability visible, reports the error, and allows retry via Next', async () => {
  const { action, events, record, releaseQueue } = queueHarness({ failsReview: true });
  const operation = action(record, {});
  releaseQueue();
  await operation;
  assert.deepEqual(events, ['saving', 'queue', 'queued', 'review', 'error:Review failed', 'idle']);
});

test('Rescheduling an already-reviewed Ability advances without reviewing twice', async () => {
  const { action, events, record, releaseQueue } = queueHarness({ isAlreadyReviewed: true });
  const operation = action(record, {});
  releaseQueue();
  await operation;
  assert.deepEqual(events, ['saving', 'queue', 'queued', 'advance', 'idle']);
});

test('An existing queued fix shows an enabled Next button, even while other AI work runs', () => {
  const button = findNode((node) => ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Button' && node.attributes.properties.some((prop) => ts.isJsxAttribute(prop) && prop.name.text === 'className' && prop.initializer?.getText(ast).includes('abilityReviewReviewedButton')));
  const attributes = Object.fromEntries(button.attributes.properties.filter(ts.isJsxAttribute).map((attr) => [attr.name.text, attr.initializer?.getText(ast)]));
  assert.match(attributes.label, /isNextAction \? 'Next' : 'Reviewed'/);
  assert.match(attributes.icon, /isNextAction \? 'arrow-right'/);
  assert.match(attributes.isDisabled, /!isNextAction && \(isBusy \|\| \(Boolean\(queuedSplit\) && !allowQueuedReview\)\)/);
  assert.match(source, /const isNextAction = isCurrentReviewed \|\| \(Boolean\(queuedFixId\) && !allowQueuedReview\);/);
  assert.match(attributes.onClick, /isCurrentReviewed\) advance\(\);/);
  assert.match(attributes.onClick, /else void markReviewed\(\);/);
});

test('Space follows Next for queued fixes, persisting review when not previously reviewed', async () => {
  const effect = findNode((node) => ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes("event.key !== ' '") && node.arguments[0]?.getText(ast).includes('markReviewed'));
  const code = compile(effect.arguments[0].getText(ast));
  for (const alreadyReviewed of [false, true]) {
    const events = [];
    let onKeyDown;
    const context = {
      advance: () => events.push('advance'),
      current: { record: { id: 'first' } },
      document: { querySelector: () => null },
      Element: class {},
      hasLoadError: false,
      isBusy: true,
      isCurrentReviewed: alreadyReviewed,
      isLoading: false,
      isNextAction: true,
      markReviewed: async () => { events.push('review'); events.push('advance'); },
      queuedSplit: false,
      saving: false,
      window: { addEventListener: (_event, fn) => { onKeyDown = fn; }, removeEventListener: () => {} },
      module: { exports: null }
    };
    vm.runInNewContext(code, context);
    context.module.exports();
    let prevented = false;
    onKeyDown({ key: ' ', target: {}, preventDefault: () => { prevented = true; } });
    await Promise.resolve();
    assert.equal(prevented, true);
    assert.deepEqual(events, alreadyReviewed ? ['advance'] : ['review', 'advance']);
  }
});

function evaluate (name, context) {
  const declaration = findNode((node) => ts.isVariableDeclaration(node) && node.name.getText(ast) === name);
  const sandbox = { module: { exports: null }, ...context };
  vm.runInNewContext(compile(declaration.initializer.getText(ast)), sandbox);
  return sandbox.module.exports;
}

test('The next Ability and progress include confirmed saves while IndexedDB refresh catches up', () => {
  const entries = [
    { record: { id: 'a', reviewed: true } },
    { record: { id: 'b', reviewed: false } },
    { record: { id: 'c', reviewed: false } }
  ];
  const pending = evaluate('pending', { entries, acknowledgedReviewIds: [] });
  assert.deepEqual(Array.from(pending, ({ record }) => record.id), ['b', 'c']);
  assert.equal(evaluate('reviewedCount', { entries, pending }), 1);
  assert.equal(evaluate('current', { entries, pending, historyIndex: 0, visitedIds: [] }).record.id, 'b');

  // A missing/deleted historical ID must not strand the user on the done screen.
  assert.equal(evaluate('current', { entries, pending, historyIndex: 0, visitedIds: ['deleted'] }).record.id, 'b');
  // Going Back still works within the current session, including reviewed items.
  assert.equal(evaluate('current', { entries, pending, historyIndex: 0, visitedIds: ['a'] }).record.id, 'a');

  entries[1].record.reviewed = true;
  const remaining = evaluate('pending', { entries, acknowledgedReviewIds: [] });
  assert.deepEqual(Array.from(remaining, ({ record }) => record.id), ['c']);
  assert.equal(evaluate('current', { entries, pending: remaining, historyIndex: 1, visitedIds: ['b'] }).record.id, 'c');
  assert.equal(evaluate('reviewedCount', { entries, pending: remaining }), 2);
  // If the server-side write succeeds but the parent has not fetched a fresh
  // snapshot, Next must still switch to c in the *very first* rerender.
  entries[1].record.reviewed = false;
  const optimistic = evaluate('pending', { entries, acknowledgedReviewIds: ['b'] });
  assert.deepEqual(Array.from(optimistic, ({ record }) => record.id), ['c']);
  assert.equal(evaluate('current', { entries, pending: optimistic, historyIndex: 1, visitedIds: ['b'] }).record.id, 'c');
  assert.equal(evaluate('reviewedCount', { entries, pending: optimistic }), 2);
  assert.doesNotMatch(source, /navigationSessionKey|skippedIds/);
});

test('Review card is keyed by Ability ID so previous images and editors unmount before the next is rendered', () => {
  assert.match(source, /<AbilityConceptCard key=\{current\.record\.id\}/);
  assert.match(source, /content\.style\.setProperty\('--review-visual-height', '150px'\)/);
  assert.match(source, /content\.scrollTop = 0/);
});
