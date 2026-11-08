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
const skillId = `0x${'44'.repeat(32)}`;
const digest = (index) => `0x${index.toString(16).padStart(64, '0')}`;
const lawType = { COURSE: 1, LIST: 2, MODULE: 3, SKILL: 4 };

function fixture({ shellExists = false, failFinalOnce = false, existingDirectoryIds = [], uploadCheckpoints = new Map() } = {}) {
  const events = [];
  const items = new Map();
  const pinned = new Map();
  const storedAbilities = new Map();
  const replacements = [];
  const pinnedSkills = [];
  const statuses = [];
  let nextDigest = 20;
  let shouldFailFinal = failFinalOnce;

  function store(id, json, amount = 0, hash = digest(nextDigest++)) {
    const item = { amount: new BN(amount), digestHex: hash, json };
    items.set(id, item);
    return item;
  }

  store(directoryId, { e: [...existingDirectoryIds], h: 'Courses', i: directoryId, t: lawType.LIST }, 11);
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
    genesisHash: { toHex: () => `0x${'aa'.repeat(32)}` },
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
      getAbility: async (id) => storedAbilities.get(id),
      getSkillUploadCheckpoint: async (bookId, chainGenesisHash, abilityId) =>
        uploadCheckpoints.get(`${bookId}:${chainGenesisHash}:${abilityId}`),
      putSkillUploadCheckpoint: async (entry) => {
        uploadCheckpoints.set(`${entry.bookId}:${entry.chainGenesisHash}:${entry.abilityId}`, entry);
      },
      putBookChapter: async () => {},
      replaceAbility: async (id, content, options) => {
        replacements.push({ id, content: JSON.parse(content), options });
        return `changed-${id}`;
      },
      updateBookFields: async () => {}
    },
    '@slonigiraf/slonig-components': { LawType: lawType },
    'bn.js': { __esModule: true, default: BN },
    '@polkadot/util': { BN_ZERO: new BN(0) },
    '../../../../common/util.js': { randomIdHex: () => skillId },
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
    onBookUpdated: () => {}, onPublishedIds: () => {}, onStatus: (status) => statuses.push(status),
    pinKnowledgeItem: async (json) => {
      if (json.t === lawType.SKILL) pinnedSkills.push(json);
      const hash = digest(nextDigest++);
      pinned.set(hash, json);
      return hash;
    },
    preparePublishedAbility: async () => { throw new Error('No skills in fixture'); },
    publishableChapters: [{ chapter: { id: 1, title: 'Chapter', knowledgeId: moduleId }, templates: [] }],
    modulePrice: new BN(2), skillPrice: new BN(1),
    storedBook: { id: 1, name: 'Course', knowledgeId: courseId }
  };

  return { events, items, options, pinnedSkills, publish: exports.publishProcessedBook, replacements, statuses, storedAbilities, uploadCheckpoints };
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

test('publishing to an existing list appends the Course without sorting or deduplicating existing entries', async () => {
  const first = `0x${'ff'.repeat(32)}`;
  const second = `0x${'00'.repeat(32)}`;
  const existingDirectoryIds = [first, second, first];
  const f = fixture({ existingDirectoryIds });

  await f.publish(f.options);

  assert.deepEqual(f.items.get(directoryId).json.e, [...existingDirectoryIds, courseId]);
  assert.deepEqual(existingDirectoryIds, [first, second, first], 'Must not mutate the source list');
  assert.equal(f.events.filter((event) => event === `edit:${directoryId}:11`).length, 1);
});

