// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept, BookPage } from '@slonigiraf/db';
import { assignBookConceptsToChapters, createBookConcept, getSetting, reorderBookConcepts, SettingKey, updateBookConcept } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { Dispatch, MutableRefObject, SetStateAction } from 'react';
import { reportOpenRouterCost } from '../../../../openrouter/cost.js';
import { conceptChapterMoveInsertionIndex } from '../../../book/processing/concepts/conceptChapterMove.js';
import type { ConceptChapterNavigationItem } from '../../../book/processing/concepts/conceptRecognition.js';
import { fixSingleConceptPrompt, parseFixedConcept } from '../../../book/processing/concepts/fixConcepts.js';
import { conceptBelongsToChapter } from '../../../book/processing/chapters/refineChapters.js';
import { storeSharedChapterSelection } from '../../../book/runtime/chapterSelection.js';
import { createOpenRouterClient, runConceptRequestWithRetry } from '../BookReaderProcessing.js';
import { conceptInsertionDisplayOrder, conceptReferenceKey, conceptsForNavigationChapter, deleteConceptAndDependencies, getBookConceptInventory } from '../BookReaderUtils.js';
import { useConceptReorder } from './useConceptReorder.js';

interface UseConceptEditorOptions {
  addFixConceptsCost: (costUsd: number) => void;
  book: Book;
  conceptChapterIndex: number;
  conceptChapters: ConceptChapterNavigationItem[];
  concepts: BookConcept[];
  conceptsOutputRef: React.RefObject<HTMLDivElement>;
  currentConceptChapter?: ConceptChapterNavigationItem;
  generateAllConceptsModel: string;
  goToPage: (pageNumber: number) => void;
  isApplyingFixConceptsReview: boolean;
  pages: Map<number, BookPage>;
  pendingConceptChapterFocusRef: MutableRefObject<boolean>;
  refreshConceptCounts: () => Promise<void>;
  refreshEntityCounts: () => Promise<void>;
  setConceptChapterIndex: Dispatch<SetStateAction<number>>;
  setConceptFirstPageByKey: Dispatch<SetStateAction<Map<string, number>>>;
  setConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
}

