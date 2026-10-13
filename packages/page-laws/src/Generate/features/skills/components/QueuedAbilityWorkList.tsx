// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookAbilityWorkItem } from '@slonigiraf/db';
import React from 'react';
import { Button, styled } from '@polkadot/react-components';
import type { ChapterContent } from '../SkillsTypes.js';
import { queuedAbilityWorkLabel } from './queuedAbilityWorkLabel.js';

interface Props {
  items: readonly BookAbilityWorkItem[];
  chapterContent: readonly ChapterContent[];
  isBusy: boolean;
  removingItemId?: string;
  onRemove?: (itemId: string) => void;
  onRereviewScheduled?: () => void;
  isRereviewingScheduled?: boolean;
}

const ScheduledActions = styled.section`
  margin: 1rem 0;
  h4 { margin: 0 0 0.6rem; }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    max-height: min(38vh, 20rem);
    overflow-y: auto;
  }
  li {
    border-top: 1px solid var(--border-table, #d4d4d5);
    padding: 0.65rem 0;
  }
  .queuedAbilityWorkRow {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
  }
  .queuedAbilityWorkRow > div { min-width: 0; overflow-wrap: anywhere; }
  strong { display: block; }
  small { display: block; margin-top: 0.2rem; opacity: 0.75; }
  .queuedAbilityWorkRow .ui--Button { flex-shrink: 0; margin: 0; }
  .queuedAbilityWorkActions { margin-top: 0.8rem; }
`;

export default function QueuedAbilityWorkList ({ chapterContent, isBusy, isRereviewingScheduled = false, items, onRemove, onRereviewScheduled, removingItemId }: Props): React.ReactElement {
  return <ScheduledActions aria-label='Scheduled Ability actions'>
    <h4>Scheduled actions ({items.length})</h4>
    {!items.length ? <p>No Ability actions scheduled.</p> : <ul>
      {items.map((item) => {
        const { title, concept } = queuedAbilityWorkLabel(item, chapterContent);
        const action = item.kind === 'fix' ? 'Fix Ability' : 'Split Ability';

        return <li key={item.id}>
          <div className='queuedAbilityWorkRow'>
            <div>
              <strong>{title}</strong>
              <small>{action} · {concept}</small>
            </div>
            <Button
              aria-label={`Delete scheduled ${action} for ${title}`}
              icon='trash'
              isDisabled={isBusy || !onRemove}
              label={removingItemId === item.id ? 'Deleting…' : 'Delete'}
              onClick={() => onRemove?.(item.id)}
            />
          </div>
        </li>;
      })}
    </ul>}
    {!!items.length && <div className='queuedAbilityWorkActions'>
      <Button
        icon='redo'
        isDisabled={isBusy || isRereviewingScheduled || !onRereviewScheduled}
        label={isRereviewingScheduled ? 'Opening review…' : 'Rereview scheduled'}
        onClick={() => onRereviewScheduled?.()}
      />
    </div>}
  </ScheduledActions>;
}
