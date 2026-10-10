// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';

const ConceptItemContainer = styled.li`
  background: var(--bg-input);
  border: 1px solid #dde1eb;
  border-radius: 0.7rem;
  box-shadow: 0 1px 2px rgba(24, 39, 75, 0.04);
  padding: 0.95rem 1rem 1rem;
  position: relative;
  transition: opacity 120ms ease, transform 120ms ease;

  &:focus {
    outline: 2px solid var(--color-primary, #1682d4);
    outline-offset: 2px;
  }

  &.dragging {
    cursor: grabbing;
    opacity: 0.55;
    transform: scale(0.995);
  }

  &.conceptDropBefore::before,
  &.conceptDropAfter::after {
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

  &.conceptDropBefore::before {
    top: -0.55rem;
  }

  &.conceptDropAfter::after {
    bottom: -0.55rem;
  }

  > .conceptDragTitle {
    display: none;
    font-size: 0.98em;
    line-height: 1.3;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .conceptsOutput.conceptDragging & {
    transition: none;
  }

  .conceptsOutput.conceptDragging &:not(.dragging) {
    min-height: 0;
    padding: 0.5rem 0.75rem;
  }

  .conceptsOutput.conceptDragging &:not(.dragging) > .conceptDragTitle {
    display: block;
  }

  .conceptsOutput.conceptDragging &:not(.dragging) > :not(.conceptDragTitle) {
    display: none;
  }

  .conceptHeading {
    align-items: center;
    display: flex;
    gap: 0.8rem;
    justify-content: space-between;
  }

  .conceptDragHandle {
    color: #777;
    cursor: grab;
    flex: 0 0 auto;
    font-size: 1.25rem;
    line-height: 1;
    padding: 0.25rem 0.15rem;
    touch-action: none;
    user-select: none;
  }

  .conceptDragHandle:active {
    cursor: grabbing;
  }

  .conceptHeading > strong {
    flex: 1;
    font-size: 1.05em;
    line-height: 1.35;
    min-width: 0;
    overflow-wrap: anywhere;
    text-align: left;
  }

  .conceptNumber {
    font-variant-numeric: tabular-nums;
  }

  .conceptAttemptLabel {
    color: var(--color-text-secondary, #777);
    flex: 0 0 auto;
    font-size: 0.82em;
    font-variant-numeric: tabular-nums;
    line-height: 1.2;
    white-space: nowrap;
  }

  .conceptActions {
    align-items: center;
    display: flex;
    flex-shrink: 0;
    gap: 0.4rem;
  }

  > .conceptHeading .conceptActions button {
    height: 2.25rem !important;
    min-height: 2.25rem !important;
    min-width: 2.25rem !important;
    padding: 0.45rem !important;
    width: 2.25rem !important;
  }

  > .conceptHeading .conceptActions .conceptMenuTrigger {
    align-items: center;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.4rem;
    color: var(--color-text);
    cursor: pointer;
    display: inline-flex;
    justify-content: center;
  }

  > .conceptHeading .conceptActions .conceptMenuTrigger:hover,
  > .conceptHeading .conceptActions .conceptMenuTrigger[aria-expanded='true'] {
    background: var(--bg-menu);
    border-color: #dde1eb;
  }

  > .conceptHeading .conceptActions .conceptMenuTrigger:focus-visible {
    outline: 2px solid var(--color-primary, #1682d4);
    outline-offset: 2px;
  }

  > .conceptHeading .conceptActions .conceptMenuTrigger:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  .conceptMeta {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .conceptPageLink {
    background: rgba(47, 111, 235, 0.08);
    border: 1px solid rgba(47, 111, 235, 0.18);
    border-radius: 999px;
    color: var(--color-link, #2f6feb);
    cursor: pointer;
    font: inherit;
    font-size: 0.82em;
    line-height: 1.2;
    padding: 0.28rem 0.55rem;
    text-decoration: none;
  }

  .conceptPageLink:hover {
    background: rgba(47, 111, 235, 0.14);
    border-color: rgba(47, 111, 235, 0.28);
  }

  .conceptDescription {
    line-height: 1.55;
    margin-top: 0.65rem !important;
    max-width: 80ch;
    opacity: 0.9;
  }

  @media (max-width: 640px) {
    padding: 0.85rem;

    .conceptHeading {
      align-items: flex-start;
    }

    .conceptDescription {
      max-width: none;
    }
  }
`;

const ConceptActionsMenu = styled.div`
  background: var(--bg-menu);
  border: 1px solid #dde1eb;
  border-radius: 0.5rem;
  box-shadow: 0 6px 20px rgba(24, 39, 75, 0.16);
  box-sizing: border-box;
  min-width: 190px;
  padding: 0.3rem;
  position: fixed;
  z-index: 1000;

  button {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 0.3rem;
    color: var(--color-text);
    cursor: pointer;
    display: flex;
    font: inherit;
    gap: 0.7rem;
    min-height: 2.6rem;
    padding: 0.5rem 0.7rem;
    text-align: left;
    width: 100%;
  }

  button:hover,
  button:focus-visible {
    background: var(--bg-input);
  }

  button:focus-visible {
    outline: 2px solid var(--color-primary, #1682d4);
    outline-offset: -2px;
  }

  button .ui--Icon {
    width: 1.1rem;
  }
`;

export { ConceptActionsMenu, ConceptItemContainer };
