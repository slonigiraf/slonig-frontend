// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';
import { reorderBookConcepts } from '@slonigiraf/db';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { ConceptChapterNavigationItem } from '../../../book/domain/concepts/conceptRecognition.js';
import { matchingLiveConcept } from '../../../book/application/workspace/bookReaderWorkspace.js';
interface UseConceptReorderOptions {
  concepts: BookConcept[];
  conceptsOutputRef: React.RefObject<HTMLDivElement>;
  currentConceptChapter?: ConceptChapterNavigationItem;
  isApplyingFixConceptsReview: boolean;
  loadCurrentChapterConcepts: () => Promise<{ concepts: BookConcept[]; references: Map<string, number> }>;
  reloadCurrentChapterConcepts: () => Promise<void>;
  setConceptFirstPageByKey: Dispatch<SetStateAction<Map<string, number>>>;
  setConcepts: Dispatch<SetStateAction<BookConcept[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setSkillsRefreshToken: Dispatch<SetStateAction<number>>;
}

export function useConceptReorder ({
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
}: UseConceptReorderOptions) {
  const [isReorderingConcepts, setIsReorderingConcepts] = useState(false);
  const draggedConceptIndexRef = useRef<number | undefined>(undefined);
  const conceptDropTargetIndexRef = useRef<number | undefined>(undefined);
  const conceptDragPointerIdRef = useRef<number | undefined>(undefined);
  const conceptDragPointerYRef = useRef<number | undefined>(undefined);
  const conceptAutoScrollFrameRef = useRef<number | undefined>(undefined);
  const reorderedConceptFocusIdRef = useRef<BookConcept['id']>(undefined);

  const reorderConcepts = useCallback(async (fromIndex: number, toIndex: number): Promise<void> => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= concepts.length || toIndex >= concepts.length || isReorderingConcepts || isApplyingFixConceptsReview) {
      return;
    }

    const previous = concepts;
    const displayedMoved = concepts[fromIndex];

    setIsReorderingConcepts(true);

    try {
      // Re-read the chapter at drop time. Fix Concepts can delete/recreate rows,
      // so the rendered list may contain ids that were valid when it was loaded
      // but are no longer the live chapter rows. Rebase the user's move onto the
      // live list before persisting it.
      const loaded = await loadCurrentChapterConcepts();
      const liveConcepts = loaded.concepts;
      const moved = matchingLiveConcept(displayedMoved, liveConcepts);

      if (!moved) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        setError('Concepts were updated by Fix Concepts, so the chapter list was refreshed. Drag the current concept to reorder it.');
        return;
      }

      const liveFromIndex = liveConcepts.findIndex(({ id }) => id !== undefined && id === moved.id);

      if (liveFromIndex < 0) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        return;
      }

      const liveToIndex = Math.min(toIndex, Math.max(0, liveConcepts.length - 1));

