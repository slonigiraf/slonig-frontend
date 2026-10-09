// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';

interface ItemAction {
  label: string;
  onClick: () => void;
  isDisabled?: boolean;
  isDestructive?: boolean;
}

interface Props {
  actions: ItemAction[];
  label: string;
}

/** Compact, keyboard-accessible actions for an individual Ability or Exercise. */
export default function ItemActionsMenu ({ actions, label }: Props): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setIsOpen(false), []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const closeOnOutsideClick = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) {
        close();
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        close();
        triggerRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);

    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [close, isOpen]);

  return <ActionsContainer ref={containerRef}>
    <button
      aria-expanded={isOpen}
      aria-label={`${label} actions`}
      className='itemActionsTrigger'
      onClick={() => setIsOpen((open) => !open)}
      ref={triggerRef}
      title={`${label} actions`}
      type='button'
    >&#8942;</button>
    {isOpen && <div aria-label={`${label} actions`} className='itemActionsPopover' role='group'>
      {actions.map(({ isDestructive, isDisabled, label: actionLabel, onClick }) => <button
        className={isDestructive ? 'isDestructive' : undefined}
        disabled={isDisabled}
        key={actionLabel}
        onClick={() => {
          close();
          onClick();
        }}
        type='button'
      >{actionLabel}</button>)}
    </div>}
  </ActionsContainer>;
}

const ActionsContainer = styled.div`
  display: inline-flex;
  position: relative;

  .itemActionsTrigger {
    align-items: center;
    background: var(--bg-input, #fff);
    border: 1px solid var(--border-table, #d4d4d5);
    border-radius: 0.4rem;
    color: var(--color-text);
    cursor: pointer;
    display: inline-flex;
    font-size: 1.5rem;
    height: 2.25rem;
    justify-content: center;
    line-height: 1;
    padding: 0;
    width: 2.25rem;
  }

  .itemActionsTrigger:hover,
  .itemActionsTrigger[aria-expanded='true'] {
    background: var(--bg-menu, #f3f3f3);
  }

  .itemActionsTrigger:focus-visible,
  .itemActionsPopover button:focus-visible {
    outline: 2px solid var(--color-primary, #1682d4);
    outline-offset: 2px;
  }

  .itemActionsPopover {
    background: var(--bg-menu, #fff);
    border: 1px solid var(--border-table, #d4d4d5);
    border-radius: 0.4rem;
    box-shadow: 0 3px 12px rgba(0, 0, 0, 0.15);
    display: flex;
    flex-direction: column;
    min-width: 10rem;
    padding: 0.25rem;
    position: absolute;
    right: 0;
    top: calc(100% + 0.3rem);
    z-index: 10;
  }

  .itemActionsPopover button {
    background: transparent;
    border: 0;
    border-radius: 0.25rem;
    color: var(--color-text);
    cursor: pointer;
    font: inherit;
    padding: 0.6rem 0.75rem;
    text-align: left;
    white-space: nowrap;
  }

  .itemActionsPopover button:hover:not(:disabled) {
    background: var(--bg-input, #f3f3f3);
  }

  .itemActionsPopover button:disabled {
    cursor: default;
    opacity: 0.45;
  }

  .itemActionsPopover button.isDestructive {
    color: #b83030;
  }
`;