test('republishing a Course already in an existing list keeps its position and does not edit the list', async () => {
  const first = `0x${'ff'.repeat(32)}`;
  const last = `0x${'00'.repeat(32)}`;
  const existingDirectoryIds = [first, courseId, last];
  const f = fixture({ shellExists: true, existingDirectoryIds });
  const originalDigest = f.items.get(directoryId).digestHex;

  await f.publish(f.options);

  assert.deepEqual(f.items.get(directoryId).json.e, existingDirectoryIds);
  assert.equal(f.items.get(directoryId).digestHex, originalDigest, 'No directory upload or edit is needed');
  assert.equal(f.events.filter((event) => event === `edit:${directoryId}:11`).length, 0);
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


test('publishing an Ability knowledge ID preserves stored Image foreign keys', async () => {
  const f = fixture();
  const rowId = 'ability-row';
  const rawAbility = {
    h: 'Question', i: 'not-yet-published', q: [
      { a: 'Answer', h: 'Exercise', p: 17, i: 18 }
    ], t: lawType.SKILL
  };
  const hydratedAbility = {
    ...rawAbility, q: [{ ...rawAbility.q[0], p: 'original-tikz-question', i: 'original-tikz-answer' }]
  };

  f.storedAbilities.set(rowId, { content: JSON.stringify(rawAbility) });
  f.options.publishableChapters[0].templates = [
    { moduleId, recordId: rowId, template: hydratedAbility }
  ];
  f.options.preparePublishedAbility = async (template, id) => ({
    localAbility: { ...template, i: id },
    publishAbility: { ...template, i: id, q: [{ ...template.q[0], p: 'bafy-question', i: 'bafy-answer' }] }
  });

  await f.publish(f.options);

  assert.equal(f.replacements.length, 1);
  assert.equal(f.replacements[0].id, rowId);
  assert.equal(f.replacements[0].options.preserveImageReferences, true);
  assert.equal(f.replacements[0].content.i, skillId);
  assert.equal(f.replacements[0].content.q[0].p, 17);
  assert.equal(f.replacements[0].content.q[0].i, 18);
  assert.equal(f.items.get(skillId).json.q[0].p, 'bafy-question');
  assert.deepEqual(f.items.get(moduleId).json.e, [skillId]);
});


function withSkill(f, title = 'Original question') {
  f.options.publishableChapters[0].templates = [{
    moduleId,
    recordId: 'row-1',
    template: { h: title, i: skillId, t: lawType.SKILL }
  }];
  f.options.preparePublishedAbility = async (template, id) => ({
    localAbility: { ...template, i: id },
    publishAbility: { ...template, i: id }
  });
}

/** Simulate a crash after skill IPFS pinning but before blockchain writes. */
function failNextModuleUpload(f) {
  const pin = f.options.pinKnowledgeItem;
  let fail = true;
  f.options.pinKnowledgeItem = async (json) => {
    if (json.t === lawType.MODULE && fail) {
      fail = false;
      throw new Error('Simulated interruption before blockchain publishing');
    }
    return pin(json);
  };
}

test('IPFS skill digest checkpoint survives interruption and is reused on retry', async () => {
  const f = fixture();
  withSkill(f);
  failNextModuleUpload(f);

  await assert.rejects(f.publish(f.options), /Simulated interruption/);
  assert.equal(f.pinnedSkills.length, 1);
  assert.equal(f.uploadCheckpoints.size, 1);
  const entry = [...f.uploadCheckpoints.values()][0];
  assert.equal(entry.abilityId, skillId);
  assert.equal(entry.bookId, 1);
  assert.match(entry.contentHash, /^[a-f0-9]{64}$/);
  assert.match(entry.ipfsDigest, /^0x[a-f0-9]{64}$/);
  assert.equal(f.items.has(skillId), false, 'Skill has been pinned, but not created on-chain');

  await f.publish(f.options);
  assert.equal(f.pinnedSkills.length, 1, 'Retry must NOT re-pin identical JSON');
  assert.deepEqual(f.items.get(skillId).json, { h: 'Original question', i: skillId, t: lawType.SKILL });
  assert.ok(f.statuses.some((status) => status.includes('1 reused')));
});

test('changing an Ability invalidates its saved digest and uploads changed payload', async () => {
  const f = fixture();
  withSkill(f);
  failNextModuleUpload(f);

  await assert.rejects(f.publish(f.options), /Simulated interruption/);
  const oldHash = [...f.uploadCheckpoints.values()][0].contentHash;

  withSkill(f, 'Edited question');
  await f.publish(f.options);
  assert.equal(f.pinnedSkills.length, 2, 'Modified JSON must be pinned again');
  assert.equal(f.items.get(skillId).json.h, 'Edited question');
  assert.notEqual([...f.uploadCheckpoints.values()][0].contentHash, oldHash);
});

test('checkpoint never crosses blockchain networks', async () => {
  const f = fixture();
  withSkill(f);
  failNextModuleUpload(f);
  await assert.rejects(f.publish(f.options), /Simulated interruption/);

  f.options.api.genesisHash.toHex = () => `0x${'bb'.repeat(32)}`;
  await f.publish(f.options);
  assert.equal(f.pinnedSkills.length, 2);
  assert.equal(f.uploadCheckpoints.size, 2);
});

test('invalid checkpoint digests are ignored instead of being submitted to blockchain', async () => {
  const f = fixture();
  withSkill(f);
  failNextModuleUpload(f);
  await assert.rejects(f.publish(f.options), /Simulated interruption/);
  const key = [...f.uploadCheckpoints.keys()][0];
  f.uploadCheckpoints.get(key).ipfsDigest = 'not-a-valid-sha256-digest';

  await f.publish(f.options);
  assert.equal(f.pinnedSkills.length, 2);
  assert.equal(f.items.get(skillId).json.h, 'Original question');
});

test('failed pin never saves a checkpoint; subsequent retry must actually upload', async () => {
  const f = fixture();
  withSkill(f);
  const pin = f.options.pinKnowledgeItem;
  let fail = true;
  f.options.pinKnowledgeItem = async (json) => {
    if (json.t === lawType.SKILL && fail) {
      fail = false;
      throw new Error('Simulated IPFS error');
    }
    return pin(json);
  };
  await assert.rejects(f.publish(f.options), /Simulated IPFS error/);
  assert.equal(f.uploadCheckpoints.size, 0);

  await f.publish(f.options);
  assert.equal(f.pinnedSkills.length, 1);
  assert.equal(f.uploadCheckpoints.size, 1);
});

test('a partial multi-Ability upload reuses completed pins and uploads only the missing ones', async () => {
  const f = fixture();
  const ids = [skillId, `0x${'55'.repeat(32)}`, `0x${'66'.repeat(32)}`];
  f.options.publishableChapters[0].templates = ids.map((id, index) => ({
    moduleId, recordId: `row-${index}`,
    template: { h: `Question ${index}`, i: id, t: lawType.SKILL }
  }));
  f.options.preparePublishedAbility = async (template) => ({ localAbility: template, publishAbility: template });
  const pin = f.options.pinKnowledgeItem;
  let failed = false;
  f.options.pinKnowledgeItem = async (json) => {
    if (!failed && json.i === ids[2]) {
      failed = true;
      await new Promise((resolve) => setTimeout(resolve, 10));
      throw new Error('Network interrupted at skill 3');
    }
    return pin(json);
  };

  await assert.rejects(f.publish(f.options), /Network interrupted at skill 3/);
  assert.equal(f.pinnedSkills.length, 2);
  assert.equal(f.uploadCheckpoints.size, 2);
  assert.deepEqual(f.pinnedSkills.map(({ i }) => i), ids.slice(0, 2));

  await f.publish(f.options);
  assert.equal(f.pinnedSkills.length, 3, 'Only the previously failed item should be uploaded');
  assert.equal(f.uploadCheckpoints.size, 3);
  assert.deepEqual(f.items.get(moduleId).json.e, ids);
  assert.ok(f.statuses.some((status) => status.includes('2 reused')));
});
