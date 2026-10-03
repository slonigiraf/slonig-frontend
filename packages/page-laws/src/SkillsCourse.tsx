// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter } from '@slonigiraf/db';
import type { ApiPromise, SubmittableResult } from '@polkadot/api';
import type { SubmittableExtrinsic } from '@polkadot/api/types';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { DispatchError } from '@polkadot/types/interfaces';
import type { GeneratedAbility } from './abilities.js';
import { prepareAbilityForPublishing } from './abilities.js';

import { deleteAbility, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, hydrateAbilityContent, putBookChapter, SettingKey, storeAbility, updateBookChapterTitle, updateBookFields } from '@slonigiraf/db';
import { digestFromCIDv1, getCIDFromBytes, getIPFSContentIDAndPinIt, getIPFSContentIDForBytesAndPinIt, getIPFSDataFromContentID, KatexSpan, LawType, parseJson, useInfo, useIpfsContext, useLoginContext } from '@slonigiraf/slonig-components';
import BN from 'bn.js';
import { useLiveQuery } from 'dexie-react-hooks';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Input, InputBalance, Modal, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { FormatBalance } from '@polkadot/react-query';
import { BN_ZERO, u8aToHex } from '@polkadot/util';

import { COURSE_NAMES_PROMPT, OPENAI_MODELS } from './constants.js';
import { openRouterRequestGate } from './openRouterConcurrency.js';
import { parseNameSuggestions } from './courseNames.js';
import KnowledgeTargetSelector from './KnowledgeTargetSelector.js';
import { parseStoredAbility } from './abilities.js';
import { randomIdHex } from './util.js';
import { isTikzCode } from './Edit/tikz.js';
import { loadStoredBookStandards, moduleStandardsText, standardsChapterKey } from './standards.js';
import { sortExercisesForDisplay } from './learningOrder.js';

