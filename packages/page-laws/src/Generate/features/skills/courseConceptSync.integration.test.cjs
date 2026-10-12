// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run with: node --test courseConceptSync.integration.test.cjs
// Tests the actual DB operation bodies against a small IndexedDB-shaped fake,
// without requiring a browser, network, or installing the full monorepo.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const dbSource = fs.readFileSync(path.resolve(__dirname, '../../../../../db/src/index.tsx'), 'utf8');
const ast = ts.createSourceFile('index.tsx', dbSource, ts.ScriptTarget.ESNext, true, ts.ScriptKind.TSX);

function declaration(name) {
  const functionNode = ast.statements.find((node) => ts.isFunctionDeclaration(node) && node.name?.text === name);
  assert.ok(functionNode, `Cannot find DB function ${name}`);
  return functionNode.getText(ast);
}

function installDbFunctions(dependencies) {
  const names = [
    'finiteDisplayOrder', 'orderedByDisplayOrder', 'reorderSubsetInExistingSlots',
    'saveBookCourseLearningOrder', 'deleteAbilityWithConcept'
  ];
  const code = `const CONCEPT_ABILITY_MODULE = /^book-(\\d+)-concept-(\\d+)$/;\n${names.map(declaration).join('\n')}`;
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const context = { ...dependencies, exports: {}, Set, Map, Number, Error };
  vm.runInNewContext(js, context);
  return context.exports;
}

function fixture({ concepts, abilities, chapters = [1, 2], courseOrder } = {}) {
  const book = { id: 100, chapterOrder: [...chapters], courseOrder: courseOrder || [] };
  const books = new Map([[100, book]]);
  const chapterRows = chapters.map((id) => ({ id, bookId: 100 }));
  const conceptRows = new Map((concepts || []).map((row) => [row.id, { bookPage: [100, 1], ...row }]));
  const abilityRows = new Map((abilities || []).map((row) => [row.id, { moduleId: `book-100-concept-${row.conceptId}`, ...row }]));
  let deletedConceptId;
  let removedImageCount = 0;
  const db = {
    transaction: async (...args) => args.at(-1)(),
    books: {
      get: async (id) => books.get(id),
      update: async (id, change) => { Object.assign(books.get(id), change); }
    },
    bookChapters: {
      where: () => ({ equals: (bookId) => ({ toArray: async () => chapterRows.filter((ch) => ch.bookId === bookId) }) })
    },
    bookConcepts: {
      get: async (id) => conceptRows.get(id),
      update: async (id, change) => { Object.assign(conceptRows.get(id), change); }
    },
    bookPages: {}, conceptEmbeddings: {}, skills: {}, images: {},
    abilities: {
      get: async (id) => abilityRows.get(id),
      delete: async (id) => { abilityRows.delete(id); },
      where: () => ({ equals: (moduleId) => ({
        primaryKeys: async () => [...abilityRows.values()].filter((row) => row.moduleId === moduleId).map((row) => row.id)
      }) })
    }
  };
  const api = installDbFunctions({
    db,
    chapterIdForConcept: async (concept) => concept?.chapterId,
    chapterConceptsForLearningOrder: async (chapterId) => ({
      concepts: [...conceptRows.values()].filter((row) => row.chapterId === chapterId)
    }),
    syncChapterLearningDisplayOrder: async (chapterId) => {
      const list = [...conceptRows.values()].filter((row) => row.chapterId === chapterId)
        .sort((a, b) => a.displayOrder - b.displayOrder || a.id - b.id);
      for (const [rank, row] of list.entries()) {
        row.displayOrder = rank;
        for (const ability of abilityRows.values()) {
          if (ability.moduleId === `book-100-concept-${row.id}`) ability.displayOrder = rank;
        }
      }
    },
    deleteBookConceptRows: async (id) => {
      deletedConceptId = id;
      conceptRows.delete(id);
      for (const ability of [...abilityRows.values()]) {
        if (ability.moduleId === `book-100-concept-${id}`) abilityRows.delete(ability.id);
      }
    },
    deleteUnreferencedAbilityImages: async () => { removedImageCount++; },
    abilityImageIds: () => []
  });
  return {
    ...api, book, conceptRows, abilityRows,
    conceptsOf: (id) => [...conceptRows.values()].filter((row) => row.chapterId === id)
      .sort((a, b) => a.displayOrder - b.displayOrder).map((row) => row.id),
    get deletedConceptId() { return deletedConceptId; },
    get removedImageCount() { return removedImageCount; }
  };
}