export function useConceptEditor ({
  addFixConceptsCost,
  book,
  conceptChapterIndex,
  conceptChapters,
  concepts,
  conceptsOutputRef,
  currentConceptChapter,
  generateAllConceptsModel,
  goToPage,
  isApplyingFixConceptsReview,
  pages,
  pendingConceptChapterFocusRef,
  refreshConceptCounts,
  refreshEntityCounts,
  setConceptChapterIndex,
  setConceptFirstPageByKey,
  setConcepts,
  setError,
  setSkillsRefreshToken
}: UseConceptEditorOptions) {
  const [isAddingConcept, setIsAddingConcept] = useState(false);
  const [isSavingNewConcept, setIsSavingNewConcept] = useState(false);
  const [newConceptAfterIndex, setNewConceptAfterIndex] = useState(-1);
  const [newConceptDescription, setNewConceptDescription] = useState('');
  const [newConceptPage, setNewConceptPage] = useState('');
  const [newConceptTitle, setNewConceptTitle] = useState('');

  useEffect(() => {
    setIsAddingConcept(false);
    setNewConceptAfterIndex(-1);
    setNewConceptDescription('');
    setNewConceptPage('');
    setNewConceptTitle('');
  }, [currentConceptChapter?.chapterId, currentConceptChapter?.title]);

  const changeConceptChapter = useCallback((index: number): void => {
    if (!conceptChapters.length) {
      return;
    }

    const nextIndex = Math.max(0, Math.min(index, conceptChapters.length - 1));
    const chapter = conceptChapters[nextIndex];
    const firstPage = chapter?.pageNumbers[0];

    pendingConceptChapterFocusRef.current = true;
    setConceptChapterIndex(nextIndex);
    storeSharedChapterSelection(book.id, { chapterId: chapter?.chapterId, index: nextIndex, title: chapter?.title });

    if (firstPage !== undefined) {
      goToPage(firstPage);
    }
  }, [book.id, conceptChapters, goToPage, pendingConceptChapterFocusRef, setConceptChapterIndex]);

  const loadCurrentChapterConcepts = useCallback(async (): Promise<{ concepts: BookConcept[]; references: Map<string, number> }> => {
    if (!currentConceptChapter) {
      return { concepts: [], references: new Map() };
    }

    const inventory = await getBookConceptInventory(book.id, pages.keys());
    const chapterConcepts = conceptsForNavigationChapter(inventory, currentConceptChapter);
    const references = new Map<string, number>();

    chapterConcepts.forEach((concept) => references.set(conceptReferenceKey(concept), concept.bookPage[1]));

    return { concepts: chapterConcepts, references };
  }, [book.id, currentConceptChapter, pages]);

  const reloadCurrentChapterConcepts = useCallback(async (): Promise<void> => {
    const loaded = await loadCurrentChapterConcepts();

    setConcepts(loaded.concepts);
    setConceptFirstPageByKey(loaded.references);
  }, [loadCurrentChapterConcepts, setConceptFirstPageByKey, setConcepts]);

  const addConcept = useCallback(async (): Promise<void> => {
    const title = newConceptTitle.trim();

    if (!title || !currentConceptChapter || isSavingNewConcept) {
      return;
    }

    const selectedPage = newConceptPage ? Number(newConceptPage) : undefined;

    if (selectedPage !== undefined && !currentConceptChapter.pageNumbers.includes(selectedPage)) {
      setError('Choose a page from the current chapter or leave Page empty.');

      return;
    }

    if (!Number.isInteger(newConceptAfterIndex) || newConceptAfterIndex < -1 || newConceptAfterIndex >= concepts.length) {
      setError('Choose where the new concept should be inserted.');

      return;
    }

    const insertionIndex = newConceptAfterIndex + 1;
    const chapterPage = pages.get(selectedPage ?? currentConceptChapter.pageNumbers[0]);
    const concept: Omit<BookConcept, 'id'> = {
      bookPage: [book.id, selectedPage ?? 0],
      chapterId: chapterPage?.chapterId ?? currentConceptChapter.chapterId,
      description: newConceptDescription.trim(),
      displayOrder: conceptInsertionDisplayOrder(concepts, insertionIndex),
      manuallyAdded: true,
      title
    };
    const existingIds = new Set(concepts.flatMap(({ id }) => id === undefined ? [] : [id]));

    setIsSavingNewConcept(true);

    try {
      await createBookConcept(concept);

      // Normalize displayOrder after insertion so future drag-and-drop operations
      // start from a simple 0..n order. The preliminary fractional order above
      // still puts the new row in the requested position if normalization cannot
      // run for an unexpected row without an id.
      const loaded = await loadCurrentChapterConcepts();
      const created = loaded.concepts.find(({ description, id, manuallyAdded, title: loadedTitle }) =>
        id !== undefined &&
        !existingIds.has(id) &&
        manuallyAdded === true &&
        loadedTitle === title &&
        description === newConceptDescription.trim()
      ) ?? loaded.concepts.find(({ id }) => id !== undefined && !existingIds.has(id));
      const existingConceptIds = concepts.flatMap(({ id }) => id === undefined ? [] : [id]);

      if (created?.id !== undefined && existingConceptIds.length === concepts.length) {
        const orderedIds = [...existingConceptIds];

        orderedIds.splice(insertionIndex, 0, created.id);
        await reorderBookConcepts(orderedIds, currentConceptChapter.chapterId);
      }

      await reloadCurrentChapterConcepts();
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setNewConceptAfterIndex(-1);
      setNewConceptDescription('');
      setNewConceptPage('');
      setNewConceptTitle('');
      setIsAddingConcept(false);
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to add the concept.');
      throw caught;
    } finally {
      setIsSavingNewConcept(false);
    }
  }, [book.id, concepts, currentConceptChapter, isSavingNewConcept, loadCurrentChapterConcepts, newConceptAfterIndex, newConceptDescription, newConceptPage, newConceptTitle, pages, refreshConceptCounts, refreshEntityCounts, reloadCurrentChapterConcepts, setError, setSkillsRefreshToken]);

  const reorder = useConceptReorder({
    concepts,
    conceptsOutputRef,
    currentConceptChapter,
    isApplyingFixConceptsReview,
    loadCurrentChapterConcepts,
    reloadCurrentChapterConcepts,
    setConceptFirstPageByKey,
    setConcepts,
    setError,
    setSkillsRefreshToken
  });

  const openConceptInsertion = useCallback((): void => {
    setNewConceptAfterIndex(concepts.length - 1);
    setIsAddingConcept(true);
  }, [concepts.length]);

  const closeConceptInsertion = useCallback((): void => {
    if (isSavingNewConcept) {
      return;
    }

    setIsAddingConcept(false);
    setNewConceptAfterIndex(-1);
    setNewConceptDescription('');
    setNewConceptPage('');
    setNewConceptTitle('');
  }, [isSavingNewConcept]);

  const conceptInsertionOptions = useMemo(() => [
    { text: 'Beginning of chapter', value: -1 },
    ...concepts.map((concept, index) => ({
      text: concept.title || `Concept ${index + 1}`,
      value: index
    }))
  ], [concepts]);

  const saveConcept = useCallback(async (concept: BookConcept, title: string, description: string, targetChapterIndex: number): Promise<void> => {
    if (concept.id === undefined) {
      setError('Unable to edit a concept without an id.');

      return;
    }

    const sourceChapterIndex = conceptChapters.findIndex((chapter) => conceptBelongsToChapter(concept, chapter));
    const resolvedSourceChapterIndex = sourceChapterIndex >= 0 ? sourceChapterIndex : conceptChapterIndex;
    const sourceChapter = conceptChapters[resolvedSourceChapterIndex];
    const targetChapter = conceptChapters[targetChapterIndex];

    if (!sourceChapter || !targetChapter) {
      setError('Unable to resolve the selected concept chapter.');

      return;
    }

    const isMovingChapter = resolvedSourceChapterIndex !== targetChapterIndex;

    if (isMovingChapter && targetChapter.chapterId === undefined) {
      setError('Unable to move the concept to a chapter without an id.');

      return;
    }

    try {
      await updateBookConcept(concept.id, { description, title });

      if (isMovingChapter) {
        const inventory = await getBookConceptInventory(book.id, pages.keys());
        const targetConcepts = conceptsForNavigationChapter(inventory, targetChapter).filter(({ id }) => id !== concept.id);
        // Moving forward puts the concept first in the new chapter; moving
        // backward puts it last. Keep bookPage unchanged as source provenance.
        const insertionIndex = conceptChapterMoveInsertionIndex(resolvedSourceChapterIndex, targetChapterIndex, targetConcepts.length);
        const preliminaryDisplayOrder = conceptInsertionDisplayOrder(targetConcepts, insertionIndex);

        await assignBookConceptsToChapters([{
          chapterId: targetChapter.chapterId as number,
          displayOrder: preliminaryDisplayOrder,
          id: concept.id
        }]);

        const targetIds = targetConcepts.flatMap(({ id }) => id === undefined ? [] : [id]);

        if (targetIds.length === targetConcepts.length) {
          targetIds.splice(insertionIndex, 0, concept.id);
          await reorderBookConcepts(targetIds, targetChapter.chapterId);
        }

        const sourceConcepts = conceptsForNavigationChapter(inventory, sourceChapter).filter(({ id }) => id !== concept.id);
        const sourceIds = sourceConcepts.flatMap(({ id }) => id === undefined ? [] : [id]);

        if (sourceIds.length === sourceConcepts.length && sourceIds.length) {
          await reorderBookConcepts(sourceIds, sourceChapter.chapterId);
        }
      }

      await reloadCurrentChapterConcepts();
      await refreshConceptCounts();
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to save the concept.';

      setError(message);
      throw caught;
    }
  }, [book.id, conceptChapterIndex, conceptChapters, pages, refreshConceptCounts, reloadCurrentChapterConcepts, setError, setSkillsRefreshToken]);

  const fixConceptWithAi = useCallback(async (concept: BookConcept): Promise<void> => {
    try {
      if (concept.id === undefined || !currentConceptChapter) {
        throw new Error('Unable to fix a Concept without its chapter context.');
      }

      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('OpenRouter API key is not configured.');
      }

      const chapterMmd = currentConceptChapter.pageNumbers.map((chapterPageNumber) => `--- page ${chapterPageNumber} ---\n${pages.get(chapterPageNumber)?.pageMMD ?? ''}`).join('\n\n');
      const client = createOpenRouterClient(key);
      const response = await runConceptRequestWithRetry(() => client.chat.completions.create({
        messages: [{ content: fixSingleConceptPrompt(currentConceptChapter.title, chapterMmd, concept, book.subject, book.language, book.age), role: 'user' }],
        model: generateAllConceptsModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addFixConceptsCost);
      const content = response.choices[0].message?.content?.trim();

      if (!content) {
        throw new Error('OpenRouter returned no single Concept repair data.');
      }

      const fixed = parseFixedConcept(content);

      if (fixed.title !== concept.title || fixed.description !== concept.description) {
        await saveConcept(concept, fixed.title, fixed.description, conceptChapterIndex);
      }

      setError('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to fix the Concept with AI.');
      throw caught;
    }
  }, [addFixConceptsCost, book.age, book.language, book.subject, conceptChapterIndex, currentConceptChapter, generateAllConceptsModel, pages, saveConcept, setError]);

  const deleteConcept = useCallback(async (concept: BookConcept): Promise<void> => {
    if (concept.id === undefined) {
      return;
    }

    try {
      await deleteConceptAndDependencies(book.id, concept, Array.from(pages.keys()));
      const referenceKey = conceptReferenceKey(concept);

      setConcepts((current) => current.filter(({ id }) => id !== concept.id));
      setConceptFirstPageByKey((current) => {
        const next = new Map(current);

        next.delete(referenceKey);

        return next;
      });
      setSkillsRefreshToken((value) => value + 1);
      await Promise.all([refreshEntityCounts(), refreshConceptCounts()]);
      setError('');
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'Unable to delete the concept.';

      setError(message);
      throw caught;
    }
  }, [book.id, pages, refreshConceptCounts, refreshEntityCounts, setConceptFirstPageByKey, setConcepts, setError, setSkillsRefreshToken]);

  return {
    addConcept,
    changeConceptChapter,
    closeConceptInsertion,
    conceptInsertionOptions,
    deleteConcept,
    fixConceptWithAi,
    isAddingConcept,
    isSavingNewConcept,
    loadCurrentChapterConcepts,
    newConceptAfterIndex,
    newConceptDescription,
    newConceptPage,
    newConceptTitle,
    openConceptInsertion,
    reloadCurrentChapterConcepts,
    saveConcept,
    setIsAddingConcept,
    setIsSavingNewConcept,
    setNewConceptAfterIndex,
    setNewConceptDescription,
    setNewConceptPage,
    setNewConceptTitle,
    ...reorder
  } as const;
}