interface TemplateRow {
  displayOrder?: number;
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

interface TemplateRowViewProps {
  dragKey: string;
  isDraggingDisabled: boolean;
  isPublishing: boolean;
  isPublished: boolean;
  onDelete: (recordId: string) => Promise<void>;
  onDrop: (key: string) => void;
  onReorderPointerCancel: (event: React.PointerEvent<HTMLDivElement>) => void;
  onReorderPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onReorderPointerMove: (event: React.PointerEvent<HTMLDivElement>) => void;
  onReorderPointerUp: (event: React.PointerEvent<HTMLDivElement>) => void;
  row: TemplateRow;
}

function TemplateRowView ({ dragKey, isDraggingDisabled, isPublished, isPublishing, onDelete, onDrop, onReorderPointerCancel, onReorderPointerDown, onReorderPointerMove, onReorderPointerUp, row }: TemplateRowViewProps): React.ReactElement {
  const deleteTemplate = useCallback((): void => {
    onDelete(row.recordId).catch(console.error);
  }, [onDelete, row.recordId]);
  const dragOver = useCallback((event: React.DragEvent<HTMLDivElement>): void => event.preventDefault(), []);
  const drop = useCallback((event: React.DragEvent<HTMLDivElement>): void => {
    event.preventDefault();
    onDrop(dragKey);
  }, [dragKey, onDrop]);

  return (
    <div
      className='outlineRow skillRow'
      data-outline-key={dragKey}
      data-outline-type='template'
      onDragOver={dragOver}
      onDrop={drop}
      onLostPointerCapture={isDraggingDisabled ? undefined : onReorderPointerCancel}
      onPointerCancel={isDraggingDisabled ? undefined : onReorderPointerCancel}
      onPointerDown={isDraggingDisabled ? undefined : onReorderPointerDown}
      onPointerMove={isDraggingDisabled ? undefined : onReorderPointerMove}
      onPointerUp={isDraggingDisabled ? undefined : onReorderPointerUp}
      tabIndex={-1}
    >
      <Button
        icon='times'
        isDisabled={isPublishing}
        onClick={deleteTemplate}
      />
      <span
        className='dragHandle abilityDragHandle'
        title='Drag to reorder or move to another chapter'
      >⋮⋮</span>
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
      data-outline-key={dragKey}
      data-outline-type='chapter'
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
  const [isPublishOpen, setIsPublishOpen] = useState(false);
  const [isFixingNames, setIsFixingNames] = useState(false);
  const [publishStatus, setPublishStatus] = useState('');
  const [onChainIds, setOnChainIds] = useState<Set<string>>(() => new Set());
  const [dragKey, setDragKey] = useState<string>();
  const [isReorderingAbilities, setIsReorderingAbilities] = useState(false);
  const courseOutlineRef = useRef<HTMLDivElement>(null);
  const draggedAbilityKeyRef = useRef<string | undefined>(undefined);
  const abilityDropTargetIndexRef = useRef<number | undefined>(undefined);
  const abilityDragPointerIdRef = useRef<number | undefined>(undefined);
  const abilityDragPointerYRef = useRef<number | undefined>(undefined);
  const abilityAutoScrollFrameRef = useRef<number | undefined>(undefined);
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

      const chapterConceptIds = new Set(pageRows.flatMap(({ concepts, page }) => concepts.flatMap((concept) => {
        const belongsToChapter = concept.chapterId !== undefined
          ? concept.chapterId === chapter.id
          : page.chapter === chapter.title;

        return belongsToChapter && concept.id !== undefined ? [concept.id] : [];
      })));
      const exercises = sortExercisesForDisplay(pageRows.flatMap(({ exercises, page }) => exercises.filter(({ conceptId }) => conceptId !== undefined
        ? chapterConceptIds.has(conceptId)
        : page.chapter === chapter.title)));
      const templates = (await Promise.all(exercises.map(async ({ id }) => {
        if (id === undefined) {
          return [];
        }

        const moduleId = exerciseAbilityModuleId(book.id, id);
        const records = await getAbilities(moduleId);

        const hydratedRecords = await Promise.all(records.map(async ({ content, displayOrder, id: recordId }) => {
          try {
            const hydratedContent = await hydrateAbilityContent(content);

            return { displayOrder, moduleId, recordId, template: parseStoredAbility(hydratedContent) };
          } catch {
            return undefined;
          }
        }));

        return hydratedRecords.filter((value): value is TemplateRow => value !== undefined);
      }))).flat().sort((a, b) => (a.displayOrder ?? Number.MAX_SAFE_INTEGER) - (b.displayOrder ?? Number.MAX_SAFE_INTEGER) || a.recordId.localeCompare(b.recordId));

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

    // `courseOrder` is the authoritative Course-tab order. The source Ability
    // displayOrder is used above only to build the initial/default order. Do not
    // sort each chapter segment again here: doing so silently undoes a user's
    // drag as soon as the optimistic `courseOrder` update re-renders.
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
  const isCoursePublished = isKnowledgeId(storedBook.knowledgeId) && onChainIds.has(storedBook.knowledgeId);
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
      if (isTikzCode(value)) {
        const { renderTikzToSvg } = await import('./Edit/TikzDisplay.js');
        const svg = await renderTikzToSvg(value);
        const bytes = new TextEncoder().encode(svg);

        return String(await getIPFSContentIDForBytesAndPinIt(ipfs, bytes));
      }

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
    updateBookFields(storedBook.id, { publishingLocationId: id || undefined }).catch((error) => showInfo(`Unable to remember the publishing location: ${errorMessage(error)}`, 'error'));
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

      await updateBookFields(storedBook.id, { courseOrder: updatedBook.courseOrder });
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
      await updateBookFields(storedBook.id, {
        chapterOrder: updatedBook.chapterOrder,
        courseOrder: updatedBook.courseOrder,
        excludedCourseChapterIds: updatedBook.excludedCourseChapterIds
      });
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

      await updateBookFields(storedBook.id, { chapterOrder: updatedBook.chapterOrder, courseOrder: updatedBook.courseOrder });
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
    updateBookFields(storedBook.id, { chapterOrder, courseOrder: keys })
      .then(() => setPublishStatus('Course order saved.'))
      .catch((error) => {
        setStoredBook(previousBook);
        showInfo(`Unable to save the course order: ${errorMessage(error)}`, 'error');
      });
  }, [dragKey, isOrganizationLocked, outline, showInfo, storedBook]);

