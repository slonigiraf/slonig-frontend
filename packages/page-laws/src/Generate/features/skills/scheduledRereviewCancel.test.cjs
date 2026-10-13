// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test scheduledRereviewCancel.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const pageSource = fs.readFileSync(path.join(__dirname, 'SkillsPage.tsx'), 'utf8');
const reviewSource = fs.readFileSync(path.join(__dirname, 'components/AbilityReviewMode.tsx'), 'utf8');
const cardSource = fs.readFileSync(path.join(__dirname, 'components/SkillsComponents.tsx'), 'utf8');

function initializerFor (source, name) {
  const ast = ts.createSourceFile('test.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let found;
  function visit (node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === name) found = node.initializer.getText(ast);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  assert.ok(found, `Missing ${name}`);
  return found;
}
function evaluate (expression, context) {
  const js = ts.transpileModule(`module.exports = ${expression};`, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const sandbox = { module: { exports: undefined }, ...context };
  vm.runInNewContext(js, sandbox);
  return sandbox.module.exports;
}

const chapters = [{ concepts: [{ id: 20 }], abilities: [{ id: 'changed', moduleId: 'book-7-concept-20' }] }];
const current = { record: chapters[0].abilities[0], concept: chapters[0].concepts[0] };
const resolve = (job, chapters) => chapters[0].abilities.find((ability) => job.conceptId === 20 && (job.recordId === ability.id || chapters[0].abilities.length === 1));
const split = { id: 'split:20', kind: 'split', conceptId: 20 };
const fix = { id: 'fix:old', kind: 'fix', conceptId: 20, recordId: 'old' };

function matchingJobs (allowQueuedReview, queuedItems) {
  return evaluate(initializerFor(reviewSource, 'matchingQueuedItems'), { allowQueuedReview, current, chapters, queuedItems, queuedAbilityWorkRecord: resolve });
}

test('Scheduled rereview forwards split and fix queue items; standard review still gets the existing fix-only queue', () => {
  assert.match(pageSource, /queuedItems=\{isScheduledRereview \? queuedWorkItems : queuedFixItems\}/);
  assert.match(reviewSource, /scheduledWorkItemId=\{scheduledWorkItemId\}/);
});

test('All scheduled Ability types resolve to an actionable cancellation ID even after an Ability ID changes', () => {
  assert.deepEqual(Array.from(matchingJobs(true, [fix, split]), (item) => item.id), ['fix:old', 'split:20']);
  assert.deepEqual(Array.from(matchingJobs(true, [split]), (item) => item.id), ['split:20']);
  assert.equal(matchingJobs(false, [fix, split]).length, 0);
  assert.equal(evaluate(initializerFor(reviewSource, 'scheduledWorkItemId'), { matchingQueuedItems: matchingJobs(true, [split]) }), 'split:20');
  assert.equal(evaluate(initializerFor(reviewSource, 'scheduledWorkItemId'), { matchingQueuedItems: matchingJobs(true, [fix, split]) }), 'fix:old');
  assert.equal(evaluate(initializerFor(reviewSource, 'scheduledWorkItemId'), { matchingQueuedItems: [] }), undefined);
});

test('Cancel fixing is present for scheduled jobs and only disabled while editing/processing/busy', () => {
  assert.match(cardSource, /const cancellableWorkItemId = scheduledWorkItemId \?\? queuedFixItemId/);
  const action = cardSource.match(/\.\.\.\(cancellableWorkItemId \? \[\{ label: 'Cancel fixing', isDisabled: ([^,]+), onClick: \(\) => \{ void cancelFix\(\); \} \}\] : \[\]\)/);
  assert.ok(action, 'Missing queued-work cancellation menu action');
  assert.equal(evaluate(action[1], { onCancelFix: async () => {}, isBusy: false, isProcessing: false, isSaving: false }), false);
  assert.equal(evaluate(action[1], { onCancelFix: undefined, isBusy: false, isProcessing: false, isSaving: false }), true);
  assert.equal(evaluate(action[1], { onCancelFix: async () => {}, isBusy: true, isProcessing: false, isSaving: false }), true);
});

test('Cancel fixing removes only the selected queued job, with correct busy and failure behavior', async () => {
  const callback = initializerFor(cardSource, 'cancelFix').match(/useCallback\((async \(\): Promise<void> => \{[\s\S]*?\}), \[/)?.[1];
  assert.ok(callback);
  const calls = [];
  const cancel = evaluate(callback, {
    cancellableWorkItemId: 'split:20',
    onCancelFix: async (id) => { calls.push(id); },
    setIsCancellingFix: (status) => { calls.push(status); },
    onError: (error) => { calls.push(error); },
    Error
  });
  await cancel();
  assert.deepEqual(calls, [true, 'split:20', false]);
});

// The queued-jobs popup is hosted by the pipeline-only Skills instance. It
// must receive the same cancel callback as the non-pipeline Abilities view;
// otherwise the visible Cancel fixing action is always disabled.
test('Queued-jobs toolbar supplies cancellation to the review overlay, not just queue removal', () => {
  const readerSource = fs.readFileSync(path.join(__dirname, '../../pages/book-workspace/BookReaderView.tsx'), 'utf8');
  const ast = ts.createSourceFile('BookReaderView.tsx', readerSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  const skillsInstances = [];
  function visit (node) {
    if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(ast) === 'Skills') {
      const attributes = new Map(node.attributes.properties
        .filter(ts.isJsxAttribute)
        .map((attribute) => [attribute.name.getText(ast), attribute.initializer?.getText(ast)]));
      skillsInstances.push(attributes);
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  const toolbar = skillsInstances.find((attributes) => attributes.has('pipelineOnly'));
  const abilitiesPane = skillsInstances.find((attributes) => attributes.get('view') === "'preExercisesExercises'");
  assert.ok(toolbar, 'Missing queued Ability jobs toolbar');
  assert.ok(abilitiesPane, 'Missing main Abilities pane');
  for (const [name, attributes] of [['toolbar', toolbar], ['abilities pane', abilitiesPane]]) {
    assert.equal(attributes.get('onCancelFix'), '{cancelQueuedWorkItem}', `${name} must supply cancel callback`);
  }
  assert.equal(toolbar.get('onRemoveWorkQueueItem'), '{cancelQueuedWorkItem}');
  assert.match(pageSource, /<AbilityReviewMode[\s\S]*?onCancelFix=\{onCancelFix\}/);
  assert.match(reviewSource, /<AbilityCard[\s\S]*?onCancelFix=\{onCancelFix\}/);
});
