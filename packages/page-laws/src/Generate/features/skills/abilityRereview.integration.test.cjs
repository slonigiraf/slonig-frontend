// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test abilityRereview.integration.test.cjs
// Exercise the production rereview callback and scope filtering without a browser.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const pageSource = fs.readFileSync(path.join(__dirname, 'SkillsPage.tsx'), 'utf8');
const modeSource = fs.readFileSync(path.join(__dirname, 'components/AbilityReviewMode.tsx'), 'utf8');

function callbackFrom (source, variableName) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let callback;
  function walk (node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === variableName && ts.isCallExpression(node.initializer)) {
      callback = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  assert.ok(callback, `Missing ${variableName} callback`);
  return ts.transpileModule(`module.exports = ${callback};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
}

function makeRereview ({ fails = false, restrictedStorage = false, waitForReset = false } = {}) {
  const chapters = [
    { chapter: { title: 'First' }, abilities: [{ id: 'a', reviewed: true }] },
    { chapter: { title: 'Second' }, abilities: [{ id: 'b', reviewed: true }, { id: 'c', reviewed: true }] },
    { chapter: { title: 'Third' }, abilities: [{ id: 'd', reviewed: true }] }
  ];
  const state = { chapterContent: chapters, isReviewOpen: false, dialogOpen: true, loading: false, error: '', selectedIds: undefined, refreshed: 0, reset: null, notice: '' };
  const storage = new Map([['review-navigation', 'stale']]);
  let finishReset;
  const resetGate = waitForReset ? new Promise((resolve) => { finishReset = resolve; }) : Promise.resolve();
  const context = {
    book: { id: 42 },
    Error,
    chapterContent: chapters,
    rereviewChapterIndexes: new Set([1]),
    isResettingReview: false,
    resetBookAbilityReviews: async (id, ids) => {
      state.reset = { id, ids };
      await resetGate;
      if (fails) throw Error('Database failed');
    },
    setIsRereviewDialogOpen: (value) => { state.dialogOpen = value; },
    setIsResettingReview: (value) => { state.loading = value; },
    setChapterContent: (fn) => { state.chapterContent = fn(state.chapterContent); },
    setReviewAbilityIds: (ids) => { state.selectedIds = ids; },
    setIsReviewModeOpen: (value) => { state.isReviewOpen = value; },
    refreshContent: () => { state.refreshed++; },
    setNotice: (value) => { state.notice = value; },
    setError: (value) => { state.error = value; },
    reviewNavigationSessionKey: 'review-navigation',
    reviewScopeSessionKey: 'review-scope',
    activeReviewSessionKey: 'review',
    sessionStorage: {
      removeItem (key) { if (restrictedStorage) throw Error('Storage disabled'); storage.delete(key); },
      setItem (key, value) { if (restrictedStorage) throw Error('Storage disabled'); storage.set(key, value); }
    },
    module: { exports: null }
  };
  vm.runInNewContext(callbackFrom(pageSource, 'rereviewSelectedChapters'), context);
  return { action: context.module.exports, state, storage, finishReset };
}

test('Rereview opens mode after resetting only the selected chapters, and starts at unreviewed Abilities', async () => {
  const { action, state, storage, finishReset } = makeRereview({ waitForReset: true });
  const actionPromise = action();
  assert.equal(state.loading, true);
  assert.equal(state.isReviewOpen, false, 'Do not open the mode before the DB reset resolves');
  finishReset();
  await actionPromise;
  assert.equal(state.loading, false);
  assert.equal(state.dialogOpen, false);
  assert.equal(state.isReviewOpen, true);
  assert.equal(state.refreshed, 1);
  assert.deepEqual(Array.from(state.reset.ids), ['b', 'c']);
  assert.deepEqual(Array.from(state.selectedIds), ['b', 'c']);
  assert.deepEqual(JSON.parse(storage.get('review-scope')), ['b', 'c']);
  assert.equal(storage.get('review'), 'open');
  assert.equal(storage.has('review-navigation'), false);
  assert.deepEqual(state.chapterContent.map(({ abilities }) => abilities.map(({ reviewed }) => reviewed)), [[true], [false, false], [true]]);
});

test('Failed rereview leaves the dialog open and never starts Review mode', async () => {
  const { action, state } = makeRereview({ fails: true });
  await action();
  assert.equal(state.loading, false);
  assert.equal(state.dialogOpen, true);
  assert.equal(state.isReviewOpen, false);
  assert.equal(state.refreshed, 0);
  assert.equal(state.error, 'Database failed');
});

test('Rereview works without session storage', async () => {
  const { action, state } = makeRereview({ restrictedStorage: true });
  await action();
  assert.equal(state.isReviewOpen, true);
  assert.deepEqual(Array.from(state.selectedIds), ['b', 'c']);
});

test('Review mode filters to selected Ability IDs; normal review remains book-wide', () => {
  const code = callbackFrom(modeSource, 'entries');
  const chapters = [
    { chapter: { title: 'First' }, concepts: [], abilities: [{ id: 'a', moduleId: 'x' }] },
    { chapter: { title: 'Second' }, concepts: [], abilities: [{ id: 'b', moduleId: 'y' }, { id: 'c', moduleId: 'z' }] }
  ];
  function recordsFor (reviewAbilityIds) {
    const module = { exports: null };
    vm.runInNewContext(code, { chapters, reviewAbilityIds, module, Set });
    return Array.from(module.exports().map(({ record }) => record.id));
  }
  assert.deepEqual(recordsFor(undefined), ['a', 'b', 'c']);
  assert.deepEqual(recordsFor(['c', 'b']), ['b', 'c']);
  assert.deepEqual(recordsFor([]), []);
});

test('Central review text is 1.5x without enlarging the toolbar', () => {
  const styles = fs.readFileSync(path.join(__dirname, 'SkillsStyles.tsx'), 'utf8');
  const mainRule = styles.match(/\.abilityReviewContent\s*\{([^}]+)\}/);
  assert.ok(mainRule);
  assert.match(mainRule[1], /font-size:\s*150%/);
  assert.match(styles, /\.abilityReviewContent \.abilityConceptParent,[\s\S]*?font-size:\s*1\.7rem/);
});


test('Ability menu stays border-centered with a 1.5x narrower exercise gutter and clear edit buttons', () => {
  const styles = fs.readFileSync(path.join(__dirname, 'SkillsStyles.tsx'), 'utf8');
  const exercises = fs.readFileSync(path.join(__dirname, '../../../Edit/ExerciseList.tsx'), 'utf8');
  const menuRule = styles.match(/\.abilityCard > \.contentCardActions\s*\{([^}]+)\}/);
  const editRule = exercises.match(/\.abilityExerciseEditButton\s*\{([^}]+)\}/);
  const headingRule = exercises.match(/\.abilityExerciseEditable \.exercise-header\s*\{([^}]+)\}/);

  assert.ok(menuRule);
  assert.match(menuRule[1], /position:\s*absolute/);
  assert.match(menuRule[1], /top:\s*-0\.9rem/);
  assert.match(menuRule[1], /right:\s*0(?:;|$)/);
  assert.match(menuRule[1], /transform:\s*translateX\(50%\)/);
  assert.match(styles, /\.abilityCard \{ width: calc\(100% - 1\.375rem\); \}/);
  assert.match(styles, /\.abilityReviewContent \.abilityCard \{[^}]*width: calc\(100% - 1\.375rem\)/);
  assert.doesNotMatch(menuRule[1], /margin-bottom/);
  const gutterRule = styles.match(/\.abilityCard > \.contentCardActions \+ div\s*\{([^}]+)\}/);
  assert.ok(gutterRule);
  assert.match(gutterRule[1], /padding-right:\s*2\.333rem/);
  assert.match(styles, /\.abilityReviewContent \.abilityCard > \.contentCardActions \+ div \{[^}]*padding-right:\s*2\.333rem/);
  assert.ok(editRule);
  assert.match(editRule[1], /right:\s*0\.5rem/);
  assert.match(editRule[1], /top:\s*0\.5rem/);
  assert.doesNotMatch(editRule[1], /translate/);
  assert.ok(headingRule);
  assert.match(headingRule[1], /padding-right:\s*3\.25rem/);
  assert.match(styles, /\.abilityReviewContent \.abilityCard \.abilityExerciseEditable \.exercise-header \{ padding-right: 3\.25rem; \}/);
});


test('Review loading displays a vertically centered spinner labeled Loading until the matching content snapshot loads', () => {
  const styles = fs.readFileSync(path.join(__dirname, 'SkillsStyles.tsx'), 'utf8');
  assert.match(pageSource, /const isReviewDataLoading = !isContentSnapshotCurrent && !isReviewDataLoadFailed/);
  assert.match(pageSource, /isLoading=\{isReviewDataLoading\}/);
  assert.match(pageSource, /hasLoadError=\{isReviewDataLoadFailed\}/);
  assert.match(pageSource, /setLoadedContentSnapshotKey\(contentSnapshotKey\)/);
  assert.match(modeSource, /isLoading \? <div aria-label='Loading review data' className='abilityReviewLoading' role='status'>/);
  assert.match(modeSource, /<Spinner label='Loading' \/>/);
  assert.doesNotMatch(modeSource, /<span>Loading review data…<\/span>/);
  assert.doesNotMatch(modeSource, /isLoading \? 'Loading review data…'/);
  assert.match(modeSource, /: hasLoadError \? <div className='abilityReviewDone' role='alert'>/);
  assert.match(modeSource, /: current \? <>/);
  assert.match(styles, /\.abilityReviewLoading \{[^}]*align-items: center/);
  assert.match(styles, /\.abilityReviewLoading \{[^}]*inset: 0;[^}]*position: fixed/);
  assert.match(styles, /\.abilityReviewLoading \{[^}]*justify-content: center/);
  assert.match(styles, /\.abilityReviewLoading \.ui--Spinner \.text \{[^}]*font-size: 1rem/);
});

test('Review mode offers Retry on load failures rather than showing full-book completion', () => {
  assert.match(pageSource, /setFailedContentSnapshotKey\(contentSnapshotKey\)/);
  assert.match(modeSource, /<h3>Unable to load review data\.<\/h3>/);
  assert.match(modeSource, /label='Retry' onClick=\{onContentChange\}/);
  assert.match(modeSource, /!isLoading && !hasLoadError && <div className='abilityReviewProgress'/);
});