  const clearAbilityDropMarker = useCallback((): void => {
    const outlineElement = courseOutlineRef.current;

    outlineElement?.querySelector('.outlineRow.courseDropBefore')?.classList.remove('courseDropBefore');
    outlineElement?.querySelector('.outlineRow.courseDropAfter')?.classList.remove('courseDropAfter');
  }, []);

  const updateAbilityDropTarget = useCallback((pointerY: number): void => {
    const outlineElement = courseOutlineRef.current;
    const sourceKey = draggedAbilityKeyRef.current;

    if (!outlineElement || !sourceKey) {
      return;
    }

    const rows = Array.from(outlineElement.querySelectorAll<HTMLElement>('.outlineRow'));
    const otherRows = rows.filter((row) => row.dataset.outlineKey !== sourceKey);

    clearAbilityDropMarker();

    if (!otherRows.length) {
      abilityDropTargetIndexRef.current = 0;

      return;
    }

    let insertionIndex = otherRows.length;

    for (let index = 0; index < otherRows.length; index++) {
      const bounds = otherRows[index].getBoundingClientRect();

      if (pointerY < bounds.top + (bounds.height / 2)) {
        insertionIndex = index;
        break;
      }
    }

    // A Course must start with a chapter heading. Abilities can cross any later
    // chapter boundary, including into an empty chapter, but cannot be placed
    // above the first chapter.
    if (otherRows[0]?.dataset.outlineType === 'chapter') {
      insertionIndex = Math.max(1, insertionIndex);
    }

    abilityDropTargetIndexRef.current = insertionIndex;

    if (insertionIndex < otherRows.length) {
      otherRows[insertionIndex].classList.add('courseDropBefore');
    } else {
      otherRows[otherRows.length - 1].classList.add('courseDropAfter');
    }
  }, [clearAbilityDropMarker]);

  const stopAbilityAutoScroll = useCallback((): void => {
    abilityDragPointerYRef.current = undefined;

    if (abilityAutoScrollFrameRef.current !== undefined) {
      window.cancelAnimationFrame(abilityAutoScrollFrameRef.current);
      abilityAutoScrollFrameRef.current = undefined;
    }
  }, []);

