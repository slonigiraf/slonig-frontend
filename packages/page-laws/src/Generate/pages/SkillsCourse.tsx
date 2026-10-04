// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../abilities/abilities.js';
import { prepareAbilityForPublishing } from '../../abilities/abilities.js';

import { deleteAbility, getAbilities, getBookChapters, getBookConceptsForBookPage, getBookPages, getExercisesForBookPage, getSetting, hydrateAbilityContent, putBookChapter, SettingKey, updateBookChapterTitle, updateBookFields } from '@slonigiraf/db';
import { digestFromCIDv1, getCIDFromBytes, getIPFSContentIDAndPinIt, getIPFSContentIDForBytesAndPinIt, getIPFSDataFromContentID, SpanWithTags, parseJson, useInfo, useIpfsContext, useLoginContext } from '@slonigiraf/slonig-components';
import BN from 'bn.js';
import { useLiveQuery } from 'dexie-react-hooks';
import OpenAI from 'openai';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Input, InputBalance, Modal, styled } from '@polkadot/react-components';
import { useApi } from '@polkadot/react-hooks';
import { FormatBalance } from '@polkadot/react-query';
import { BN_ZERO, u8aToHex } from '@polkadot/util';

import { OPENAI_MODELS } from '../../openrouter/models.js';
import { openRouterRequestGate } from '../../openrouter/concurrency.js';
import { COURSE_NAMES_PROMPT } from '../book/prompts/publishing.js';
import { parseNameSuggestions } from '../book/publishing/courseNames.js';
import { chapterOutlineKey, type ChapterTemplates, isKnowledgeId, type KnowledgeItem, publishProcessedBook, templateOutlineKey, type TemplateRow } from '../book/publishing/publishProcessedBook.js';
import KnowledgeTargetSelector from '../components/KnowledgeTargetSelector.js';
import { parseStoredAbility } from '../../abilities/abilities.js';
import { isTikzCode } from '../../Edit/tikz.js';
import { sortExercisesForDisplay } from '../book/processing/concepts/learningOrder.js';

type OutlineItem =
  | { chapter: BookChapter; key: string; type: 'chapter' }
  | { key: string; row: TemplateRow; type: 'template' };

const exerciseAbilityModuleId = (bookId: number, exerciseId: number): string => `book-${bookId}-exercise-${exerciseId}`;

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
        <strong><SpanWithTags content={row.template.h} /></strong>
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
        const { renderTikzToSvg } = await import('../../Edit/TikzDisplay.js');
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

    if (!api.tx.utility?.batchAll) {
      showInfo('This chain does not support atomic batch publishing.', 'error');

      return;
    }

    setIsPublishing(true);
    setPublishStatus('Saving resumable knowledge IDs…');

    try {
      await publishProcessedBook({
        api,
        bookId: book.id,
        courseName,
        currentPair,
        knowledgeId,
        loadKnowledgeItem,
        modulePrice,
        onBookUpdated: setStoredBook,
        onPublishedIds: (publishedIds) => setOnChainIds((ids) => new Set([...ids, ...publishedIds])),
        onStatus: setPublishStatus,
        pinKnowledgeItem,
        preparePublishedAbility,
        publishableChapters,
        skillPrice,
        storedBook
      });
      setPublishStatus(`Published “${courseName.trim()}”. Abilities and modules were published in safe batches, then the course was finalized atomically.`);
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
