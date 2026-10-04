// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ApiPromise, SubmittableResult } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { DispatchError } from '@polkadot/types/interfaces';
import type { Book, BookChapter } from '@slonigiraf/db';
import type { GeneratedAbility, PreparedAbilityForPublishing } from '../../../abilities.js';

import { deleteAbility, putBookChapter, storeAbility, updateBookFields } from '@slonigiraf/db';
import { LawType } from '@slonigiraf/slonig-components';
import BN from 'bn.js';

import { BN_ZERO } from '@polkadot/util';

import { randomIdHex } from '../../../util.js';
import { loadStoredBookStandards, moduleStandardsText, standardsChapterKey } from '../processing/standards/standards.js';
import { bookModulePublishJson, finalBookCourseJson, initialBookCourseJson } from './bookPublishing.js';

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

  const skillTransactions: SubmittableExtrinsic<'promise'>[] = [];
  const moduleTransactions: SubmittableExtrinsic<'promise'>[] = [];
  let insertionTotal = BN_ZERO;

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

        skillTransactions.push(api.tx.laws.create(template.i, digest, skillPrice || BN_ZERO));
        insertionTotal = insertionTotal.add(skillPrice || BN_ZERO);
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

        moduleTransactions.push(api.tx.laws.edit(moduleId, existingModule.digestHex, digest, existingModule.amount));
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

      moduleTransactions.push(api.tx.laws.create(moduleId, digest, modulePrice || BN_ZERO));
      insertionTotal = insertionTotal.add(modulePrice || BN_ZERO);
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
  const childTransactions = [...skillTransactions, ...moduleTransactions, courseTransaction];

  if (listChanged) {
    const updatedListDigest = await pinKnowledgeItem({ ...selectedList.json, e: sortedIds });

    childTransactions.push(api.tx.laws.edit(knowledgeId, selectedList.digestHex, updatedListDigest, selectedList.amount));
  }

  const batch = batchAll(childTransactions);
  const { partialFee } = await batch.paymentInfo(currentPair);
  const balances = await api.derive.balances.all(currentPair.address);
  const existentialDeposit = new BN(api.consts.balances.existentialDeposit.toString());
  const requiredBalance = insertionTotal.add(new BN(partialFee.toString())).add(existentialDeposit);

  if (balances.availableBalance.lt(requiredBalance)) {
    throw new Error('Your balance is insufficient for insertion prices, the batch fee, and the existential deposit.');
  }

  onStatus(`Publishing ${childTransactions.length} module/course operations in one atomic batch…`);
  await submitTransaction(batch, currentPair, api);
  onPublishedIds([
    savedCourseId,
    ...preparedChapters.flatMap(({ chapter, templates }) => [chapter.knowledgeId, ...templates.map(({ template }) => template.i)]).filter(isKnowledgeId)
  ]);

  return updatedBook;
}