  const startAbilityAutoScroll = useCallback((): void => {
    if (abilityAutoScrollFrameRef.current !== undefined) {
      return;
    }

    const scroll = (): void => {
      abilityAutoScrollFrameRef.current = undefined;

      const pointerY = abilityDragPointerYRef.current;

      if (pointerY === undefined) {
        return;
      }

      const viewportHeight = window.innerHeight;
      const edgeSize = Math.min(96, Math.max(48, viewportHeight * 0.12));
      const topDistance = pointerY;
      const bottomDistance = viewportHeight - pointerY;
      let scrollAmount = 0;

      if (topDistance < edgeSize && window.scrollY > 0) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, topDistance)) / edgeSize));

        scrollAmount = -(4 + (20 * strength));
      } else if (bottomDistance < edgeSize && window.scrollY + viewportHeight < document.documentElement.scrollHeight) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, bottomDistance)) / edgeSize));

        scrollAmount = 4 + (20 * strength);
      }

      if (scrollAmount !== 0) {
        window.scrollBy(0, scrollAmount);
        updateAbilityDropTarget(pointerY);
      }

      abilityAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };

    abilityAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
  }, [updateAbilityDropTarget]);

  const finishAbilityDrag = useCallback((): void => {
    stopAbilityAutoScroll();
    draggedAbilityKeyRef.current = undefined;
    abilityDropTargetIndexRef.current = undefined;
    abilityDragPointerIdRef.current = undefined;
    clearAbilityDropMarker();
    courseOutlineRef.current?.classList.remove('reorderingAbility');
    courseOutlineRef.current?.querySelector('.skillRow.abilityDragging')?.classList.remove('abilityDragging');
  }, [clearAbilityDropMarker, stopAbilityAutoScroll]);

  const moveAbilityInCourse = useCallback(async (sourceKey: string, insertionIndex: number): Promise<void> => {
    if (isPublishing || isReorderingAbilities || !sourceKey.startsWith('template:')) {
      return;
    }

    const originalKeys = outline.map(({ key }) => key);
    const keys = [...originalKeys];
    const sourceIndex = keys.indexOf(sourceKey);

    if (sourceIndex < 0) {
      return;
    }

    const [moved] = keys.splice(sourceIndex, 1);
    const boundedInsertionIndex = Math.max(0, Math.min(insertionIndex, keys.length));

    keys.splice(boundedInsertionIndex, 0, moved);

    if (!keys[0]?.startsWith('chapter:')) {
      setPublishStatus('A chapter name must remain above the first ability.');

      return;
    }

    if (keys.every((key, index) => key === originalKeys[index])) {
      return;
    }

    const previousBook = storedBook;
    const updatedBook = { ...storedBook, courseOrder: keys };

    setIsReorderingAbilities(true);
    setStoredBook(updatedBook);

    try {
      await updateBookFields(storedBook.id, { courseOrder: keys });
      setPublishStatus('Course order saved.');
    } catch (error) {
      setStoredBook(previousBook);
      showInfo(`Unable to save the course order: ${errorMessage(error)}`, 'error');
    } finally {
      setIsReorderingAbilities(false);
    }
  }, [isPublishing, isReorderingAbilities, outline, showInfo, storedBook]);

  const beginAbilityPointerDrag = useCallback((key: string, event: React.PointerEvent<HTMLDivElement>): void => {
    if (isPublishing || isReorderingAbilities || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    const target = event.target as HTMLElement;

    if (!target.closest('.abilityDragHandle')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled it.
    }

    draggedAbilityKeyRef.current = key;
    abilityDragPointerIdRef.current = event.pointerId;
    abilityDragPointerYRef.current = event.clientY;
    event.currentTarget.classList.add('abilityDragging');
    courseOutlineRef.current?.classList.add('reorderingAbility');
    updateAbilityDropTarget(event.clientY);
    startAbilityAutoScroll();
  }, [isPublishing, isReorderingAbilities, startAbilityAutoScroll, updateAbilityDropTarget]);

  const moveAbilityPointerDrag = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (abilityDragPointerIdRef.current !== event.pointerId || !draggedAbilityKeyRef.current) {
      return;
    }

    event.preventDefault();
    abilityDragPointerYRef.current = event.clientY;
    updateAbilityDropTarget(event.clientY);
    startAbilityAutoScroll();
  }, [startAbilityAutoScroll, updateAbilityDropTarget]);

  const cancelAbilityPointerDrag = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (abilityDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    finishAbilityDrag();
  }, [finishAbilityDrag]);

  const endAbilityPointerDrag = useCallback((event: React.PointerEvent<HTMLDivElement>): void => {
    if (abilityDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const sourceKey = draggedAbilityKeyRef.current;
    const targetIndex = abilityDropTargetIndexRef.current;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore browsers that release capture automatically before pointerup.
    }

    finishAbilityDrag();

    if (sourceKey && targetIndex !== undefined) {
      void moveAbilityInCourse(sourceKey, targetIndex);
    }
  }, [finishAbilityDrag, moveAbilityInCourse]);

  useEffect(() => finishAbilityDrag, [finishAbilityDrag]);

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
        defaultHeaders: { 'HTTP-Referer': window.location.origin, 'X-OpenRouter-Title': 'Slonig' },
        maxRetries: 0
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
      await updateBookFields(storedBook.id, { name: suggestions.bookName });
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
      const standardsByChapter = loadStoredBookStandards(book.id);
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
        name: courseName.trim(),
        publishingLocationId: knowledgeId
      };

      await updateBookFields(storedBook.id, {
        courseOrder: updatedBook.courseOrder,
        knowledgeId: savedCourseId,
        name: courseName.trim(),
        publishingLocationId: knowledgeId
      });
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
        }
      } else if (savedCourse.json.t !== LawType.COURSE) {
        throw new Error(`Saved course ID ${savedCourseId} belongs to another knowledge type.`);
      }

      for (const { chapter, templates } of preparedChapters) {
        const moduleId = chapter.knowledgeId;

        if (!isKnowledgeId(moduleId)) {
          throw new Error(`Chapter “${chapter.title}” has no valid saved module ID.`);
        }

        const chapterStandards = chapter.id === undefined
          ? ''
          : moduleStandardsText(standardsByChapter[standardsChapterKey(chapter.id, chapter.title, [])]?.standards ?? []);
        const existingModule = await loadKnowledgeItem(moduleId);

        if (existingModule) {
          if (existingModule.json.t !== LawType.MODULE) {
            throw new Error(`Saved module ID ${moduleId} belongs to another knowledge type.`);
          }

          const orderedSkillIds = templates.map(({ template }) => template.i);

          if (orderedSkillIds.some((id) => !isKnowledgeId(id))) {
            throw new Error(`Published module “${chapter.title}” contains an Ability without a valid saved skill ID.`);
          }

          const existingSkillIds = Array.isArray(existingModule.json.e)
            ? existingModule.json.e.filter((id): id is string => typeof id === 'string')
            : [];
          const orderChanged = JSON.stringify(existingSkillIds) !== JSON.stringify(orderedSkillIds);
          const standardsChanged = Boolean(chapterStandards) && existingModule.json.s !== chapterStandards;

          if (orderChanged || standardsChanged) {
            const digest = await pinKnowledgeItem({
              ...existingModule.json,
              e: orderedSkillIds,
              ...(chapterStandards ? { s: chapterStandards } : {})
            });

            moduleTransactions.push(api.tx.laws.edit(moduleId, existingModule.digestHex, digest, existingModule.amount));
          }
        } else if (!savedCourse) {
          const moduleJson = {
            e: templates.map(({ template }) => template.i),
            h: chapter.title,
            i: moduleId,
            p: savedCourseId,
            ...(chapterStandards ? { s: chapterStandards } : {}),
            t: LawType.MODULE
          };
          const digest = await pinKnowledgeItem(moduleJson);

          moduleTransactions.push(api.tx.laws.create(moduleId, digest, modulePrice || BN_ZERO));
          insertionTotal = insertionTotal.add(modulePrice || BN_ZERO);
        } else {
          throw new Error(`Published course module ${moduleId} could not be loaded.`);
        }
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
  }, [api, book.id, courseName, currentPair, isIpfsReady, isLoggedIn, knowledgeId, loadKnowledgeItem, modulePrice, pinKnowledgeItem, preparePublishedAbility, publishableChapters, setLoginIsRequired, showInfo, skillPrice, storedBook]);

  return <StyledSkillsCourse>
    <div className='courseColumn'>
      <Button
        icon='play'
        isDisabled={isFixingNames || isPublishing || !templateCount}
        label={isFixingNames ? 'Fixing names…' : 'Fix book and Chapter names'}
        onClick={fixNames}
      />
      <Button
        className={`publishTrigger${isCoursePublished ? ' isPublished' : ''}`}
        icon={isCoursePublished ? 'check' : 'save'}
        isDisabled={isPublishing}
        label={isPublishing ? 'Publishing…' : isCoursePublished ? 'Published' : 'Publish'}
        onClick={() => setIsPublishOpen(true)}
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
      <div
        className='courseOutline'
        ref={courseOutlineRef}
      >
        {outline.map((item) => item.type === 'chapter'
          ? (
            <ChapterView
              chapter={item.chapter}
              dragKey={item.key}
              isDraggingDisabled={isOrganizationLocked || isReorderingAbilities}
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
              isDraggingDisabled={isPublishing || isReorderingAbilities}
              isPublished={isKnowledgeId(item.row.template.i) && onChainIds.has(item.row.template.i)}
              isPublishing={isPublishing}
              key={item.key}
              onDelete={deleteTemplate}
              onDrop={dropOutlineItem}
              onReorderPointerCancel={cancelAbilityPointerDrag}
              onReorderPointerDown={(event) => beginAbilityPointerDrag(item.key, event)}
              onReorderPointerMove={moveAbilityPointerDrag}
              onReorderPointerUp={endAbilityPointerDrag}
              row={item.row}
            />
          ))}
      </div>
    </div>
    {isPublishOpen && <Modal
      header='Publish course'
      onClose={() => !isPublishing && setIsPublishOpen(false)}
      size='small'
    >
      <Modal.Content>
        <PublishCourseContent>
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
            icon={isCoursePublished ? 'redo' : 'save'}
            isDisabled={isPublishing || !isIpfsReady || !knowledgeId || !publishableChapters.length}
            label={isPublishing ? 'Publishing batch…' : isCoursePublished ? 'Republish course' : 'Publish'}
            onClick={publish}
          />
          {publishStatus && (
            <p
              className='publishStatus'
              role='status'
            >{publishStatus}</p>
          )}
        </PublishCourseContent>
      </Modal.Content>
    </Modal>}
  </StyledSkillsCourse>;
}

