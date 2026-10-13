// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test abilityEditAccess.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const abilitySource = fs.readFileSync(path.join(__dirname, '../../../abilities/abilities.ts'), 'utf8');
const cardSource = fs.readFileSync(path.join(__dirname, 'components/SkillsComponents.tsx'), 'utf8');

function fromAst (source, name, isCallback, context = {}) {
  const ast = ts.createSourceFile('source.tsx', source, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
  let snippet;
  const walk = (node) => {
    if (!isCallback && ts.isFunctionDeclaration(node) && node.name?.text === name) {
      snippet = node.getText(ast).replace(/^export\s+/, '');
    }
    if (isCallback && ts.isVariableDeclaration(node) && node.name.getText(ast) === name && ts.isCallExpression(node.initializer)) {
      snippet = node.initializer.arguments[0].getText(ast);
    }
    ts.forEachChild(node, walk);
  };
  walk(ast);
  assert.ok(snippet, `Missing ${name}`);
  const code = ts.transpileModule(`module.exports = ${snippet};`, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const scope = { module: { exports: null }, ...context };
  vm.runInNewContext(code, scope);
  return scope.module.exports;
}

const validate = fromAst(abilitySource, 'abilityEditValidationError', false);
const completeExercise = (overrides = {}) => ({ a: 'answer', h: 'question', i: '', p: '', ...overrides });
const ability = (q) => ({ h: 'Example', i: '', t: 3, q });

test('Manual edits remain saveable for valid image-only answer exercises', () => {
  for (const visual of [
    { i: '\\begin{tikzpicture}\\end{tikzpicture}' },
    { iPrompt: 'Draw the solution image' }
  ]) {
    const draft = ability([completeExercise({ a: '', ...visual }), completeExercise()]);
    assert.equal(validate(draft), null);
    assert.equal(validate(ability([completeExercise(), completeExercise({ a: '', ...visual })])), null);
  }
});

test('Manual edits still require an answer, image, or answer-image prompt for every exercise', () => {
  const draft = ability([completeExercise({ a: '', i: '', iPrompt: '' }), completeExercise()]);
  assert.match(validate(draft), /Exercise 1 needs a text answer or an answer image/);
  assert.match(validate(ability([completeExercise(), completeExercise({ h: '' })])), /Exercise 2 needs a question/);
  assert.match(validate({ ...draft, h: ' ' }), /Ability name is required/);
});

test('Edit Exercise opens the editor with an image-only answer', () => {
  const record = {
    ability: ability([completeExercise({ a: '', iPrompt: 'Diagram answer' }), completeExercise()]),
    content: '{"h":"Example"}'
  };
  const events = [];
  const context = {
    record,
    cloneAbility: (item) => ({ ...item, q: item.q.map((exercise) => ({ ...exercise })) }),
    setDraft: (value) => events.push(['draft', value]),
    setEditingExerciseIndex: (index) => events.push(['exercise', index]),
    setIsEditing: (value) => events.push(['editing', value])
  };
  fromAst(cardSource, 'openExerciseEdit', true, context)(0);
  assert.equal(events.at(-1)[1], true);
  assert.ok(events.some(([kind, value]) => kind === 'exercise' && value === 0));
  assert.equal(validate(events.find(([kind]) => kind === 'draft')[1]), null);
});

test('Exercise editing uses shared validation and its modal stays above the Review overlay', () => {
  assert.match(cardSource, /const draftError = draft \? abilityEditValidationError\(draft\)/);
  assert.match(cardSource, /isDisabled=\{isSaving \|\| Boolean\(draftError\)\}/);
  assert.match(cardSource, /isEditing && <AbilityEditModal/);
  assert.match(cardSource, /const AbilityEditModal = styled\(Modal\)`[\s\S]*?z-index: 1100/);
  assert.match(cardSource, /\{draftError && <p role='alert'/);
  assert.doesNotMatch(cardSource, /draft\.q\.some\(\(\{ a, h \}\) => !a\.trim\(\)/);
});

test('Ability menu has no Edit action and Edit Exercise always shows both visual value fields', () => {
  assert.doesNotMatch(cardSource, /\{ label: 'Edit',/);
  // Both visual values are part of the same unconditional exercise fieldset,
  // even when the corresponding value is empty or a prompt is supplied.
  const editExerciseFields = cardSource.split('{draft.q.map(')[1]?.split('</fieldset>)')[0];
  assert.ok(editExerciseFields, 'Exercise editor fieldset must exist');
  assert.match(editExerciseFields, /<span>Question visual value<\/span>\s*<textarea[\s\S]*?updateDraftExercise\(exerciseIndex, 'p', target.value\)[\s\S]*?value=\{exercise.p \?\? ''\}/);
  assert.match(editExerciseFields, /<span>Answer visual value<\/span>\s*<textarea[\s\S]*?updateDraftExercise\(exerciseIndex, 'i', target.value\)[\s\S]*?value=\{exercise.i\}/);
  assert.match(editExerciseFields, /<span>Question visual prompt<\/span>/);
  assert.match(editExerciseFields, /<span>Answer visual prompt<\/span>/);
  assert.match(cardSource, /onEditExercise=\{openExerciseEdit\}/);
});
