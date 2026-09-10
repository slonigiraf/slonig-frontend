// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter } from '@slonigiraf/db';
import type { ApiPromise, SubmittableResult } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { DispatchError } from '@polkadot/types/interfaces';
import type { GeneratedAbility } from './abilities.js';
import { prepareAbilityForPublishing } from './abilities.js';

import { deleteAbility, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, putBook, putBookChapter, SettingKey, storeAbility, updateBookChapterTitle } from '@slonigiraf/db';
import { digestFromCIDv1, getCIDFromBytes, getIPFSContentIDAndPinIt, getIPFSContentIDForBytesAndPinIt, getIPFSDataFromContentID, KatexSpan, LawType, parseJson, useInfo, useIpfsContext, useLoginContext } from '@slonigiraf/slonig-components';
import BN from 'bn.js';
import { useLiveQuery } from 'dexie-react-hooks';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useState } from 'react';

import { Button, Input, InputBalance, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { FormatBalance } from '@polkadot/react-query';
import { BN_ZERO, u8aToHex } from '@polkadot/util';

import { COURSE_NAMES_PROMPT, OPENAI_MODELS } from './constants.js';
import { openRouterRequestGate } from './openRouterConcurrency.js';
import { parseNameSuggestions } from './courseNames.js';
import KnowledgeTargetSelector from './KnowledgeTargetSelector.js';
import { parseStoredAbility } from './abilities.js';
import { randomIdHex } from './util.js';

interface TemplateRow {
  moduleId: string;
  recordId: string;
  template: GeneratedAbility;
}

interface ChapterTemplates {
  chapter: BookChapter;
  templates: TemplateRow[];
}

interface KnowledgeItem {
  amount: BN;
  digestHex: string;
  json: Record<string, unknown>;
}

type OutlineItem =
  | { chapter: BookChapter; key: string; type: 'chapter' }
  | { key: string; row: TemplateRow; type: 'template' };

const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;
const chapterOutlineKey = (id: number): string => `chapter:${id}`;
const templateOutlineKey = (id: string): string => `template:${id}`;
const isKnowledgeId = (value: string | undefined): value is string => !!value && /^0x[\da-f]{64}$/i.test(value);

function imageDataUrlToBytes (value: string): Uint8Array | undefined {
  const match = /^data:image\/[a-z0-9.+-]+;base64,(.+)$/i.exec(value.trim());

  if (!match) {
    return undefined;
  }

  const binary = window.atob(match[1]);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
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

interface DraggableRowProps {
  dragKey: string;
  isDraggingDisabled: boolean;
  onDragStart: (key: string) => void;
  onDrop: (key: string) => void;
}

interface TemplateRowViewProps extends DraggableRowProps {
  isPublishing: boolean;
  isPublished: boolean;
  onDelete: (recordId: string) => Promise<void>;
  row: TemplateRow;
}

function TemplateRowView ({ dragKey, isDraggingDisabled, isPublished, isPublishing, onDelete, onDragStart, onDrop, row }: TemplateRowViewProps): React.ReactElement {
  const deleteTemplate = useCallback((): void => {
    onDelete(row.recordId).catch(console.error);
  }, [onDelete, row.recordId]);
  const dragStart = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.effectAllowed = 'move';
    onDragStart(dragKey);
  }, [dragKey, onDragStart]);
  const dragOver = useCallback((event: React.DragEvent<HTMLDivElement>): void => event.preventDefault(), []);
  const drop = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    onDrop(dragKey);
  }, [dragKey, onDrop]);

  return (
    <div
      className='outlineRow skillRow'
      draggable={!isDraggingDisabled}
      onDragOver={dragOver}
      onDragStart={dragStart}
      onDrop={drop}
    >
      <Button
        icon='times'
        isDisabled={isPublishing}
        onClick={deleteTemplate}
      />
      <span className='dragHandle'>⋮⋮</span>
      <div>
        <strong><KatexSpan content={row.template.h} /></strong>
        {isPublished && <small>published</small>}
      </div>
    </div>
  );
}

