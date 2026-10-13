// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test standardsTabNavigation.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const controllerFile = path.join(__dirname, 'BookReaderController.tsx');
const navigationFile = path.join(__dirname, 'hooks/useBookReaderNavigationModel.ts');
const viewFile = path.join(__dirname, 'BookReaderView.tsx');
const controllerSource = fs.readFileSync(controllerFile, 'utf8');
const navigationSource = fs.readFileSync(navigationFile, 'utf8');
const viewSource = fs.readFileSync(viewFile, 'utf8');
const controllerAst = ts.createSourceFile('BookReaderController.tsx', controllerSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
const navigationAst = ts.createSourceFile('useBookReaderNavigationModel.ts', navigationSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TS);

function visit (root, predicate) {
  const found = [];
  function walk (node) {
    if (predicate(node)) found.push(node);
    ts.forEachChild(node, walk);
  }
  walk(root);
  return found;
}

function getPaneInitializer () {
  const declaration = visit(controllerAst, (node) => ts.isVariableDeclaration(node) &&
    node.name.getText(controllerAst) === '[activePane, setActivePane]')[0];
  assert.ok(declaration, 'controller should declare active pane state');
  assert.ok(ts.isCallExpression(declaration.initializer));
  const initializer = declaration.initializer.arguments[0];
  assert.ok(initializer);
  const emitted = ts.transpileModule(`module.exports = ${initializer.getText(controllerAst)};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  return (completedStages, savedPane = 'standards') => {
    const book = { id: 5, completedStages };
    const scope = {
      module: { exports: undefined },
      book,
      getSessionReaderPane: () => savedPane,
      isBookProcessingStageComplete: (value, stage) => value.completedStages.includes(stage)
    };
    vm.runInNewContext(emitted, scope);
    return scope.module.exports();
  };
}

const initialPane = getPaneInitializer();

test('Saved Standards tab is restored with existing matches even if Fix answer images is incomplete', () => {
  assert.equal(initialPane(['recognize', 'chapters', 'concepts', 'abilities', 'standards']), 'standards');
  assert.equal(initialPane(['recognize', 'chapters', 'concepts', 'abilities']), 'standards');
  assert.equal(initialPane(['recognize', 'chapters', 'concepts']), 'standards');
});

test('Previous guards for PDF recognition and unavailable embeddings are preserved', () => {
  assert.equal(initialPane(['abilities', 'standards']), 'text');
  assert.equal(initialPane(['recognize', 'concepts'], 'embeddings'), 'textConcepts');
  assert.equal(initialPane(['recognize'], 'embeddings'), 'text');
  assert.equal(initialPane(['recognize', 'embeddings'], 'embeddings'), 'embeddings');
});

test('Navigation effects do not bounce from Standards to Abilities during chapter loading', () => {
  const effects = visit(navigationAst, (node) => ts.isCallExpression(node) &&
    node.expression.getText(navigationAst) === 'useEffect');
  assert.ok(effects.length > 0);
  assert.ok(!effects.some((effect) => {
    const effectSource = effect.getText(navigationAst);
    return effectSource.includes("activePane === 'standards'") && effectSource.includes('setActivePane');
  }), 'Standards should remain selected regardless of Fix answer images completion');
  assert.match(navigationSource, /sessionStorage\.setItem\(readerPaneSessionKey\(book\.id\), activePane\)/);
});

test('Standards stays a selectable tab that renders the chapter results view', () => {
  assert.match(viewSource, /\['standards', 'Standards', revealedPanes\.has\('standards'\)/);
  assert.match(viewSource, /onClick=\{\(\) => setActivePane\(pane\)\}/);
  assert.match(viewSource, /activePane === 'standards'[\s\S]*?standardsPane\(\)/);
});
