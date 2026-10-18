// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test abilityImageDeletion.integration.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const dbSource = fs.readFileSync(path.join(__dirname, '../../../../../db/src/index.tsx'), 'utf8');
const abilityCardSource = fs.readFileSync(path.join(__dirname, 'components/SkillsComponents.tsx'), 'utf8');
const reviewSource = fs.readFileSync(path.join(__dirname, 'components/AbilityReviewMode.tsx'), 'utf8');
const pageSource = fs.readFileSync(path.join(__dirname, 'SkillsPage.tsx'), 'utf8');
const visualsSource = fs.readFileSync(path.join(__dirname, '../../../Edit/ExerciseList.tsx'), 'utf8');

function productionFunction (source, name, context, isDeclaration = false) {
  const ast = ts.createSourceFile('test.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let code;
  function walk (node) {
    if (isDeclaration && ts.isFunctionDeclaration(node) && node.name?.text === name) {
      code = `module.exports = ${node.getText(ast).replace(/^export\s+/, '')};`;
    } else if (!isDeclaration && ts.isVariableDeclaration(node) && node.name.getText(ast) === name && ts.isCallExpression(node.initializer)) {
      code = `module.exports = ${node.initializer.arguments[0].getText(ast)};`;
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.ok(code, `Missing ${name}`);
  const transpiled = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const scope = { module: { exports: null }, ...context };
  vm.runInNewContext(transpiled, scope);
  return scope.module.exports;
}

function fixture () {
  const content = JSON.stringify({ h: 'Ability', i: '', q: [
    { h: 'Question 1', a: 'Answer 1', p: 12, i: 13, pPrompt: 'Make question diagram', iPrompt: 'Make solution diagram', pError: true },
    { h: 'Question 2', a: 'Answer 2', p: 14, i: null }
  ], t: 3 });
  const writes = [];
  const remove = productionFunction(dbSource, 'removeAbilityImage', {
    getAbility: async () => ({ id: 'old', content }),
    parseAbilityJson: (raw) => { const parsed = JSON.parse(raw); return { parsed, root: parsed }; },
    replaceAbility: async (id, raw) => { writes.push({ id, content: JSON.parse(raw) }); return 'new'; }
  }, true);
  return { remove, writes };
}

test('Deleting an Ability image unlinks only the selected visual and clears its generation prompt and error', async () => {
  const { remove, writes } = fixture();
  assert.equal(await remove('old', 0, 'p'), 'new');
  assert.equal(writes.length, 1);
  const { content, id } = writes[0];
  assert.equal(id, 'old');
  assert.equal(content.q[0].p, null);
  assert.equal('pPrompt' in content.q[0], false);
  assert.equal('pError' in content.q[0], false);
  assert.equal(content.q[0].i, 13);
  assert.equal(content.q[0].iPrompt, 'Make solution diagram');
  assert.equal(content.q[1].p, 14);
  // replaceAbility also removes orphaned Image rows transactionally.
  assert.match(dbSource, /await deleteUnreferencedAbilityImages\(abilityImageIds\(previous\.content\)\)/);
});

test('Deleting an answer visual retains its question image but removes the answer prompt', async () => {
  const { remove, writes } = fixture();
  await remove('old', 0, 'i');
  assert.equal(writes[0].content.q[0].i, null);
  assert.equal('iPrompt' in writes[0].content.q[0], false);
  assert.equal(writes[0].content.q[0].p, 12);
  assert.equal(writes[0].content.q[0].pPrompt, 'Make question diagram');
});

test('Deleting a visual without a stored image reference is rejected', async () => {
  const { remove, writes } = fixture();
  await assert.rejects(remove('old', 1, 'i'), /no longer references an Image/);
  assert.equal(writes.length, 0);
});

test('Removing the only answer image is rejected so the Ability stays editable', async () => {
  const { remove, writes } = fixture();
  const oldRead = productionFunction(dbSource, 'removeAbilityImage', {
    getAbility: async () => ({ content: JSON.stringify({ q: [{ a: '', i: 7 }] }) }),
    parseAbilityJson: (raw) => { const parsed = JSON.parse(raw); return { parsed, root: parsed }; },
    replaceAbility: async () => { assert.fail('Must not persist invalid Ability'); }
  }, true);
  await assert.rejects(oldRead('old', 0, 'i'), /Add a text answer/);
  assert.equal(writes.length, 0);
});

test('Image Save does not refresh/unmount the editor until Save and exit finishes', async () => {
  const savedVisual = { type: 'tikz', id: 12, prompt: 'Existing', data: 'old' };
  const pending = { current: false };
  const writes = [];
  let refreshes = 0;
  const context = {
    record: { id: 'old', ability: { q: [{ p: 'old', pPrompt: 'Make diagram' }] } },
    getImage: async () => savedVisual,
    storedAbilityImageId: () => 12,
    isTikzCode: (value) => value === 'valid TikZ',
    putImage: async (image) => { writes.push(image); },
    onDeleted: () => { refreshes++; },
    hasSavedVisualRef: pending
  };
  const save = productionFunction(abilityCardSource, 'saveVisual', context);
  const closed = productionFunction(abilityCardSource, 'visualEditorClosed', context);
  await save(0, 'p', 'valid TikZ');
  assert.equal(refreshes, 0);
  assert.equal(pending.current, true);
  assert.equal(writes[0].data, 'valid TikZ');
  assert.match(abilityCardSource, /preserveDependentAnswerImages: true/);
  assert.equal(writes[0].prompt, 'Make diagram');
  closed();
  assert.equal(refreshes, 1);
  closed();
  assert.equal(refreshes, 1);
  await assert.rejects(save(0, 'p', 'invalid TikZ'), /complete TikZ source/);
  assert.equal(writes.length, 1, 'An invalid source must not convert the editable image to prompt-only');
});

test('Review scope follows content-addressed Ability ID changes and persists the scope', () => {
  let selected = ['old', 'second'];
  const session = new Map();
  const handle = productionFunction(pageSource, 'handleReviewAbilityReplaced', {
    setReviewAbilityIds: (update) => { selected = update(selected); },
    reviewScopeSessionKey: 'scope',
    sessionStorage: { setItem: (key, value) => session.set(key, value) }
  });
  handle('old', 'new');
  assert.deepEqual(Array.from(selected), ['new', 'second']);
  assert.deepEqual(JSON.parse(session.get('scope')), ['new', 'second']);
  let visited = ['old', 'second'];
  let acknowledged = ['old'];
  let notified;
  const handleNavigation = productionFunction(reviewSource, 'handleAbilityReplaced', {
    setVisitedIds: (update) => { visited = update(visited); },
    setAcknowledgedReviewIds: (update) => { acknowledged = update(acknowledged); },
    onAbilityReplaced: (oldId, newId) => { notified = [oldId, newId]; }
  });
  handleNavigation('old', 'new');
  assert.deepEqual(Array.from(visited), ['new', 'second']);
  assert.deepEqual(Array.from(acknowledged), ['new']);
  assert.deepEqual(Array.from(notified), ['old', 'new']);
});

test('Delete controls match the edit style while retaining the original image action positioning', () => {
  assert.match(visualsSource, /className='abilityImageDeleteButton'/);
  assert.match(visualsSource, /header=\{`Delete \$\{alt\.toLowerCase\(\)\} image\?`\}/);
  assert.match(visualsSource, /onAbilityVisualDelete\(index, 'p'\)/);
  assert.match(visualsSource, /onAbilityVisualDelete\(index, 'i'\)/);
  assert.match(visualsSource, /\.abilityImageDeleteButton \{[\s\S]*?background: transparent/);
  assert.match(visualsSource, /\.abilityImageDeleteButton \{[\s\S]*?border: 0/);
  assert.match(visualsSource, /\.abilityImageDeleteButton \{[\s\S]*?color: var\(--color-text/);
  assert.match(visualsSource, /padding-left: 1\.55rem/);
  assert.match(visualsSource, /position: absolute/);
  assert.match(visualsSource, /left: 0\.05rem/);
});
