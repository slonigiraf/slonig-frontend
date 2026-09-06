// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter } from '@slonigiraf/db';
import type { ApiPromise, SubmittableResult } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { DispatchError } from '@polkadot/types/interfaces';
import type { GeneratedSkillTemplate } from './skillTemplates.js';

import { getBookChapters, getSkillsForChapter, getSkillTemplates } from '@slonigiraf/db';
import { digestFromCIDv1, getCIDFromBytes, getIPFSContentIDAndPinIt, getIPFSDataFromContentID, LawType, parseJson, useInfo, useIpfsContext, useLoginContext } from '@slonigiraf/slonig-components';
import BN from 'bn.js';
import { useLiveQuery } from 'dexie-react-hooks';
import React, { useCallback, useMemo, useState } from 'react';

import { Button, Input, InputBalance, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { FormatBalance } from '@polkadot/react-query';
import { BN_ZERO, u8aToHex } from '@polkadot/util';

import KnowledgeTargetSelector from './KnowledgeTargetSelector.js';
import { parseStoredSkillTemplate } from './skillTemplates.js';
import { randomIdHex } from './util.js';

interface ChapterTemplates {
  chapter: BookChapter;
  templates: Array<{ id: string; template: GeneratedSkillTemplate }>;
}

interface KnowledgeItem {
  amount: BN;
  digestHex: string;
  json: Record<string, unknown>;
}

interface PublishTransaction {
  label: string;
  transaction: SubmittableExtrinsic<'promise'>;
}

function errorMessage (error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
      const { status } = result;

      if (!status.isInBlock && !status.isFinalized) {
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

function SkillsCourse ({ book }: { book: Book }): React.ReactElement {
  const { api } = useApi();
  const { showInfo } = useInfo();
  // kubo-rpc-client exposes part of its client tuple as `any` through the shared context.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { currentPair, isLoggedIn, setLoginIsRequired } = useLoginContext();
  const [courseName, setCourseName] = useState(book.name);
  const [modulePrice, setModulePrice] = useState<BN | undefined>(BN_ZERO);
  const [skillPrice, setSkillPrice] = useState<BN | undefined>(BN_ZERO);
  const [knowledgeId, setKnowledgeId] = useState('');
  const [isPublishing, setIsPublishing] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');
  const chapters = useLiveQuery(async (): Promise<ChapterTemplates[]> => {
    const storedChapters = await getBookChapters(book.id);

    return Promise.all(storedChapters.map(async (chapter): Promise<ChapterTemplates> => {
      if (chapter.id === undefined) {
        return { chapter, templates: [] };
      }

      const skills = await getSkillsForChapter(chapter.id);
      const templates = (await Promise.all(skills.map(async (skill) => {
        if (skill.id === undefined) {
          return [];
        }

        const records = await getSkillTemplates(`book-${book.id}-skill-${skill.id}`);

        return records.flatMap(({ content, id }) => {
          try {
            return [{ id, template: parseStoredSkillTemplate(content) }];
          } catch {
            return [];
          }
        });
      }))).flat();

      return { chapter, templates };
    }));
  }, [book.id]);
  const publishableChapters = useMemo(() => chapters?.filter(({ templates }) => templates.length) || [], [chapters]);
  const templateCount = useMemo(() => publishableChapters.reduce((count, { templates }) => count + templates.length, 0), [publishableChapters]);
  const burnTotal = useMemo(() => {
    const moduleAmount = modulePrice || BN_ZERO;
    const skillAmount = skillPrice || BN_ZERO;

    return moduleAmount.muln(publishableChapters.length).add(skillAmount.muln(templateCount));
  }, [modulePrice, publishableChapters.length, skillPrice, templateCount]);

  const loadKnowledgeItem = useCallback(async (id: string): Promise<KnowledgeItem> => {
    const law = await api.query.laws.laws(id) as unknown as { isSome: boolean; unwrap: () => [Uint8Array, BN] };

    if (!law.isSome) {
      throw new Error('The selected knowledge list was not found.');
    }

    const [digest, amount] = law.unwrap();
    const cid = await getCIDFromBytes(digest);
    const json: unknown = parseJson(await getIPFSDataFromContentID(ipfs, cid));

    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error('The selected knowledge list has invalid JSON.');
    }

    return { amount, digestHex: u8aToHex(digest), json: json as Record<string, unknown> };
  }, [api, ipfs]);

  const pinKnowledgeItem = useCallback(async (json: Record<string, unknown>): Promise<string> => {
    const cid = String(await getIPFSContentIDAndPinIt(ipfs, JSON.stringify(json)));

    return u8aToHex(await digestFromCIDv1(cid));
  }, [ipfs]);

  const publish = useCallback(async (): Promise<void> => {
    if (!isLoggedIn || !currentPair) {
      setLoginIsRequired(true);

      return;
    }

    if (!isIpfsReady) {
      showInfo('Connecting to IPFS…', 'error');

      return;
    }

    if (!knowledgeId) {
      showInfo('Choose a publishing location first.', 'error');

      return;
    }

    if (!courseName.trim()) {
      showInfo('Enter a course name.', 'error');

      return;
    }

    if (!publishableChapters.length || !templateCount) {
      showInfo('There are no skill templates to publish.', 'error');

      return;
    }

    setIsPublishing(true);
    setPublishStatus('Checking the selected list and balance…');

    try {
      const selectedList = await loadKnowledgeItem(knowledgeId);

      if (selectedList.json.t !== LawType.LIST) {
        throw new Error('Courses can only be published into a list.');
      }

      const balances = await api.derive.balances.all(currentPair.address);

      if (balances.availableBalance.lt(burnTotal)) {
        throw new Error('Your balance is insufficient for the selected insertion prices.');
      }

      const courseId = randomIdHex();
      const moduleRows = publishableChapters.map(({ chapter, templates }) => ({
        chapter,
        id: randomIdHex(),
        skills: templates.map(({ template }) => ({ id: randomIdHex(), template }))
      }));
      const courseJson = {
        e: moduleRows.map(({ id }) => id),
        h: courseName.trim(),
        i: courseId,
        t: LawType.COURSE
      };
      const skillTransactions: PublishTransaction[] = [];
      const moduleTransactions: PublishTransaction[] = [];

      setPublishStatus('Saving skill templates to IPFS…');

      for (const { chapter, id: moduleId, skills } of moduleRows) {
        for (const { id, template } of skills) {
          const skillJson = { ...template, i: id };
          const digest = await pinKnowledgeItem(skillJson);

          skillTransactions.push({
            label: `skill “${template.h}”`,
            transaction: api.tx.laws.create(id, digest, skillPrice || BN_ZERO)
          });
        }

        const moduleJson = {
          e: skills.map(({ id }) => id),
          h: chapter.title,
          i: moduleId,
          p: courseId,
          t: LawType.MODULE
        };
        const digest = await pinKnowledgeItem(moduleJson);

        moduleTransactions.push({
          label: `module “${chapter.title}”`,
          transaction: api.tx.laws.create(moduleId, digest, modulePrice || BN_ZERO)
        });
      }

      setPublishStatus('Saving the course and updated list to IPFS…');

      const courseDigest = await pinKnowledgeItem(courseJson);
      const transactions: PublishTransaction[] = [
        ...skillTransactions,
        ...moduleTransactions,
        {
          label: `course “${courseName.trim()}”`,
          transaction: api.tx.laws.create(courseId, courseDigest, BN_ZERO)
        }
      ];

      const existingIds = Array.isArray(selectedList.json.e)
        ? selectedList.json.e.filter((id): id is string => typeof id === 'string')
        : [];
      const titledIds = await Promise.all(existingIds.map(async (id) => {
        try {
          const { json } = await loadKnowledgeItem(id);

          return { id, title: typeof json.h === 'string' ? json.h : id };
        } catch {
          return { id, title: id };
        }
      }));

      titledIds.push({ id: courseId, title: courseName.trim() });
      titledIds.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }) || a.id.localeCompare(b.id));

      const updatedList = {
        ...selectedList.json,
        e: titledIds.map(({ id }) => id)
      };
      const updatedListDigest = await pinKnowledgeItem(updatedList);

      transactions.push({
        label: 'selected knowledge list',
        transaction: api.tx.laws.edit(knowledgeId, selectedList.digestHex, updatedListDigest, selectedList.amount)
      });

      setPublishStatus('Estimating transaction fees…');

      const fees = await Promise.all(transactions.map(async ({ transaction }) => {
        const { partialFee } = await transaction.paymentInfo(currentPair);

        return new BN(partialFee.toString());
      }));
      const existentialDeposit = new BN(api.consts.balances.existentialDeposit.toString());
      const requiredBalance = fees.reduce((total, fee) => total.add(fee), burnTotal).add(existentialDeposit);

      if (balances.availableBalance.lt(requiredBalance)) {
        throw new Error('Your balance is insufficient for the insertion prices and transaction fees.');
      }

      for (const [index, { label, transaction }] of transactions.entries()) {
        setPublishStatus(`Publishing ${index + 1} of ${transactions.length}: ${label}…`);
        await submitTransaction(transaction, currentPair, api);
      }

      setPublishStatus(`Published “${courseName.trim()}” and added it to the selected list.`);
      showInfo('Course published.');
    } catch (error) {
      const message = errorMessage(error);

      setPublishStatus(`Publishing stopped: ${message}`);
      showInfo(`Didn't publish: ${message}`, 'error', 5);
    } finally {
      setIsPublishing(false);
    }
  }, [api, burnTotal, courseName, currentPair, isIpfsReady, isLoggedIn, knowledgeId, loadKnowledgeItem, modulePrice, pinKnowledgeItem, publishableChapters, setLoginIsRequired, showInfo, skillPrice, templateCount]);

  return <StyledSkillsCourse>
    <div className='courseColumn'>
      <Input
        label='Course name'
        onChange={setCourseName}
        value={courseName}
      />
      {!chapters?.length && <p>No chapters have been generated for this book.</p>}
      {chapters?.map(({ chapter, templates }) => <section key={chapter.id ?? chapter.title}>
        <h3>{chapter.title || 'Unassigned chapter'}</h3>
        {!templates.length && <small>No skill templates have been generated for this chapter.</small>}
        {templates.map(({ id, template }) => (
          <div
            className='skillRow'
            key={id}
          >
            <strong>{template.h}</strong>
          </div>
        ))}
      </section>)}
    </div>
    <aside className='courseSettings'>
      <h3>Publish course</h3>
      <KnowledgeTargetSelector
        onChange={setKnowledgeId}
        value={knowledgeId}
      />
      <InputBalance
        isDisabled={isPublishing}
        isZeroable
        label='Module insertion price'
        onChange={setModulePrice}
        value={modulePrice}
      />
      <InputBalance
        isDisabled={isPublishing}
        isZeroable
        label='Skill insertion price'
        onChange={setSkillPrice}
        value={skillPrice}
      />
      <p className='total'>Estimated insertion total: <FormatBalance value={burnTotal} /></p>
      <Button
        icon='save'
        isDisabled={isPublishing || !isIpfsReady || !knowledgeId || !templateCount}
        label='Publish'
        onClick={publish}
      />
      {publishStatus && (
        <p
          className='publishStatus'
          role='status'
        >{publishStatus}</p>
      )}
    </aside>
  </StyledSkillsCourse>;
}

const StyledSkillsCourse = styled.div`
  box-sizing: border-box;
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(18rem, 0.8fr) minmax(28rem, 1.2fr);
  padding: 1.5rem 2rem;
  background: var(--bg-page);
  border-radius: 0.5rem;
  width: 100%;

  .courseColumn section + section { margin-top: 1rem; }
  h3 { margin: 0 0 0.75rem; }
  .skillRow { border-bottom: 1px solid var(--border-table); padding: 0.5rem 0; }
  .courseColumn, .courseSettings { min-width: 0; }
  .courseSettings { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
  .courseSettings h3 { margin-bottom: 0; }
  .courseSettings > .ui--Button { align-self: flex-start; margin: 0; }
  .total, .publishStatus { font-weight: 600; margin: 0; }
  @media only screen and (max-width: 900px) { grid-template-columns: 1fr; }
`;

export default React.memo(SkillsCourse);