const StyledSkillsCourse = styled.div`
  background: var(--bg-page);
  border-radius: 0.5rem;
  box-sizing: border-box;
  grid-column: 1 / -1;
  min-width: 0;
  padding: 1.5rem 2rem;
  width: 100%;

  .courseColumn > .ui--Button { margin: 0 0 0.75rem; }
  .publishTrigger.isPublished { font-weight: 700; }
  .courseOutline { margin-top: 0.5rem; }
  .outlineRow { align-items: center; display: flex; gap: 0.5rem; position: relative; }
  .chapterNameContent, .skillRow > div:last-child { flex: 1; min-width: 0; }
  h3 { margin: 0 0 0.75rem; }
  .chapterNameRow { background: var(--bg-table); border-radius: 0.25rem; margin-top: 0.65rem; padding: 0.35rem 0.5rem; }
  .dragHandle { cursor: grab; font-size: 2rem; line-height: 1; user-select: none; }
  .abilityDragHandle { touch-action: none; }
  .skillRow { border-bottom: 1px solid var(--border-table); padding: 0.5rem 0; }
  .skillRow.abilityDragging { cursor: grabbing; opacity: 0.55; }
  .skillRow small { display: block; margin-top: 0.2rem; }
  .courseOutline.reorderingAbility { cursor: grabbing; user-select: none; }
  .outlineRow.courseDropBefore::before,
  .outlineRow.courseDropAfter::after {
    background: var(--color-primary, #1682d4);
    border-radius: 999px;
    content: '';
    height: 3px;
    left: 0.35rem;
    pointer-events: none;
    position: absolute;
    right: 0.35rem;
    z-index: 2;
  }
  .outlineRow.courseDropBefore::before { top: -0.15rem; }
  .outlineRow.courseDropAfter::after { bottom: -0.15rem; }
  .courseColumn { min-width: 0; }
`;

const PublishCourseContent = styled.div`
  display: flex;
  flex-direction: column;
  gap: 1rem;
  width: 100%;

  > .ui--Button { align-self: flex-start; margin: 0; }
  .total, .publishStatus { font-weight: 600; margin: 0; }
`;

export default React.memo(SkillsCourse);