test('Course reorder sets Concept order, even when Ability displayOrders start equal', async () => {
  const f = fixture({
    chapters: [1],
    concepts: [
      { id: 11, chapterId: 1, displayOrder: 0 },
      { id: 12, chapterId: 1, displayOrder: 1 },
      { id: 13, chapterId: 1, displayOrder: 2 }
    ],
    abilities: [
      { id: 'aa', conceptId: 11, displayOrder: 0 },
      { id: 'bb', conceptId: 12, displayOrder: 0 },
      { id: 'cc', conceptId: 13, displayOrder: 0 }
    ]
  });
  await f.saveBookCourseLearningOrder(100, ['chapter:1', 'template:cc', 'template:aa', 'template:bb']);
  assert.deepEqual(f.conceptsOf(1), [13, 11, 12]);
  assert.deepEqual(['cc', 'aa', 'bb'].map((id) => f.abilityRows.get(id).displayOrder), [0, 1, 2]);
  assert.deepEqual(f.book.courseOrder, ['chapter:1', 'template:cc', 'template:aa', 'template:bb']);
});

test('Cross-chapter drag moves the Concept and retains the target chapter ordering', async () => {
  const f = fixture({
    concepts: [
      { id: 11, chapterId: 1, displayOrder: 0 },
      { id: 12, chapterId: 1, displayOrder: 1 },
      { id: 21, chapterId: 2, displayOrder: 0 },
      { id: 22, chapterId: 2, displayOrder: 1 }
    ],
    abilities: [
      { id: 'aa', conceptId: 11 }, { id: 'bb', conceptId: 12 },
      { id: 'cc', conceptId: 21 }, { id: 'dd', conceptId: 22 }
    ]
  });
  await f.saveBookCourseLearningOrder(100, ['chapter:1', 'template:aa', 'chapter:2', 'template:cc', 'template:bb', 'template:dd']);
  assert.deepEqual(f.conceptsOf(1), [11]);
  assert.deepEqual(f.conceptsOf(2), [21, 12, 22]);
  assert.equal(f.conceptRows.get(12).chapterId, 2);
});

test('Concepts without Abilities remain in their existing relative slots', async () => {
  const f = fixture({
    chapters: [1],
    concepts: [
      { id: 11, chapterId: 1, displayOrder: 0 },
      { id: 12, chapterId: 1, displayOrder: 1 },
      { id: 13, chapterId: 1, displayOrder: 2 }
    ],
    abilities: [{ id: 'aa', conceptId: 11 }, { id: 'cc', conceptId: 13 }]
  });
  await f.saveBookCourseLearningOrder(100, ['chapter:1', 'template:cc', 'template:aa']);
  assert.deepEqual(f.conceptsOf(1), [13, 12, 11]);
});

test('A Course reorder rejects splitting one Concept across two chapters', async () => {
  const f = fixture({
    concepts: [{ id: 11, chapterId: 1, displayOrder: 0 }],
    abilities: [{ id: 'aa', conceptId: 11 }, { id: 'bb', conceptId: 11 }]
  });
  await assert.rejects(() => f.saveBookCourseLearningOrder(100, ['chapter:1', 'template:aa', 'chapter:2', 'template:bb']), /cannot be split/);
  assert.equal(f.conceptRows.get(11).chapterId, 1);
});

test('Ability deletion removes the source Concept and every sibling Ability', async () => {
  const f = fixture({
    concepts: [{ id: 11, chapterId: 1, displayOrder: 0 }, { id: 12, chapterId: 1, displayOrder: 1 }],
    abilities: [{ id: 'aa', conceptId: 11 }, { id: 'ab', conceptId: 11 }, { id: 'bb', conceptId: 12 }],
    courseOrder: ['chapter:1', 'template:aa', 'template:ab', 'template:bb']
  });
  await f.deleteAbilityWithConcept('aa');
  assert.equal(f.deletedConceptId, 11);
  assert.deepEqual([...f.conceptRows.keys()], [12]);
  assert.deepEqual([...f.abilityRows.keys()], ['bb']);
  assert.deepEqual(f.book.courseOrder, ['chapter:1', 'template:bb']);
});

test('Non-Concept-linked orphan Ability deletion does not remove unrelated Concepts', async () => {
  const f = fixture({ concepts: [{ id: 11, chapterId: 1, displayOrder: 0 }] });
  f.abilityRows.set('plain', { id: 'plain', moduleId: 'legacy-standalone', content: '{}' });
  await f.deleteAbilityWithConcept('plain');
  assert.equal(f.abilityRows.has('plain'), false);
  assert.equal(f.conceptRows.has(11), true);
  assert.equal(f.removedImageCount, 1);
});

test('Both user-facing Ability delete controls invoke Concept-linked deletion', () => {
  const course = fs.readFileSync(path.join(__dirname, 'SkillsCourse.tsx'), 'utf8');
  const card = fs.readFileSync(path.join(__dirname, 'components/SkillsComponents.tsx'), 'utf8');
  const page = fs.readFileSync(path.join(__dirname, 'SkillsPage.tsx'), 'utf8');
  assert.match(course, /await deleteAbilityWithConcept\(recordId\)/);
  assert.match(card, /deleteAbilityWithConcept\(record\.id\)/);
  assert.match(course, /await saveBookCourseLearningOrder\(storedBook\.id, keys\)/);
  assert.doesNotMatch(page, /sortAbilitiesForDisplay\(/);
});
