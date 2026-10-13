// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test manualQuestionImageEdit.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const vm = require('node:vm');

const dbSource = fs.readFileSync(path.join(__dirname, '../../../../../db/src/index.tsx'), 'utf8');
const cardSource = fs.readFileSync(path.join(__dirname, 'components/SkillsComponents.tsx'), 'utf8');
const ast = ts.createSourceFile('db.tsx', dbSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);
let putImageDeclaration;
function walk(node) {
  if (ts.isFunctionDeclaration(node) && node.name?.text === 'putImage') putImageDeclaration = node;
  ts.forEachChild(node, walk);
}
walk(ast);
assert.ok(putImageDeclaration);
const code = ts.transpileModule(`module.exports = ${putImageDeclaration.getText(ast).replace(/^export\s+/, '')}`, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

function harness() {
  const originalQuestion = { id: 101, type: 'tikz', data: 'old question', valid: true };
  const originalAnswer = { id: 102, type: 'tikz', data: 'answer image must stay', valid: true, visualQaStatus: 'passed', reviewResult: { sourceVersion: 'x' } };
  const otherAnswer = { id: 104, type: 'tikz', data: 'another exercise answer', valid: true, visualQaStatus: 'passed' };
  const images = new Map([originalQuestion, originalAnswer, otherAnswer].map((image) => [image.id, image]));
  const books = new Map([[12, { id: 12, completedStages: ['images', 'fixImages', 'answerImages', 'fixAnswerImages', 'standards'], bypassedStages: [] }]]);
  const db = {
    images: { get: async (id) => images.get(id), put: async (image) => { images.set(image.id, image); return image.id; } },
    abilities: { toArray: async () => [{ moduleId: 'book-12-concept-4', content: JSON.stringify({ q: [{ p: 101, i: 102 }, { p: 103, i: 104 }] }) }] },
    books: { get: async (id) => books.get(id), update: async (id, change) => { books.set(id, { ...books.get(id), ...change }); } },
    transaction: async (_mode, _images, _abilities, _books, callback) => callback()
  };
  const context = {
    module: { exports: null }, db,
    normalizedImageForStorage: (image) => image,
    isTikzImageQaPassed: () => false,
    parseAbilityJson: (content) => ({ root: JSON.parse(content) }),
    withInvalidatedBookProcessingStages: (book, stages) => ({
      ...book, completedStages: book.completedStages.filter((stage) => !stages.includes(stage)),
      bypassedStages: book.bypassedStages.filter((stage) => !stages.includes(stage))
    })
  };
  vm.runInNewContext(code, context);
  return { putImage: context.module.exports, images, books };
}

test('Manual question-image editing preserves its answer data and id, but invalidates answer QA', async () => {
  const { putImage, images, books } = harness();
  await putImage({ ...images.get(101), data: 'edited question' }, undefined, { preserveDependentAnswerImages: true });
  assert.equal(images.get(101).data, 'edited question');
  assert.equal(images.get(102).data, 'answer image must stay');
  assert.equal(images.get(102).type, 'tikz');
  assert.equal(images.get(102).valid, undefined);
  assert.equal(images.get(102).visualQaStatus, 'pending');
  assert.equal(images.get(102).reviewResult, undefined);
  assert.equal(images.get(104).data, 'another exercise answer');
  const stages = books.get(12).completedStages;
  assert.equal(stages.includes('answerImages'), true, 'manual edit must not schedule destructive answer regeneration');
  assert.equal(stages.includes('fixAnswerImages'), false);
  assert.equal(stages.includes('fixImages'), false);
});

test('AI question regeneration still invalidates dependent generated answers', async () => {
  const { putImage, images, books } = harness();
  await putImage({ ...images.get(101), data: 'regenerated question' });
  assert.equal(images.get(102).data, null);
  assert.equal(images.get(102).type, 'prompt');
  assert.equal(books.get(12).completedStages.includes('answerImages'), false);
});

test('The manual edit UI invokes putImage with the preservation option', () => {
  assert.match(cardSource, /await putImage\(\{ \.\.\.image, data: value, prompt, type: 'tikz', valid: undefined \}, undefined, \{ preserveDependentAnswerImages: true \}\)/);
});
