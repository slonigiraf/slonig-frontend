// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiPromise, SubmittableResult } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { DispatchError } from '@polkadot/types/interfaces';
import type { Book, BookChapter } from '@slonigiraf/db';
import type { GeneratedAbility, PreparedAbilityForPublishing } from '../../../../abilities/abilities.js';

import { deleteAbility, putBookChapter, storeAbility, updateBookFields } from '@slonigiraf/db';
import { LawType } from '@slonigiraf/slonig-components';
import BN from 'bn.js';

import { BN_ZERO } from '@polkadot/util';

import { randomIdHex } from '../../../../common/util.js';
import { moduleStandardsText, standardsChapterKey } from '../../domain/standards/standards.js';
import { loadStoredBookStandards } from '../../infrastructure/storage/standardsStorage.js';
import { bookModulePublishJson, finalBookCourseJson, initialBookCourseJson } from '../../domain/publishing/bookPublishing.js';

export interface TemplateRow {
  displayOrder?: number;
  moduleId: string;
  recordId: string;
  template: GeneratedAbility;
}

export interface ChapterTemplates {
  chapter: BookChapter;
  templates: TemplateRow[];
}

export interface KnowledgeItem {
  amount: BN;
  digestHex: string;
  json: Record<string, unknown>;
}

export interface PublishProcessedBookOptions {
  api: ApiPromise;
  bookId: number;
  courseName: string;
  currentPair: KeyringPair;
  knowledgeId: string;
  loadKnowledgeItem: (id: string) => Promise<KnowledgeItem | undefined>;
  modulePrice?: BN;
  onBookUpdated: (book: Book) => void;
  onPublishedIds: (ids: string[]) => void;
  onStatus: (status: string) => void;
  pinKnowledgeItem: (json: Record<string, unknown>) => Promise<string>;
  preparePublishedAbility: (template: GeneratedAbility, skillId: string) => Promise<PreparedAbilityForPublishing>;
  publishableChapters: ChapterTemplates[];
  skillPrice?: BN;
  storedBook: Book;
}

export const chapterOutlineKey = (id: number): string => `chapter:${id}`;
export const templateOutlineKey = (id: string): string => `template:${id}`;
export const isKnowledgeId = (value: string | undefined): value is string => !!value && /^0x[\da-f]{64}$/i.test(value);

const BATCH_SAFETY_PERCENT = 85;
const FALLBACK_WEIGHT_PERCENT = 64;
const MAX_PUBLISH_BATCH_CALLS = 1000;

interface SimpleWeight {
  proofSize: BN;
  refTime: BN;
}

interface PublishOperation {
  amount: BN;
  id?: string;
  transaction: SubmittableExtrinsic<'promise'>;
}

interface PublishBatch {
  ids: string[];
  operationCount: number;
  operations: PublishOperation[];
  partialFee: BN;
  transaction: SubmittableExtrinsic<'promise'>;
}

interface PublishLimits {
  maxCalls: number;
  maxEncodedLength?: number;
  maxWeight?: SimpleWeight;
}

function valueToBn (value: unknown): BN {
  if (BN.isBN(value)) {
    return value;
  }

  if (value && typeof value === 'object' && typeof (value as { toBn?: unknown }).toBn === 'function') {
    return (value as { toBn: () => BN }).toBn();
  }

  return new BN(String(value));
}

function weightToSimple (weight: unknown): SimpleWeight {
  if (weight && typeof weight === 'object' && 'refTime' in weight) {
    const structured = weight as { proofSize?: unknown; refTime: unknown };

    return {
      proofSize: structured.proofSize === undefined ? BN_ZERO : valueToBn(structured.proofSize),
      refTime: valueToBn(structured.refTime)
    };
  }

  return { proofSize: BN_ZERO, refTime: valueToBn(weight) };
}

function scaleWeight (weight: SimpleWeight, percent: number): SimpleWeight {
  return {
    proofSize: weight.proofSize.muln(percent).divn(100),
    refTime: weight.refTime.muln(percent).divn(100)
  };
}

function exceedsWeight (weight: SimpleWeight, limit: SimpleWeight): boolean {
  return weight.refTime.gt(limit.refTime) || (!limit.proofSize.isZero() && weight.proofSize.gt(limit.proofSize));
}