interface ChapterViewProps extends DraggableRowProps {
  chapter: BookChapter;
  isPublishing: boolean;
  isPublished: boolean;
  onDelete: (chapter: BookChapter) => Promise<void>;
  onSaveName: (chapter: BookChapter, title: string) => Promise<void>;
}

function ChapterView ({ chapter, dragKey, isDraggingDisabled, isPublished, isPublishing, onDelete, onDragStart, onDrop, onSaveName }: ChapterViewProps): React.ReactElement {
  const [title, setTitle] = useState(chapter.title);
  const deleteChapter = useCallback((): void => {
    onDelete(chapter).catch(console.error);
  }, [chapter, onDelete]);
  const saveName = useCallback((): void => {
    onSaveName(chapter, title).catch(console.error);
  }, [chapter, onSaveName, title]);
  const dragStart = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.dataTransfer.effectAllowed = 'move';
    onDragStart(dragKey);
  }, [dragKey, onDragStart]);
  const dragOver = useCallback((event: React.DragEvent<HTMLDivElement>): void => event.preventDefault(), []);
  const drop = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    onDrop(dragKey);
  }, [dragKey, onDrop]);

  useEffect((): void => setTitle(chapter.title), [chapter.title]);

  return (
    <div
      className='chapterNameRow outlineRow'
      draggable={!isDraggingDisabled}
      onDragOver={dragOver}
      onDragStart={dragStart}
      onDrop={drop}
    >
      <Button
        icon='times'
        isDisabled={isPublished || isPublishing}
        onClick={deleteChapter}
      />
      <span className='dragHandle'>⋮⋮</span>
      <div className='chapterNameContent'>
        <Input
          isDisabled={isPublished || isPublishing}
          label='Chapter name'
          onBlur={saveName}
          onChange={setTitle}
          onEnter={saveName}
          value={title}
        />
        {isPublished && <small>published</small>}
      </div>
    </div>
  );
}