      if (liveFromIndex === liveToIndex) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        setError('');
        return;
      }

      const reordered = [...liveConcepts];
      const [liveMoved] = reordered.splice(liveFromIndex, 1);

      reordered.splice(liveToIndex, 0, liveMoved);

      const orderedConcepts = reordered.map((concept, index) => ({ ...concept, displayOrder: index }));
      const sortedIds = orderedConcepts.flatMap(({ id }) => id === undefined ? [] : [id]);

      if (sortedIds.length !== orderedConcepts.length) {
        setConcepts(liveConcepts);
        setConceptFirstPageByKey(loaded.references);
        setError('Unable to reorder a concept without an id.');
        return;
      }

      reorderedConceptFocusIdRef.current = liveMoved.id;
      setConcepts(orderedConcepts);
      setConceptFirstPageByKey(loaded.references);

      await reorderBookConcepts(sortedIds, currentConceptChapter?.chapterId);
      // Reordering only changes the learning/display sequence. It must not
      // invalidate processing history: generated/fixed Exercises and later
      // stages remain valid, while DB order propagation updates dependent
      // Exercise/Ability displayOrder values in place.
      await reloadCurrentChapterConcepts();
      setSkillsRefreshToken((value) => value + 1);
      setError('');
    } catch (caught) {
      setConcepts(previous);
      setError(caught instanceof Error ? caught.message : 'Unable to reorder concepts.');
    } finally {
      setIsReorderingConcepts(false);
    }
  }, [concepts, currentConceptChapter?.chapterId, isApplyingFixConceptsReview, isReorderingConcepts, loadCurrentChapterConcepts, reloadCurrentChapterConcepts, setConceptFirstPageByKey, setConcepts, setError, setSkillsRefreshToken]);

  useLayoutEffect((): void => {
    const conceptId = reorderedConceptFocusIdRef.current;
    const scroller = conceptsOutputRef.current;

    if (conceptId === undefined || !scroller) {
      return;
    }

    const movedRow = Array.from(scroller.querySelectorAll<HTMLElement>('.conceptItem'))
      .find((row) => row.dataset.conceptId === String(conceptId));

    if (!movedRow) {
      return;
    }

    reorderedConceptFocusIdRef.current = undefined;
    movedRow.scrollIntoView({ block: 'nearest' });
    movedRow.focus({ preventScroll: true });
  }, [concepts, conceptsOutputRef]);

  const clearConceptDropMarker = useCallback((): void => {
    const scroller = conceptsOutputRef.current;

    scroller?.querySelector('.conceptItem.conceptDropBefore')?.classList.remove('conceptDropBefore');
    scroller?.querySelector('.conceptItem.conceptDropAfter')?.classList.remove('conceptDropAfter');
  }, [conceptsOutputRef]);

  const updateConceptDropTarget = useCallback((pointerY: number): void => {
    const scroller = conceptsOutputRef.current;
    const sourceIndex = draggedConceptIndexRef.current;

    if (!scroller || sourceIndex === undefined) {
      return;
    }

    const rows = Array.from(scroller.querySelectorAll<HTMLElement>('.conceptItem'));
    const otherRows = rows.filter((_, index) => index !== sourceIndex);

    clearConceptDropMarker();

    if (!otherRows.length) {
      conceptDropTargetIndexRef.current = sourceIndex;

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

    conceptDropTargetIndexRef.current = insertionIndex;

    if (insertionIndex < otherRows.length) {
      otherRows[insertionIndex].classList.add('conceptDropBefore');
    } else {
      otherRows[otherRows.length - 1].classList.add('conceptDropAfter');
    }
  }, [clearConceptDropMarker, conceptsOutputRef]);

  const stopConceptAutoScroll = useCallback((): void => {
    conceptDragPointerYRef.current = undefined;

    if (conceptAutoScrollFrameRef.current !== undefined) {
      window.cancelAnimationFrame(conceptAutoScrollFrameRef.current);
      conceptAutoScrollFrameRef.current = undefined;
    }
  }, []);

  const startConceptAutoScroll = useCallback((): void => {
    if (conceptAutoScrollFrameRef.current !== undefined) {
      return;
    }

    const scroll = (): void => {
      conceptAutoScrollFrameRef.current = undefined;

      const scroller = conceptsOutputRef.current;
      const pointerY = conceptDragPointerYRef.current;

      if (!scroller || pointerY === undefined) {
        return;
      }

      const bounds = scroller.getBoundingClientRect();
      const edgeSize = Math.min(96, Math.max(48, bounds.height * 0.22));
      const topDistance = pointerY - bounds.top;
      const bottomDistance = bounds.bottom - pointerY;
      let scrollAmount = 0;

      if (topDistance < edgeSize && scroller.scrollTop > 0) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, topDistance)) / edgeSize));

        scrollAmount = -(4 + (20 * strength));
      } else if (bottomDistance < edgeSize && scroller.scrollTop + scroller.clientHeight < scroller.scrollHeight) {
        const strength = Math.max(0, Math.min(1, (edgeSize - Math.max(0, bottomDistance)) / edgeSize));

        scrollAmount = 4 + (20 * strength);
      }

      if (scrollAmount !== 0) {
        scroller.scrollTop += scrollAmount;
        updateConceptDropTarget(pointerY);
      }

      conceptAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
    };

    conceptAutoScrollFrameRef.current = window.requestAnimationFrame(scroll);
  }, [conceptsOutputRef, updateConceptDropTarget]);

  const finishConceptDrag = useCallback((): void => {
    stopConceptAutoScroll();
    draggedConceptIndexRef.current = undefined;
    conceptDropTargetIndexRef.current = undefined;
    conceptDragPointerIdRef.current = undefined;
    clearConceptDropMarker();
    conceptsOutputRef.current?.classList.remove('conceptDragging');
    conceptsOutputRef.current?.querySelector('.conceptItem.dragging')?.classList.remove('dragging');
  }, [clearConceptDropMarker, conceptsOutputRef, stopConceptAutoScroll]);

  const beginConceptPointerDrag = useCallback((index: number, event: React.PointerEvent<HTMLLIElement>): void => {
    if (isReorderingConcepts || isApplyingFixConceptsReview || (event.pointerType === 'mouse' && event.button !== 0)) {
      return;
    }

    const target = event.target as HTMLElement;

    // Only start reordering from the dedicated drag handle. This keeps clicks,
    // text selection, and scrolling on the title/description from starting a drag.
    if (!target.closest('.conceptDragHandle')) {
      return;
    }

    event.preventDefault();
    event.stopPropagation();

    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture can fail if the browser has already cancelled the pointer.
    }

    draggedConceptIndexRef.current = index;
    conceptDropTargetIndexRef.current = index;
    conceptDragPointerIdRef.current = event.pointerId;
    conceptDragPointerYRef.current = event.clientY;
    event.currentTarget.classList.add('dragging');
    conceptsOutputRef.current?.classList.add('conceptDragging');
    updateConceptDropTarget(event.clientY);
    startConceptAutoScroll();
  }, [conceptsOutputRef, isApplyingFixConceptsReview, isReorderingConcepts, startConceptAutoScroll, updateConceptDropTarget]);

  const moveConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId || draggedConceptIndexRef.current === undefined) {
      return;
    }

    event.preventDefault();
    conceptDragPointerYRef.current = event.clientY;
    updateConceptDropTarget(event.clientY);
    startConceptAutoScroll();
  }, [startConceptAutoScroll, updateConceptDropTarget]);

  const cancelConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    finishConceptDrag();
  }, [finishConceptDrag]);

  const endConceptPointerDrag = useCallback((event: React.PointerEvent<HTMLLIElement>): void => {
    if (conceptDragPointerIdRef.current !== event.pointerId) {
      return;
    }

    event.preventDefault();

    const sourceIndex = draggedConceptIndexRef.current;
    const targetIndex = conceptDropTargetIndexRef.current;

    try {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
    } catch {
      // Ignore browsers that release capture automatically before pointerup.
    }

    finishConceptDrag();

    if (sourceIndex !== undefined && targetIndex !== undefined && sourceIndex !== targetIndex) {
      void reorderConcepts(sourceIndex, targetIndex);
    }
  }, [finishConceptDrag, reorderConcepts]);

  useEffect(() => finishConceptDrag, [finishConceptDrag]);

  return {
    beginConceptPointerDrag,
    cancelConceptPointerDrag,
    clearConceptDropMarker,
    conceptAutoScrollFrameRef,
    conceptDragPointerIdRef,
    conceptDragPointerYRef,
    conceptDropTargetIndexRef,
    draggedConceptIndexRef,
    endConceptPointerDrag,
    finishConceptDrag,
    isReorderingConcepts,
    moveConceptPointerDrag,
    reorderedConceptFocusIdRef,
    reorderConcepts,
    setIsReorderingConcepts,
    startConceptAutoScroll,
    stopConceptAutoScroll,
    updateConceptDropTarget
  } as const;
}