function readPublishLimits (api: ApiPromise): PublishLimits {
  const utilityConsts = api.consts.utility as unknown as { batchedCallsLimit?: unknown };
  const runtimeBatchLimit = utilityConsts.batchedCallsLimit === undefined
    ? MAX_PUBLISH_BATCH_CALLS
    : valueToBn(utilityConsts.batchedCallsLimit).toNumber();
  const systemConsts = api.consts.system as unknown as {
    blockLength?: { max?: { normal?: unknown } };
    blockWeights?: {
      maxBlock: unknown;
      perClass: { normal: { maxExtrinsic: { isSome: boolean; unwrap: () => unknown } } };
    };
  };
  const normalMaxLength = systemConsts.blockLength?.max?.normal;
  let maxWeight: SimpleWeight | undefined;

  if (systemConsts.blockWeights) {
    const { maxBlock, perClass } = systemConsts.blockWeights;

    maxWeight = perClass.normal.maxExtrinsic.isSome
      ? scaleWeight(weightToSimple(perClass.normal.maxExtrinsic.unwrap()), BATCH_SAFETY_PERCENT)
      : scaleWeight(weightToSimple(maxBlock), FALLBACK_WEIGHT_PERCENT);
  }

  return {
    maxCalls: Math.max(1, Math.min(runtimeBatchLimit, MAX_PUBLISH_BATCH_CALLS)),
    maxEncodedLength: normalMaxLength === undefined
      ? undefined
      : valueToBn(normalMaxLength).muln(BATCH_SAFETY_PERCENT).divn(100).toNumber(),
    maxWeight
  };
}

function splitOperations (operations: PublishOperation[]): [PublishOperation[], PublishOperation[]] {
  const middle = Math.ceil(operations.length / 2);

  return [operations.slice(0, middle), operations.slice(middle)];
}

async function buildPublishBatch (
  api: ApiPromise,
  currentPair: KeyringPair,
  batchAll: (transactions: SubmittableExtrinsic<'promise'>[]) => SubmittableExtrinsic<'promise'>,
  limits: PublishLimits,
  operations: PublishOperation[]
): Promise<PublishBatch[]> {
  const transaction = operations.length === 1
    ? operations[0].transaction
    : batchAll(operations.map(({ transaction }) => transaction));

  if (limits.maxEncodedLength !== undefined && transaction.encodedLength > limits.maxEncodedLength) {
    if (operations.length === 1) {
      throw new Error(`A publishing transaction is too large (${transaction.encodedLength} bytes; safe limit ${limits.maxEncodedLength} bytes).`);
    }

    const [left, right] = splitOperations(operations);

    return [
      ...await buildPublishBatch(api, currentPair, batchAll, limits, left),
      ...await buildPublishBatch(api, currentPair, batchAll, limits, right)
    ];
  }

  const paymentInfo = await transaction.paymentInfo(currentPair);

  if (limits.maxWeight && exceedsWeight(weightToSimple(paymentInfo.weight), limits.maxWeight)) {
    if (operations.length === 1) {
      throw new Error('A single publishing transaction exceeds the chain safe weight limit.');
    }

    const [left, right] = splitOperations(operations);

    return [
      ...await buildPublishBatch(api, currentPair, batchAll, limits, left),
      ...await buildPublishBatch(api, currentPair, batchAll, limits, right)
    ];
  }

  return [{
    ids: operations.map(({ id }) => id).filter((id): id is string => !!id),
    operationCount: operations.length,
    operations,
    partialFee: new BN(paymentInfo.partialFee.toString()),
    transaction
  }];
}

async function buildPublishBatches (
  api: ApiPromise,
  currentPair: KeyringPair,
  batchAll: (transactions: SubmittableExtrinsic<'promise'>[]) => SubmittableExtrinsic<'promise'>,
  operations: PublishOperation[]
): Promise<PublishBatch[]> {
  if (!operations.length) {
    return [];
  }

  const limits = readPublishLimits(api);
  const batches: PublishBatch[] = [];

  for (let start = 0; start < operations.length; start += limits.maxCalls) {
    const chunk = operations.slice(start, start + limits.maxCalls);

    batches.push(...await buildPublishBatch(api, currentPair, batchAll, limits, chunk));
  }

  return batches;
}

function isResourceLimitError (error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);

  return /TooManyCalls|ExhaustsResources|exhaust(?:s|ed)?.*resources|block.*(?:limit|weight)|transaction.*(?:large|size)|exceed(?:s|ed)?.*(?:weight|length|size)|proof.?size/i.test(message);
}