function SkillsCourse ({ book }: { book: Book }): React.ReactElement {
  const { api } = useApi();
  const { showInfo } = useInfo();
  // kubo-rpc-client exposes part of its client tuple as `any` through the shared context.
  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const { ipfs, isIpfsReady } = useIpfsContext();
  const { currentPair, isLoggedIn, setLoginIsRequired } = useLoginContext();
  const [storedBook, setStoredBook] = useState(book);
  const [courseName, setCourseName] = useState(book.name);
  const [modulePrice, setModulePrice] = useState<BN | undefined>(BN_ZERO);
  const [skillPrice, setSkillPrice] = useState<BN | undefined>(BN_ZERO);
  const [knowledgeId, setKnowledgeId] = useState(book.publishingLocationId || '');
  const [isPublishing, setIsPublishing] = useState(false);
  const [isFixingNames, setIsFixingNames] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');
  const [onChainIds, setOnChainIds] = useState<Set<string>>(() => new Set());
  const [dragKey, setDragKey] = useState<string>();
  const chapters = useLiveQuery(async (): Promise<ChapterTemplates[]> => {
    const [storedChapters, pages] = await Promise.all([getBookChapters(book.id), getBookPages(book.id)]);
    const pageRows = await Promise.all(pages.map(async (page) => ({
      concepts: await getBookConceptsForBookPage(book.id, page.pageNumber),
      exercises: await getExercisesForBookPage([book.id, page.pageNumber]),
      page
    })));
    const loaded = await Promise.all(storedChapters.map(async (chapter): Promise<ChapterTemplates> => {
      if (chapter.id === undefined) {
        return { chapter, templates: [] };
      }

      const matchingPages = pageRows.filter(({ concepts, page }) => page.chapter === chapter.title || concepts.some(({ chapterId }) => chapterId === chapter.id));
      const exercises = matchingPages.flatMap(({ exercises }) => exercises);
      const templates = (await Promise.all(exercises.map(async ({ id }) => {
        if (id === undefined) {
          return [];
        }

        const moduleId = exerciseAbilityModuleId(book.id, id);
        const records = await getAbilities(moduleId);

        return records.flatMap(({ content, id: recordId }) => {
          try {
            return [{ moduleId, recordId, template: parseStoredAbility(content) }];
          } catch {
            return [];
          }
        });
      }))).flat();

      return { chapter, templates };
    }));

    if (!storedBook.chapterOrder?.length) {
      return loaded;
    }

    const ranks = new Map(storedBook.chapterOrder.map((id, rank) => [id, rank]));

    return loaded.sort((a, b) => (ranks.get(a.chapter.id as number) ?? Number.MAX_SAFE_INTEGER) - (ranks.get(b.chapter.id as number) ?? Number.MAX_SAFE_INTEGER));
  }, [book.id, storedBook.chapterOrder?.join(',')]);
  const outline = useMemo((): OutlineItem[] => {
    const excludedChapterIds = new Set(storedBook.excludedCourseChapterIds || []);
    const items = (chapters || []).flatMap(({ chapter, templates }): OutlineItem[] => chapter.id === undefined
      ? []
      : [
        ...(excludedChapterIds.has(chapter.id) ? [] : [{ chapter, key: chapterOutlineKey(chapter.id), type: 'chapter' } as const]),
        ...templates.map((row): OutlineItem => ({ key: templateOutlineKey(row.recordId), row, type: 'template' }))
      ]);
    const byKey = new Map(items.map((item) => [item.key, item]));
    const keys = (storedBook.courseOrder || []).filter((key) => byKey.has(key));

    for (const { chapter, templates } of chapters || []) {
      if (chapter.id === undefined) {
        continue;
      }

      const chapterKey = chapterOutlineKey(chapter.id);

      if (!excludedChapterIds.has(chapter.id) && !keys.includes(chapterKey)) {
        keys.push(chapterKey);
      }

      const chapterIndex = keys.indexOf(chapterKey);
      const nextChapterIndex = keys.findIndex((key, index) => index > chapterIndex && key.startsWith('chapter:'));
      const insertionIndex = excludedChapterIds.has(chapter.id) || nextChapterIndex < 0 ? keys.length : nextChapterIndex;
      const missingTemplateKeys = templates.map(({ recordId }) => templateOutlineKey(recordId)).filter((key) => !keys.includes(key));

      keys.splice(insertionIndex, 0, ...missingTemplateKeys);
    }

    return keys.flatMap((key) => {
      const item = byKey.get(key);

      return item ? [item] : [];
    });
  }, [chapters, storedBook.courseOrder, storedBook.excludedCourseChapterIds]);
  const courseChapters = useMemo((): ChapterTemplates[] => {
    const grouped: ChapterTemplates[] = [];

    for (const item of outline) {
      if (item.type === 'chapter') {
        grouped.push({ chapter: item.chapter, templates: [] });
      } else if (grouped.length) {
        grouped[grouped.length - 1].templates.push(item.row);
      }
    }

    return grouped;
  }, [outline]);
  const publishableChapters = useMemo(() => courseChapters.filter(({ chapter, templates }) => templates.length || isKnowledgeId(chapter.knowledgeId)), [courseChapters]);
  const templateCount = useMemo(() => publishableChapters.reduce((count, { templates }) => count + templates.length, 0), [publishableChapters]);
  const maximumBurnTotal = useMemo(() => {
    const unpublishedModules = publishableChapters.filter(({ chapter }) => !isKnowledgeId(chapter.knowledgeId) || !onChainIds.has(chapter.knowledgeId)).length;
    const unpublishedSkills = publishableChapters.reduce((count, { templates }) => count + templates.filter(({ template }) => !isKnowledgeId(template.i) || !onChainIds.has(template.i)).length, 0);

    return (modulePrice || BN_ZERO).muln(unpublishedModules).add((skillPrice || BN_ZERO).muln(unpublishedSkills));
  }, [modulePrice, onChainIds, publishableChapters, skillPrice]);
  const isOrganizationLocked = isPublishing || courseChapters.some(({ chapter }) => isKnowledgeId(chapter.knowledgeId) && onChainIds.has(chapter.knowledgeId));

  useEffect((): void => {
    setStoredBook(book);
    setCourseName(book.name);
    setKnowledgeId(book.publishingLocationId || '');
  }, [book]);

  const loadKnowledgeItem = useCallback(async (id: string): Promise<KnowledgeItem | undefined> => {
    const law = await api.query.laws.laws(id) as unknown as { isSome: boolean; unwrap: () => [Uint8Array, BN] };

    if (!law.isSome) {
      return undefined;
    }

    const [digest, amount] = law.unwrap();
    const cid = await getCIDFromBytes(digest);
    const json: unknown = parseJson(await getIPFSDataFromContentID(ipfs, cid));

    if (!json || typeof json !== 'object' || Array.isArray(json)) {
      throw new Error(`Knowledge item ${id} has invalid JSON.`);
    }

    return { amount, digestHex: u8aToHex(digest), json: json as Record<string, unknown> };
  }, [api, ipfs]);
  const knowledgeExists = useCallback(async (id: string): Promise<boolean> => {
    const law = await api.query.laws.laws(id) as unknown as { isSome: boolean };

    return law.isSome;
  }, [api]);

  useEffect((): (() => void) => {
    let active = true;
    const ids = [
      storedBook.knowledgeId,
      ...(chapters || []).flatMap(({ chapter, templates }) => [chapter.knowledgeId, ...templates.map(({ template }) => template.i)])
    ].filter(isKnowledgeId);

    if (!isIpfsReady || !ids.length) {
      setOnChainIds(new Set());

      return () => {
        active = false;
      };
    }

    Promise.all(ids.map(async (id) => [id, await knowledgeExists(id)] as const))
      .then((results) => active && setOnChainIds(new Set(results.filter(([, exists]) => exists).map(([id]) => id))))
      .catch(() => active && setOnChainIds(new Set()));

    return () => {
      active = false;
    };
  }, [chapters, isIpfsReady, knowledgeExists, storedBook.knowledgeId]);

  const pinKnowledgeItem = useCallback(async (json: Record<string, unknown>): Promise<string> => {
    const cid = String(await getIPFSContentIDAndPinIt(ipfs, JSON.stringify(json)));

    return u8aToHex(await digestFromCIDv1(cid));
  }, [ipfs]);

  const preparePublishedAbility = useCallback(async (template: GeneratedAbility, skillId: string) => prepareAbilityForPublishing(
    template,
    skillId,
    async (value) => {
      const bytes = imageDataUrlToBytes(value);

      return bytes
        ? String(await getIPFSContentIDForBytesAndPinIt(ipfs, bytes))
        : value;
    }
  ), [ipfs]);

  const rememberLocation = useCallback((id: string): void => {
    const updatedBook = { ...storedBook, publishingLocationId: id || undefined };

    setKnowledgeId(id);
    setStoredBook(updatedBook);
    putBook(updatedBook).catch((error) => showInfo(`Unable to remember the publishing location: ${errorMessage(error)}`, 'error'));
  }, [showInfo, storedBook]);

  const saveChapterName = useCallback(async (chapter: BookChapter, titleValue: string): Promise<void> => {
    if (chapter.id === undefined || (isKnowledgeId(chapter.knowledgeId) && onChainIds.has(chapter.knowledgeId))) {
      return;
    }

    const title = titleValue.trim();

    if (!title || title === chapter.title) {
      return;
    }

    try {
      await updateBookChapterTitle(chapter.id, title);
      setPublishStatus('Chapter name saved.');
    } catch (error) {
      showInfo(`Unable to rename the chapter: ${errorMessage(error)}`, 'error');
    }
  }, [onChainIds, showInfo]);

  const deleteTemplate = useCallback(async (recordId: string): Promise<void> => {
    try {
      await deleteAbility(recordId);
      const updatedBook = { ...storedBook, courseOrder: storedBook.courseOrder?.filter((key) => key !== templateOutlineKey(recordId)) };

      await putBook(updatedBook);
      setStoredBook(updatedBook);
    } catch (error) {
      showInfo(`Unable to delete the ability: ${errorMessage(error)}`, 'error');
    }
  }, [showInfo, storedBook]);
  const deleteChapter = useCallback(async (chapter: BookChapter): Promise<void> => {
    if (chapter.id === undefined || (isKnowledgeId(chapter.knowledgeId) && onChainIds.has(chapter.knowledgeId))) {
      return;
    }

    const chapterKey = chapterOutlineKey(chapter.id);
    const keys = outline.map(({ key }) => key);
    const chapterIndex = keys.indexOf(chapterKey);

    if (chapterIndex < 0) {
      return;
    }

    keys.splice(chapterIndex, 1);

    if (chapterIndex === 0) {
      const nextChapterIndex = keys.findIndex((key) => key.startsWith('chapter:'));

      if (nextChapterIndex > 0) {
        const leadingTemplates = keys.splice(0, nextChapterIndex);

        keys.splice(1, 0, ...leadingTemplates);
      }
    }

    const updatedBook = {
      ...storedBook,
      chapterOrder: storedBook.chapterOrder?.filter((id) => id !== chapter.id),
      courseOrder: keys,
      excludedCourseChapterIds: [...new Set([...(storedBook.excludedCourseChapterIds || []), chapter.id])]
    };

    try {
      await putBook(updatedBook);
      setStoredBook(updatedBook);
      setPublishStatus('Chapter removed from the course.');
    } catch (error) {
      showInfo(`Unable to delete the chapter: ${errorMessage(error)}`, 'error');
    }
  }, [onChainIds, outline, showInfo, storedBook]);

  const insertChapter = useCallback(async (): Promise<void> => {
    if (isOrganizationLocked) {
      return;
    }

    setPublishStatus('Inserting chapter…');

    try {
      const newChapterId = await putBookChapter({ bookId: book.id, title: 'New chapter' });
      const updatedBook = {
        ...storedBook,
        chapterOrder: [newChapterId, ...courseChapters.flatMap(({ chapter }) => chapter.id === undefined ? [] : [chapter.id])],
        courseOrder: [chapterOutlineKey(newChapterId), ...outline.map(({ key }) => key)]
      };

      await putBook(updatedBook);
      setStoredBook(updatedBook);
      setPublishStatus('Chapter inserted. Rename it or drag it between abilities.');
    } catch (error) {
      setPublishStatus(`Unable to insert chapter: ${errorMessage(error)}`);
    }
  }, [book.id, courseChapters, isOrganizationLocked, outline, storedBook]);
  const startDrag = useCallback((key: string): void => setDragKey(key), []);
  const dropOutlineItem = useCallback((targetKey: string): void => {
    if (!dragKey || dragKey === targetKey || isOrganizationLocked) {
      setDragKey(undefined);

      return;
    }

    const keys = outline.map(({ key }) => key);
    const sourceIndex = keys.indexOf(dragKey);
    const targetIndex = keys.indexOf(targetKey);

    if (sourceIndex < 0 || targetIndex < 0) {
      setDragKey(undefined);

      return;
    }

    const [moved] = keys.splice(sourceIndex, 1);

    keys.splice(targetIndex, 0, moved);

    if (!keys[0].startsWith('chapter:')) {
      setPublishStatus('A chapter name must remain above the first ability.');
      setDragKey(undefined);

      return;
    }

    const chapterOrder = keys.filter((key) => key.startsWith('chapter:')).map((key) => Number(key.slice('chapter:'.length)));
    const previousBook = storedBook;
    const updatedBook = { ...storedBook, chapterOrder, courseOrder: keys };

    setStoredBook(updatedBook);
    setDragKey(undefined);
    putBook(updatedBook)
      .then(() => setPublishStatus('Course order saved.'))
      .catch((error) => {
        setStoredBook(previousBook);
        showInfo(`Unable to save the course order: ${errorMessage(error)}`, 'error');
      });
  }, [dragKey, isOrganizationLocked, outline, showInfo, storedBook]);

  const fixNames = useCallback(async (): Promise<void> => {
    if (isFixingNames || !courseChapters.length || !templateCount) {
      return;
    }

    setIsFixingNames(true);
    setPublishStatus('Asking AI to fix book and chapter names…');

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const editable = courseChapters.filter(({ chapter }) => chapter.id !== undefined && !(isKnowledgeId(chapter.knowledgeId) && onChainIds.has(chapter.knowledgeId)));
      const chapterIds = editable.map(({ chapter }) => chapter.id as number);
      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' }
      });
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{
          content: COURSE_NAMES_PROMPT({
            bookName: courseName,
            chapters: courseChapters.map(({ chapter, templates }) => ({
              abilityTitles: templates.map(({ template }) => template.h),
              editable: chapterIds.includes(chapter.id as number),
              id: chapter.id,
              title: chapter.title
            }))
          }),
          role: 'user'
        }],
        model: OPENAI_MODELS[0].value,
        response_format: { type: 'json_object' }
      }));
      const content = response.choices[0].message?.content?.trim();

      if (!content) {
        throw new Error('OpenRouter returned no names.');
      }

      const suggestions = parseNameSuggestions(content, chapterIds);
      const updatedBook = { ...storedBook, name: suggestions.bookName };

      await Promise.all(suggestions.chapters.map(({ id, title }) => updateBookChapterTitle(id, title)));
      await putBook(updatedBook);
      setStoredBook(updatedBook);
      setCourseName(suggestions.bookName);
      setPublishStatus('Book and editable chapter names fixed.');
    } catch (error) {
      setPublishStatus(`Unable to fix names: ${errorMessage(error)}`);
    } finally {
      setIsFixingNames(false);
    }
  }, [courseChapters, courseName, isFixingNames, onChainIds, storedBook, templateCount]);

  const publish = useCallback(async (): Promise<void> => {
    if (!isLoggedIn || !currentPair) {
      setLoginIsRequired(true);

      return;
    }

    if (!isIpfsReady) {
      showInfo('Connecting to IPFS…', 'error');

      return;
    }

    if (!knowledgeId || !courseName.trim() || !publishableChapters.length) {
      showInfo('Choose a publishing location, enter a course name, and add abilities first.', 'error');

      return;
    }

    setIsPublishing(true);
    setPublishStatus('Saving resumable knowledge IDs…');

    try {
      const selectedList = await loadKnowledgeItem(knowledgeId);

      if (!selectedList || selectedList.json.t !== LawType.LIST) {
        throw new Error('The selected publishing location is not a knowledge list.');
      }

      const savedCourseId = isKnowledgeId(storedBook.knowledgeId) ? storedBook.knowledgeId : randomIdHex();
      const savedCourse = await loadKnowledgeItem(savedCourseId);
      const templateRecordChanges = new Map<string, string>();
      const preparedChapters = savedCourse
        ? publishableChapters
        : await Promise.all(publishableChapters.map(async ({ chapter, templates }) => {
          const moduleId = isKnowledgeId(chapter.knowledgeId) ? chapter.knowledgeId : randomIdHex();
          const preparedTemplates = await Promise.all(templates.map(async (row) => {
            const skillId = isKnowledgeId(row.template.i) ? row.template.i : randomIdHex();
            const { localAbility, publishAbility } = await preparePublishedAbility(row.template, skillId);
            const didLocalTemplateChange = JSON.stringify(localAbility) !== JSON.stringify(row.template);
            let recordId = row.recordId;

            // Persist only the local representation. In particular, q[].p/q[].i
            // remain the IndexedDB image data URLs; the IPFS CID substitutions in
            // publishAbility exist only for this final publishing operation.
            if (didLocalTemplateChange) {
              const newRecordId = await storeAbility(row.moduleId, JSON.stringify(localAbility));

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
        name: courseName.trim(),
        publishingLocationId: knowledgeId
      };

      await putBook(updatedBook);
      setStoredBook(updatedBook);

      const skillTransactions: SubmittableExtrinsic<'promise'>[] = [];
      const moduleTransactions: SubmittableExtrinsic<'promise'>[] = [];
      let insertionTotal = BN_ZERO;

      if (!savedCourse) {
        setPublishStatus('Preparing unpublished skills and modules…');

        for (const { chapter, templates } of preparedChapters) {
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

          const moduleId = chapter.knowledgeId;

          if (!isKnowledgeId(moduleId)) {
            throw new Error(`Chapter “${chapter.title}” has no valid saved module ID.`);
          }

          const existingModule = await loadKnowledgeItem(moduleId);

          if (existingModule) {
            if (existingModule.json.t !== LawType.MODULE) {
              throw new Error(`Saved module ID ${moduleId} belongs to another knowledge type.`);
            }
          } else {
            const moduleJson = {
              e: templates.map(({ template }) => template.i),
              h: chapter.title,
              i: moduleId,
              p: savedCourseId,
              t: LawType.MODULE
            };
            const digest = await pinKnowledgeItem(moduleJson);

            moduleTransactions.push(api.tx.laws.create(moduleId, digest, modulePrice || BN_ZERO));
            insertionTotal = insertionTotal.add(modulePrice || BN_ZERO);
          }
        }
      } else if (savedCourse.json.t !== LawType.COURSE) {
        throw new Error(`Saved course ID ${savedCourseId} belongs to another knowledge type.`);
      }

      setPublishStatus('Preparing the course and selected list…');

      const moduleIds = savedCourse && Array.isArray(savedCourse.json.e)
        ? savedCourse.json.e.filter((id): id is string => typeof id === 'string')
        : preparedChapters.map(({ chapter }) => chapter.knowledgeId);
      const courseJson = savedCourse
        ? { ...savedCourse.json, e: moduleIds, h: courseName.trim(), i: savedCourseId, t: LawType.COURSE }
        : { e: moduleIds, h: courseName.trim(), i: savedCourseId, t: LawType.COURSE };
      const courseDigest = await pinKnowledgeItem(courseJson);
      const courseTransaction = savedCourse
        ? api.tx.laws.edit(savedCourseId, savedCourse.digestHex, courseDigest, savedCourse.amount)
        : api.tx.laws.create(savedCourseId, courseDigest, BN_ZERO);
      const existingIds = Array.isArray(selectedList.json.e)
        ? selectedList.json.e.filter((id): id is string => typeof id === 'string')
        : [];
      const titledIds = await Promise.all([...new Set([...existingIds, savedCourseId])].map(async (id) => {
        if (id === savedCourseId) {
          return { id, title: courseName.trim() };
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

      if (!api.tx.utility?.batchAll) {
        throw new Error('This chain does not support atomic batch publishing.');
      }

      const batch = api.tx.utility.batchAll(childTransactions);
      const { partialFee } = await batch.paymentInfo(currentPair);
      const balances = await api.derive.balances.all(currentPair.address);
      const existentialDeposit = new BN(api.consts.balances.existentialDeposit.toString());
      const requiredBalance = insertionTotal.add(new BN(partialFee.toString())).add(existentialDeposit);

      if (balances.availableBalance.lt(requiredBalance)) {
        throw new Error('Your balance is insufficient for insertion prices, the batch fee, and the existential deposit.');
      }

      setPublishStatus(`Publishing ${childTransactions.length} operations in one atomic batch…`);
      await submitTransaction(batch, currentPair, api);
      setOnChainIds((ids) => new Set([
        ...ids,
        savedCourseId,
        ...preparedChapters.flatMap(({ chapter, templates }) => [chapter.knowledgeId, ...templates.map(({ template }) => template.i)]).filter(isKnowledgeId)
      ]));
      setPublishStatus(`Published “${courseName.trim()}” in one batch.`);
      showInfo('Course published.');
    } catch (error) {
      const message = errorMessage(error);

      setPublishStatus(`Publishing stopped: ${message}. Saved knowledge IDs will be reused when you retry.`);
      showInfo(`Didn't publish: ${message}`, 'error', 5);
    } finally {
      setIsPublishing(false);
    }
  }, [api, courseName, currentPair, isIpfsReady, isLoggedIn, knowledgeId, loadKnowledgeItem, modulePrice, pinKnowledgeItem, preparePublishedAbility, publishableChapters, setLoginIsRequired, showInfo, skillPrice, storedBook]);

  return <StyledSkillsCourse>
    <div className='courseColumn'>
      <Button
        icon='magic'
        isDisabled={isFixingNames || isPublishing || !templateCount}
        label={isFixingNames ? 'Fixing names…' : 'Fix book and Chapter names'}
        onClick={fixNames}
      />
      <Input
        label='Course name'
        onChange={setCourseName}
        value={courseName}
      />
      <Button
        icon='add'
        isDisabled={isOrganizationLocked}
        label='Insert chapter'
        onClick={insertChapter}
      />
      {!courseChapters.length && <p>No chapters are included in this course.</p>}
      <div className='courseOutline'>
        {outline.map((item) => item.type === 'chapter'
          ? (
            <ChapterView
              chapter={item.chapter}
              dragKey={item.key}
              isDraggingDisabled={isOrganizationLocked}
              isPublished={isKnowledgeId(item.chapter.knowledgeId) && onChainIds.has(item.chapter.knowledgeId)}
              isPublishing={isPublishing}
              key={item.key}
              onDelete={deleteChapter}
              onDragStart={startDrag}
              onDrop={dropOutlineItem}
              onSaveName={saveChapterName}
            />
          )
          : (
            <TemplateRowView
              dragKey={item.key}
              isDraggingDisabled={isOrganizationLocked}
              isPublished={isKnowledgeId(item.row.template.i) && onChainIds.has(item.row.template.i)}
              isPublishing={isPublishing}
              key={item.key}
              onDelete={deleteTemplate}
              onDragStart={startDrag}
              onDrop={dropOutlineItem}
              row={item.row}
            />
          ))}
      </div>
    </div>
    <aside className='courseSettings'>
      <h3>Publish course</h3>
      <KnowledgeTargetSelector
        onChange={rememberLocation}
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
      <p className='total'>Maximum remaining insertion total: <FormatBalance value={maximumBurnTotal} /></p>
      <Button
        icon='save'
        isDisabled={isPublishing || !isIpfsReady || !knowledgeId || !publishableChapters.length}
        label={isPublishing ? 'Publishing batch…' : storedBook.knowledgeId && onChainIds.has(storedBook.knowledgeId) ? 'Republish course' : 'Publish'}
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
  background: var(--bg-page);
  border-radius: 0.5rem;
  box-sizing: border-box;
  display: grid;
  gap: 1.5rem;
  grid-template-columns: minmax(22rem, 0.9fr) minmax(28rem, 1.1fr);
  padding: 1.5rem 2rem;
  width: 100%;

  .courseColumn > .ui--Button { margin: 0 0 0.75rem; }
  .courseOutline { margin-top: 0.5rem; }
  .outlineRow { align-items: center; display: flex; gap: 0.5rem; }
  .chapterNameContent, .skillRow > div:last-child { flex: 1; min-width: 0; }
  h3 { margin: 0 0 0.75rem; }
  .chapterNameRow { background: var(--bg-table); border-radius: 0.25rem; margin-top: 0.65rem; padding: 0.35rem 0.5rem; }
  .dragHandle { cursor: grab; font-size: 2rem; line-height: 1; user-select: none; }
  .skillRow { border-bottom: 1px solid var(--border-table); padding: 0.5rem 0; }
  .skillRow small { display: block; margin-top: 0.2rem; }
  .courseColumn, .courseSettings { min-width: 0; }
  .courseSettings { display: flex; flex-direction: column; gap: 1rem; width: 100%; }
  .courseSettings h3 { margin-bottom: 0; }
  .courseSettings > .ui--Button { align-self: flex-start; margin: 0; }
  .total, .publishStatus { font-weight: 600; margin: 0; }
  @media only screen and (max-width: 900px) { grid-template-columns: 1fr; }
`;

export default React.memo(SkillsCourse);
