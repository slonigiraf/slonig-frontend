// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookConcept } from '@slonigiraf/db';
import { SpanWithTags } from '@slonigiraf/slonig-components';
import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button, Dropdown, Icon, Input, Modal } from '@polkadot/react-components';

import { type ConceptChapterNavigationItem } from '../../../../book/domain/concepts/conceptRecognition.js';
import ConceptForm from '../ConceptForm/ConceptForm.js';
import FixingOverlay from '../../../../shared/ui/FixingOverlay.js';
import { ConceptActionsMenu, ConceptItemContainer } from './ConceptItem.styles.js';

function ConceptItem ({ chapterIndex: initialChapterIndex, chapters, concept, conceptNumber, firstPage, onDelete, onFix, onGoToPage, onReorderPointerCancel, onReorderPointerDown, onReorderPointerMove, onReorderPointerUp, onSave }: { chapterIndex: number; chapters: ConceptChapterNavigationItem[]; concept: BookConcept; conceptNumber: number; firstPage?: number; onDelete: (concept: BookConcept) => Promise<void>; onFix: (concept: BookConcept) => Promise<void>; onGoToPage: (pageNumber: number) => void; onReorderPointerCancel?: (event: React.PointerEvent<HTMLLIElement>) => void; onReorderPointerDown?: (event: React.PointerEvent<HTMLLIElement>) => void; onReorderPointerMove?: (event: React.PointerEvent<HTMLLIElement>) => void; onReorderPointerUp?: (event: React.PointerEvent<HTMLLIElement>) => void; onSave: (concept: BookConcept, title: string, description: string, chapterIndex: number) => Promise<void> }): React.ReactElement {
  const [chapterIndex, setChapterIndex] = useState(initialChapterIndex);
  const [description, setDescription] = useState(concept.description);
  const [isBusy, setIsBusy] = useState(false);
  const [isFixing, setIsFixing] = useState(false);
  const [isDeleteConfirmationOpen, setIsDeleteConfirmationOpen] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [isActionsMenuOpen, setIsActionsMenuOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });
  const menuId = useId();
  const menuRef = useRef<HTMLDivElement>(null);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const [title, setTitle] = useState(concept.title);

  useEffect(() => {
    if (!isEditing) {
      setChapterIndex(initialChapterIndex);
      setTitle(concept.title);
      setDescription(concept.description);
    }
  }, [concept.description, concept.title, initialChapterIndex, isEditing]);

  const cancel = useCallback((): void => {
    if (isBusy) {
      return;
    }

    setChapterIndex(initialChapterIndex);
    setTitle(concept.title);
    setDescription(concept.description);
    setIsEditing(false);
  }, [concept.description, concept.title, initialChapterIndex, isBusy]);
  const fix = useCallback((): void => {
    setIsFixing(true);
    onFix(concept)
      .catch(console.error)
      .finally(() => setIsFixing(false));
  }, [concept, onFix]);
  const remove = useCallback((): void => setIsDeleteConfirmationOpen(true), []);
  const confirmRemove = useCallback((): void => {
    setIsBusy(true);
    onDelete(concept)
      .then(() => setIsDeleteConfirmationOpen(false))
      .catch(console.error)
      .finally(() => setIsBusy(false));
  }, [concept, onDelete]);
  const save = useCallback((): void => {
    const nextTitle = title.trim();

    if (!nextTitle) {
      return;
    }

    setIsBusy(true);
    onSave(concept, nextTitle, description.trim(), chapterIndex)
      .then(() => setIsEditing(false))
      .catch(console.error)
      .finally(() => setIsBusy(false));
  }, [chapterIndex, concept, description, onSave, title]);

  const toggleActionsMenu = useCallback((): void => {
    if (isActionsMenuOpen) {
      setIsActionsMenuOpen(false);

      return;
    }

    if (concept.id === undefined || isBusy || isFixing) {
      return;
    }

    const bounds = menuTriggerRef.current?.getBoundingClientRect();

    if (!bounds) {
      return;
    }

    // Render outside the scrollable concepts list so the menu is never clipped.
    const menuWidth = 190;
    const menuHeight = 144;

    setMenuPosition({
      left: Math.max(8, Math.min(bounds.right - menuWidth, window.innerWidth - menuWidth - 8)),
      top: bounds.bottom + menuHeight + 8 <= window.innerHeight
        ? bounds.bottom + 8
        : Math.max(8, bounds.top - menuHeight - 8)
    });
    setIsActionsMenuOpen(true);
  }, [concept.id, isActionsMenuOpen, isBusy, isFixing]);

  useEffect(() => {
    if (!isActionsMenuOpen) {
      return;
    }

    menuRef.current?.querySelector<HTMLButtonElement>('button')?.focus();

    const onPointerDown = (event: PointerEvent): void => {
      const target = event.target as Node;

      if (!menuTriggerRef.current?.contains(target) && !menuRef.current?.contains(target)) {
        setIsActionsMenuOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setIsActionsMenuOpen(false);
        menuTriggerRef.current?.focus();
      }
    };
    const closeMenu = (): void => setIsActionsMenuOpen(false);

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('scroll', closeMenu, true);
    window.addEventListener('resize', closeMenu);

    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('scroll', closeMenu, true);
      window.removeEventListener('resize', closeMenu);
    };
  }, [isActionsMenuOpen]);

  const onMenuKeyDown = useCallback((event: React.KeyboardEvent<HTMLDivElement>): void => {
    if (!['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      return;
    }

    const items = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
    const currentIndex = items.indexOf(document.activeElement as HTMLButtonElement);
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? items.length - 1
        : (currentIndex + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;

    event.preventDefault();
    items[nextIndex]?.focus();
  }, []);

  const canReorder = concept.id !== undefined && !isBusy && !isEditing && !isFixing;

  return <ConceptItemContainer
    aria-busy={isFixing}
    className='conceptItem'
    data-concept-id={concept.id}
    onLostPointerCapture={canReorder ? onReorderPointerCancel : undefined}
    onPointerCancel={canReorder ? onReorderPointerCancel : undefined}
    onPointerDown={canReorder ? onReorderPointerDown : undefined}
    onPointerMove={canReorder ? onReorderPointerMove : undefined}
    onPointerUp={canReorder ? onReorderPointerUp : undefined}
    tabIndex={-1}
  >
    <strong className='conceptDragTitle'><span className='conceptNumber'>{conceptNumber}.</span> <SpanWithTags content={concept.title} /></strong>
    {isDeleteConfirmationOpen && <Modal
      header='Delete concept'
      onClose={() => !isBusy && setIsDeleteConfirmationOpen(false)}
      size='small'
    >
      <Modal.Content>
        <p>Delete <strong><SpanWithTags content={concept.title} /></strong>?</p>
        <p>Exercises and abilities linked to this concept will also be deleted.</p>
        <Button.Group>
          <Button
            icon='times'
            isDisabled={isBusy}
            label='Cancel'
            onClick={() => setIsDeleteConfirmationOpen(false)}
          />
          <Button
            icon='trash'
            isDisabled={isBusy}
            label='Delete'
            onClick={confirmRemove}
          />
        </Button.Group>
      </Modal.Content>
    </Modal>}
    {isEditing && <Modal
      header='Edit concept'
      onClose={cancel}
      size='small'
    >
      <Modal.Content>
        <ConceptForm>
          <Input
            autoFocus
            isDisabled={isBusy}
            isFull
            label='Concept title'
            onChange={setTitle}
            onEnter={save}
            value={title}
          />
          <label>
            <span>Description</span>
            <textarea
              disabled={isBusy}
              onChange={({ target }) => setDescription(target.value)}
              rows={5}
              value={description}
            />
          </label>
          <Dropdown
            isDisabled={isBusy}
            isFull
            label='Chapter'
            onChange={setChapterIndex}
            options={chapters.map(({ chapterId, title }, index) => ({
              key: chapterId ?? index,
              text: title || `Chapter ${index + 1}`,
              value: index
            }))}
            value={chapterIndex}
          />
          <Button.Group>
            <Button
              icon='times'
              isDisabled={isBusy}
              label='Cancel'
              onClick={cancel}
            />
            <Button
              icon='save'
              isDisabled={isBusy || !title.trim() || (title.trim() === concept.title && description.trim() === concept.description && chapterIndex === initialChapterIndex)}
              label={isBusy ? 'Saving…' : 'Save'}
              onClick={save}
            />
          </Button.Group>
        </ConceptForm>
      </Modal.Content>
    </Modal>}
    <div className='conceptHeading'>
      <span
        className='conceptDragHandle'
        title='Drag to reorder'
      >⋮⋮</span>
      <strong><span className='conceptNumber'>{conceptNumber}.</span> <SpanWithTags content={concept.title} /></strong>
      <div className='conceptActions'>
        <button
          aria-controls={isActionsMenuOpen ? menuId : undefined}
          aria-expanded={isActionsMenuOpen}
          aria-haspopup='menu'
          aria-label={`Actions for concept ${conceptNumber}`}
          className='conceptMenuTrigger'
          disabled={concept.id === undefined || isBusy || isFixing}
          onClick={toggleActionsMenu}
          ref={menuTriggerRef}
          title='Concept actions'
          type='button'
        ><Icon icon='ellipsis-v' /></button>
        {isActionsMenuOpen && createPortal(
          <ConceptActionsMenu
            aria-label={`Actions for concept ${conceptNumber}`}
            id={menuId}
            onKeyDown={onMenuKeyDown}
            ref={menuRef}
            role='menu'
            style={{ left: menuPosition.left, top: menuPosition.top }}
          >
            <button
              onClick={() => { setIsActionsMenuOpen(false); fix(); }}
              role='menuitem'
              type='button'
            ><Icon icon='robot' />Fix with AI</button>
            <button
              onClick={() => { setIsActionsMenuOpen(false); setIsEditing(true); }}
              role='menuitem'
              type='button'
            ><Icon icon='edit' />Edit</button>
            <button
              onClick={() => { setIsActionsMenuOpen(false); remove(); }}
              role='menuitem'
              type='button'
            ><Icon icon='trash' />Delete</button>
          </ConceptActionsMenu>,
          document.body
        )}
      </div>
    </div>
    <div className='conceptMeta'>
      <span
        aria-label={`Fix Concepts attempt ${concept.attempt ?? 0}`}
        className='conceptAttemptLabel'
        title={`Fix Concepts attempt ${concept.attempt ?? 0}`}
      >{concept.attempt ?? 0} attempt</span>
      {firstPage !== undefined && <button
        className='conceptPageLink'
        onClick={() => onGoToPage(firstPage)}
        type='button'
      >{concept.manuallyAdded ? `Page ${firstPage}` : `Introduced at page ${firstPage}`}</button>}
    </div>
    {concept.description && <p className='conceptDescription'><SpanWithTags content={concept.description} /></p>}
    {isFixing && <FixingOverlay />}
  </ConceptItemContainer>;
}

export default ConceptItem;
