// Copyright 2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
// Run: node --test coursePublication.integration.test.cjs
const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const source = fs.readFileSync(path.join(__dirname, 'publishProcessedBook.ts'), 'utf8');
const uiSource = fs.readFileSync(path.join(__dirname, '../../../features/skills/SkillsCourse.tsx'), 'utf8');

class BN {
  constructor(value) { this.value = BigInt(value instanceof BN ? value.value : value); }
  static isBN(value) { return value instanceof BN; }
  add(other) { this.value += BigInt(other.value); return this; }
  sub(other) { this.value -= BigInt(other.value); return this; }
  muln(value) { this.value *= BigInt(value); return this; }
  divn(value) { this.value /= BigInt(value); return this; }
  gt(other) { return this.value > other.value; }
  lt(other) { return this.value < other.value; }
  isZero() { return this.value === 0n; }
  toNumber() { return Number(this.value); }
  toString() { return String(this.value); }
  clone() { return new BN(this.value); }
}

const courseId = `0x${'11'.repeat(32)}`;
const directoryId = `0x${'22'.repeat(32)}`;
const moduleId = `0x${'33'.repeat(32)}`;
const digest = (index) => `0x${index.toString(16).padStart(64, '0')}`;
const lawType = { COURSE: 1, LIST: 2, MODULE: 3, SKILL: 4 };

function fixture({ shellExists = false, failFinalOnce = false } = {}) {
  const events = [];
  const items = new Map();
  const pinned = new Map();
  let nextDigest = 20;
  let shouldFailFinal = failFinalOnce;

  function store(id, json, amount = 0, hash = digest(nextDigest++)) {
    const item = { amount: new BN(amount), digestHex: hash, json };
    items.set(id, item);
    return item;
  }

  store(directoryId, { e: [], h: 'Courses', i: directoryId, t: lawType.LIST }, 11);
  if (shellExists) {
    store(courseId, { e: [], h: 'Course', i: courseId, t: lawType.COURSE }, 0);
  }

  function extrinsic(name, apply) {
    return {
      _name: name,
      encodedLength: 100,
      paymentInfo: async () => ({ partialFee: new BN(1), weight: new BN(10) }),
      signAndSend: async (_pair, onResult) => {
        if (name === 'final' && shouldFailFinal) {
          shouldFailFinal = false;
          throw new Error('Final batch temporarily unavailable');
        }
        await apply();
        events.push(name);
        onResult({ events: [], status: { isInBlock: true, isFinalized: false } });
        return () => {};
      }
    };
  }

  const tx = {
    laws: {
      create: (id, hash, amount) => extrinsic(`create:${id}:${amount}`, () => {
        assert.equal(items.has(id), false, `Already created ${id}`);
        store(id, pinned.get(hash), amount, hash);
        if (id === courseId) {
          assert.equal(items.get(directoryId).json.e.includes(courseId), false, 'Shell must stay unlisted');
        }
      }),
      edit: (id, oldHash, hash, amount) => extrinsic(`edit:${id}:${amount}`, () => {
        const previous = items.get(id);
        assert.equal(previous.digestHex, oldHash, 'Must not overwrite a newer digest');
        store(id, pinned.get(hash), amount, hash);
      })
    },
    utility: {
      batchAll: (operations) => extrinsic(operations.some((op) => op.name === 'final') ? 'final' : 'batch', async () => {
        for (const operation of operations) {
          await operation._apply();
        }
      })
    }
  };

  // Expose transaction descriptions to the batch so we can assert ordering
  // and simulate Substrate's atomic success/failure.
  function wrapTxMethod(factory) {
    return (...args) => {
      const operation = factory(...args);
      operation._apply = async () => {
        const name = operation._name;
        if (name.startsWith('create:')) {
          const [id, hash, amount] = args;
          assert.ok(!items.has(id));
          store(id, pinned.get(hash), amount, hash);
          if (id === courseId) assert.deepEqual(items.get(directoryId).json.e, []);
        } else {
          const [id, oldHash, hash, amount] = args;
          assert.equal(items.get(id).digestHex, oldHash);
          store(id, pinned.get(hash), amount, hash);
        }
        events.push(name);
      };
      operation._name = operation.name || operation._name;
      return operation;
    };
  }

  tx.laws.create = wrapTxMethod(tx.laws.create);
  tx.laws.edit = wrapTxMethod(tx.laws.edit);
  tx.utility.batchAll = (ops) => {
    const hasDirectoryEdit = ops.some((op) => op._name?.startsWith(`edit:${directoryId}:`));
    return extrinsic(hasDirectoryEdit ? 'final' : 'batch', async () => {
      for (const op of ops) await op._apply();
    });
  };

  const api = {
    tx,
    consts: {
      utility: { batchedCallsLimit: new BN(1000) },
      system: {},
      balances: { existentialDeposit: new BN(1) }
    },
    derive: { balances: { all: async () => ({ availableBalance: new BN(100000) }) } },
    events: { system: { ExtrinsicFailed: { is: () => false } } }
  };

  const imports = {
    '@slonigiraf/db': {
      putBookChapter: async () => {}, replaceAbility: async (id) => id,
      updateBookFields: async () => {}
    },
    '@slonigiraf/slonig-components': { LawType: lawType },
    'bn.js': { __esModule: true, default: BN },
    '@polkadot/util': { BN_ZERO: new BN(0) },
    '../../../../common/util.js': { randomIdHex: () => courseId },
    '../../domain/standards/standards.js': { moduleStandardsText: () => '', standardsChapterKey: () => '' },
    '../../infrastructure/storage/standardsStorage.js': { loadStoredBookStandards: () => ({}) },
    '../../domain/publishing/bookPublishing.js': {
      initialBookCourseJson: (id, title) => ({ e: [], h: title, i: id, t: lawType.COURSE }),
      bookModulePublishJson: ({ courseId: parent, moduleId: id, skillIds, title }) => ({ e: skillIds, h: title, i: id, p: parent, t: lawType.MODULE }),
      finalBookCourseJson: (id, title, modules, existing) => ({ ...existing, e: modules, h: title, i: id, t: lawType.COURSE })
    },
    './mapWithConcurrency.js': { mapWithConcurrency: async (values, _limit, fn) => Promise.all(values.map(fn)) }
  };
  const exports = {};
  const script = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  });
  assert.equal(script.diagnostics?.length || 0, 0);
  new Function('require', 'exports', script.outputText)((name) => {
    assert.ok(name in imports, `Unexpected module: ${name}`);
    return imports[name];
  }, exports);

  const options = {
    api, bookId: 1, courseName: 'Course', coursePrice: new BN(7),
    currentPair: { address: 'Alice' }, knowledgeId: directoryId,
    loadKnowledgeItem: async (id) => items.get(id),
    onBookUpdated: () => {}, onPublishedIds: () => {}, onStatus: () => {},
    pinKnowledgeItem: async (json) => {
      const hash = digest(nextDigest++);
      pinned.set(hash, json);
      return hash;
    },
    preparePublishedAbility: async () => { throw new Error('No skills in fixture'); },
    publishableChapters: [{ chapter: { id: 1, title: 'Chapter', knowledgeId: moduleId }, templates: [] }],
    modulePrice: new BN(2), skillPrice: new BN(1),
    storedBook: { id: 1, name: 'Course', knowledgeId: courseId }
  };

  return { events, items, options, publish: exports.publishProcessedBook };
}