async function submitPublishBatches (
  batches: PublishBatch[],
  phase: string,
  api: ApiPromise,
  currentPair: KeyringPair,
  batchAll: (transactions: SubmittableExtrinsic<'promise'>[]) => SubmittableExtrinsic<'promise'>,
  onPublishedIds: (ids: string[]) => void,
  onStatus: (status: string) => void
): Promise<void> {
  const operationTotal = batches.reduce((total, batch) => total + batch.operationCount, 0);
  const pendingBatches = [...batches];
  let completed = 0;
  let index = 0;

  while (index < pendingBatches.length) {
    const batch = pendingBatches[index];

    onStatus(`Publishing ${phase}: ${completed}/${operationTotal} operations (batch ${index + 1}/${pendingBatches.length})…`);

    try {
      await submitTransaction(batch.transaction, currentPair, api);
    } catch (error) {
      if (!isResourceLimitError(error) || batch.operations.length === 1) {
        throw error;
      }

      const [left, right] = splitOperations(batch.operations);
      const limits = readPublishLimits(api);
      const replacement = [
        ...await buildPublishBatch(api, currentPair, batchAll, limits, left),
        ...await buildPublishBatch(api, currentPair, batchAll, limits, right)
      ];

      pendingBatches.splice(index, 1, ...replacement);
      onStatus(`Blockchain resource limit reached; retrying ${phase} with smaller batches…`);
      continue;
    }

    completed += batch.operationCount;

    if (batch.ids.length) {
      onPublishedIds(batch.ids);
    }

    index++;
  }
}

function transactionError (api: ApiPromise, { events }: SubmittableResult): string {
  return events
    .filter(({ event }) => api.events.system.ExtrinsicFailed.is(event))
    .map(({ event }) => {
      const error = event.data[0] as DispatchError;

      return error.isModule
        ? api.registry.findMetaError(error.asModule).method
        : error.toString();
    })
    .join(', ');
}

async function submitTransaction (transaction: SubmittableExtrinsic<'promise'>, pair: KeyringPair, api: ApiPromise): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    let isSettled = false;
    let unsubscribe: undefined | (() => void);

    const settle = (handler: () => void): void => {
      if (isSettled) {
        return;
      }

      isSettled = true;
      unsubscribe?.();
      handler();
    };

    transaction.signAndSend(pair, (result: SubmittableResult) => {
      if (!result.status.isInBlock && !result.status.isFinalized) {
        return;
      }

      const failure = transactionError(api, result);

      failure
        ? settle(() => reject(new Error(failure)))
        : settle(resolve);
    })
      .then((stop: () => void) => {
        unsubscribe = stop;

        if (isSettled) {
          stop();
        }
      })
      .catch((error: unknown) => settle(() => reject(error)));
  });
}