test('zero-priced unlisted shell precedes modules; course burn and directory link are final', async () => {
  const f = fixture();
  await f.publish(f.options);
  const shellEvent = f.events.findIndex((event) => event === `create:${courseId}:0`);
  const moduleEvent = f.events.findIndex((event) => event === `create:${moduleId}:2`);
  const courseEdit = f.events.findIndex((event) => event === `edit:${courseId}:7`);
  const directoryEdit = f.events.findIndex((event) => event === `edit:${directoryId}:11`);

  assert.ok(shellEvent >= 0 && shellEvent < moduleEvent);
  assert.ok(moduleEvent < courseEdit && courseEdit < directoryEdit);
  assert.deepEqual(f.items.get(courseId).json.e, [moduleId]);
  assert.deepEqual(f.items.get(directoryId).json.e, [courseId]);
  assert.equal(f.items.get(courseId).amount.toString(), '7');
  assert.equal(f.items.get(directoryId).amount.toString(), '11');
});

test('failure before atomic finalization leaves shell unlisted and unburned, then retries', async () => {
  const f = fixture({ shellExists: true, failFinalOnce: true });
  await assert.rejects(f.publish(f.options), /Final batch temporarily unavailable/);
  assert.equal(f.items.get(courseId).amount.toString(), '0');
  assert.deepEqual(f.items.get(directoryId).json.e, []);
  assert.equal(f.events.some((event) => event === `create:${courseId}:0`), false);
  assert.deepEqual(f.items.get(moduleId).json.e, []);

  await f.publish(f.options);
  assert.equal(f.items.get(courseId).amount.toString(), '7');
  assert.deepEqual(f.items.get(directoryId).json.e, [courseId]);
});

test('a retry preserves a previously burned course price without mutating price objects', async () => {
  const f = fixture({ shellExists: true });
  f.items.get(courseId).amount = new BN(5);
  f.options.coursePrice = new BN(2);
  await f.publish(f.options);
  assert.equal(f.items.get(courseId).amount.toString(), '5', 'Course price must not decrease');
  assert.equal(f.options.coursePrice.toString(), '2', 'React price state must not be modified');
  assert.deepEqual(f.items.get(directoryId).json.e, [courseId]);
  assert.equal(f.events.some((event) => event === `create:${courseId}:0`), false);
});

test('an increased final price is burned once and does not modify the input BN', async () => {
  const f = fixture({ shellExists: true });
  f.items.get(courseId).amount = new BN(5);
  await f.publish(f.options);
  assert.equal(f.items.get(courseId).amount.toString(), '7');
  assert.equal(f.options.coursePrice.toString(), '7');
});

test('UI estimates the directory edit fee separately and includes it in the remaining total', () => {
  assert.match(uiSource, /api\.tx\.laws\.edit\(knowledgeId, parent\.digestHex, parent\.digestHex, parent\.amount\)\.paymentInfo\(currentPair\)/);
  assert.match(uiSource, /\.add\(directoryFee \|\| BN_ZERO\)/);
  assert.match(uiSource, /Maximum remaining insertion total \(burn \+ directory fee\)/);
  assert.match(uiSource, /\.clone\(\)\s*\.add\(/);
});