export async function publishProcessedBook ({ api, bookId, courseName, currentPair, knowledgeId, loadKnowledgeItem, modulePrice, onBookUpdated, onPublishedIds, onStatus, pinKnowledgeItem, preparePublishedAbility, publishableChapters, skillPrice, storedBook }: PublishProcessedBookOptions): Promise<Book> {
  const batchAll = api.tx.utility?.batchAll;

  if (!batchAll) {
    throw new Error('This chain does not support atomic batch publishing.');
  }

  const createAtomicBatch = (transactions: SubmittableExtrinsic<'promise'>[]): SubmittableExtrinsic<'promise'> => batchAll(transactions);
  const selectedList = await loadKnowledgeItem(knowledgeId);

  if (!selectedList || selectedList.json.t !== LawType.LIST) {
    throw new Error('The selected publishing location is not a knowledge list.');
  }

  const trimmedCourseName = courseName.trim();
  const savedCourseId = isKnowledgeId(storedBook.knowledgeId) ? storedBook.knowledgeId : randomIdHex();
  let savedCourse = await loadKnowledgeItem(savedCourseId);
  const standardsByChapter = loadStoredBookStandards(bookId);
  const templateRecordChanges = new Map<string, string>();
  const preparedChapters = await Promise.all(publishableChapters.map(async ({ chapter, templates }) => {
    const moduleId = isKnowledgeId(chapter.knowledgeId) ? chapter.knowledgeId : randomIdHex();
    const preparedTemplates = await Promise.all(templates.map(async (row) => {
      const skillId = isKnowledgeId(row.template.i) ? row.template.i : randomIdHex();
      const { localAbility, publishAbility } = await preparePublishedAbility(row.template, skillId);
      const didLocalTemplateChange = JSON.stringify(localAbility) !== JSON.stringify(row.template);
      let recordId = row.recordId;

      // Persist only the local representation. storeAbility moves q[].p/q[].i
      // visual payloads into Image rows and leaves image ids in the stored
      // Ability. The IPFS CID substitutions in publishAbility exist only for
      // this final publishing operation.
      if (didLocalTemplateChange) {
        const newRecordId = await storeAbility(row.moduleId, JSON.stringify(localAbility), row.displayOrder);

        if (newRecordId !== row.recordId) {
          await deleteAbility(row.recordId);
          templateRecordChanges.set(row.recordId, newRecordId);
          recordId = newRecordId;
        }
      }

      return { ...row, recordId, template: publishAbility };
    }));

    if (chapter.knowledgeId !== moduleId) {
      await putBookChapter({ ...chapter, knowledgeId: moduleId });
    }

    return { chapter: { ...chapter, knowledgeId: moduleId }, templates: preparedTemplates };
  }));
  const updatedBook = {
    ...storedBook,
    courseOrder: storedBook.courseOrder?.map((key) => key.startsWith('template:')
      ? templateOutlineKey(templateRecordChanges.get(key.slice('template:'.length)) || key.slice('template:'.length))
      : key),
    knowledgeId: savedCourseId,
    name: trimmedCourseName,
    publishingLocationId: knowledgeId
  };

  await updateBookFields(storedBook.id, {
    courseOrder: updatedBook.courseOrder,
    knowledgeId: savedCourseId,
    name: trimmedCourseName,
    publishingLocationId: knowledgeId
  });
  onBookUpdated(updatedBook);

  if (savedCourse && savedCourse.json.t !== LawType.COURSE) {
    throw new Error(`Saved course ID ${savedCourseId} belongs to another knowledge type.`);
  }

  // A generated book follows the same parent-child model as manual module
  // creation: the Course must exist first, and each Module then stores the
  // Course knowledge id in `p`. Publish an empty Course shell in its own
  // transaction so Modules can never be created before their parent exists.
  if (!savedCourse) {
    onStatus('Publishing course shell before modules…');

    const initialCourse = initialBookCourseJson(savedCourseId, trimmedCourseName);
    const initialCourseDigest = await pinKnowledgeItem(initialCourse);
    const courseCreate = api.tx.laws.create(savedCourseId, initialCourseDigest, BN_ZERO);
    const { partialFee } = await courseCreate.paymentInfo(currentPair);
    const balances = await api.derive.balances.all(currentPair.address);
    const existentialDeposit = new BN(api.consts.balances.existentialDeposit.toString());
    const requiredBalance = new BN(partialFee.toString()).add(existentialDeposit);

    if (balances.availableBalance.lt(requiredBalance)) {
      throw new Error('Your balance is insufficient for the course publishing fee and the existential deposit.');
    }

    await submitTransaction(courseCreate, currentPair, api);
    savedCourse = { amount: BN_ZERO, digestHex: initialCourseDigest, json: initialCourse };
    onPublishedIds([savedCourseId]);
  }

  const skillOperations: PublishOperation[] = [];
  const moduleOperations: PublishOperation[] = [];

  onStatus('Preparing unpublished skills and modules…');

  for (const { templates } of preparedChapters) {
    for (const { template } of templates) {
      const existingSkill = await loadKnowledgeItem(template.i);

      if (existingSkill) {
        if (existingSkill.json.t !== LawType.SKILL) {
          throw new Error(`Saved skill ID ${template.i} belongs to another knowledge type.`);
        }
      } else {
        const digest = await pinKnowledgeItem({ ...template });

        const amount = skillPrice || BN_ZERO;

        skillOperations.push({ amount, id: template.i, transaction: api.tx.laws.create(template.i, digest, amount) });
      }
    }
  }

  for (const { chapter, templates } of preparedChapters) {
    const moduleId = chapter.knowledgeId;

    if (!isKnowledgeId(moduleId)) {
      throw new Error(`Chapter “${chapter.title}” has no valid saved module ID.`);
    }

    const orderedSkillIds = templates.map(({ template }) => template.i);

    if (orderedSkillIds.some((id) => !isKnowledgeId(id))) {
      throw new Error(`Module “${chapter.title}” contains an Ability without a valid saved skill ID.`);
    }

    const chapterStandards = chapter.id === undefined
      ? ''
      : moduleStandardsText(standardsByChapter[standardsChapterKey(chapter.id, chapter.title, [])]?.standards ?? []);
    const existingModule = await loadKnowledgeItem(moduleId);

    if (existingModule) {
      if (existingModule.json.t !== LawType.MODULE) {
        throw new Error(`Saved module ID ${moduleId} belongs to another knowledge type.`);
      }

      const existingSkillIds = Array.isArray(existingModule.json.e)
        ? existingModule.json.e.filter((id): id is string => typeof id === 'string')
        : [];
      const orderChanged = JSON.stringify(existingSkillIds) !== JSON.stringify(orderedSkillIds);
      const parentChanged = existingModule.json.p !== savedCourseId;
      const standardsChanged = Boolean(chapterStandards) && existingModule.json.s !== chapterStandards;

      if (orderChanged || parentChanged || standardsChanged) {
        const digest = await pinKnowledgeItem({
          ...existingModule.json,
          e: orderedSkillIds,
          p: savedCourseId,
          ...(chapterStandards ? { s: chapterStandards } : {})
        });

        moduleOperations.push({
          amount: existingModule.amount,
          id: moduleId,
          transaction: api.tx.laws.edit(moduleId, existingModule.digestHex, digest, existingModule.amount)
        });
      }
    } else {
      const moduleJson = bookModulePublishJson({
        courseId: savedCourseId,
        moduleId,
        skillIds: orderedSkillIds,
        standards: chapterStandards,
        title: chapter.title
      });
      const digest = await pinKnowledgeItem(moduleJson);

      const amount = modulePrice || BN_ZERO;

      moduleOperations.push({ amount, id: moduleId, transaction: api.tx.laws.create(moduleId, digest, amount) });
    }
  }

  onStatus('Preparing modules, course membership, and selected list…');

  const moduleIds = preparedChapters.map(({ chapter }) => chapter.knowledgeId).filter(isKnowledgeId);
  const courseJson = finalBookCourseJson(savedCourseId, trimmedCourseName, moduleIds, savedCourse.json);
  const courseDigest = await pinKnowledgeItem(courseJson);
  const courseTransaction = api.tx.laws.edit(savedCourseId, savedCourse.digestHex, courseDigest, savedCourse.amount);
  const existingIds = Array.isArray(selectedList.json.e)
    ? selectedList.json.e.filter((id): id is string => typeof id === 'string')
    : [];
  const titledIds = await Promise.all([...new Set([...existingIds, savedCourseId])].map(async (id) => {
    if (id === savedCourseId) {
      return { id, title: trimmedCourseName };
    }

    const item = await loadKnowledgeItem(id);

    return { id, title: typeof item?.json.h === 'string' ? item.json.h : id };
  }));

  titledIds.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));

  const sortedIds = titledIds.map(({ id }) => id);
  const listChanged = JSON.stringify(existingIds) !== JSON.stringify(sortedIds);
  const finalOperations: PublishOperation[] = [{
    amount: savedCourse.amount,
    id: savedCourseId,
    transaction: courseTransaction
  }];

  if (listChanged) {
    const updatedListDigest = await pinKnowledgeItem({ ...selectedList.json, e: sortedIds });

    finalOperations.push({
      amount: selectedList.amount,
      transaction: api.tx.laws.edit(knowledgeId, selectedList.digestHex, updatedListDigest, selectedList.amount)
    });
  }

  const operationTotal = [...skillOperations, ...moduleOperations, ...finalOperations]
    .reduce((total, { amount }) => total.add(amount), BN_ZERO);

  onStatus('Calculating safe blockchain batches and publishing fees…');

  const skillBatches = await buildPublishBatches(api, currentPair, createAtomicBatch, skillOperations);
  const moduleBatches = await buildPublishBatches(api, currentPair, createAtomicBatch, moduleOperations);
  // Keep the Course update and publishing-list update together. This small
  // final batch is the commit point that makes a fully published Course
  // discoverable; all large Ability/Module sets are published beforehand.
  const finalBatches = await buildPublishBatches(api, currentPair, createAtomicBatch, finalOperations);

  if (finalBatches.length !== 1) {
    throw new Error('The final course/list commit does not fit in one atomic blockchain transaction.');
  }

  const totalFees = [...skillBatches, ...moduleBatches, ...finalBatches]
    .reduce((total, batch) => total.add(batch.partialFee), BN_ZERO);
  const balances = await api.derive.balances.all(currentPair.address);
  const existentialDeposit = new BN(api.consts.balances.existentialDeposit.toString());
  const requiredBalance = operationTotal.add(totalFees).add(existentialDeposit);

  if (balances.availableBalance.lt(requiredBalance)) {
    throw new Error('Your balance is insufficient for publishing prices, all batch fees, and the existential deposit.');
  }

  await submitPublishBatches(skillBatches, 'abilities', api, currentPair, createAtomicBatch, onPublishedIds, onStatus);
  await submitPublishBatches(moduleBatches, 'modules', api, currentPair, createAtomicBatch, onPublishedIds, onStatus);

  onStatus('Finalizing course and publishing-list membership…');
  await submitTransaction(finalBatches[0].transaction, currentPair, api);
  onPublishedIds([
    savedCourseId,
    ...preparedChapters.flatMap(({ chapter, templates }) => [chapter.knowledgeId, ...templates.map(({ template }) => template.i)]).filter(isKnowledgeId)
  ]);

  return updatedBook;
}
