// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { getBook } from '@slonigiraf/db';

import { RoundProgress } from '@slonigiraf/slonig-components';
import { Button, LinearProgress, Modal, styled } from '@polkadot/react-components';

import { formatOpenRouterSpend } from '../../../openrouter/cost.js';
import type { ProcessingStatus } from '../types/processing.js';

interface OverallProgress {
  completed: number;
  total: number;
}


interface Props {
  bookId: number;
  label: string;
  onAbort: () => void;
  overallProgress?: OverallProgress;
  progressTotal: number;
  progressValue: number;
  spent: number;
}

function ProcessingPopup({ bookId, label, onAbort, overallProgress, progressTotal, progressValue, spent }: Props): React.ReactElement<Props> {
  // LiveQuery includes completed stages, previous runs and costs saved by the
  // current stage. The local counter is a fallback while the first write lands.
  const recordedSpend = useLiveQuery(() => getBook(bookId).then((book) =>
    Object.values(book?.stageSpend ?? {}).reduce((sum, cost) => sum + (typeof cost === 'number' && Number.isFinite(cost) ? cost : 0), 0)
  ), [bookId]);
  const totalSpent = Math.max(recordedSpend ?? 0, spent);

  return (
    <Modal
      header='Processing'
      onClose={onAbort}
      size='small'
    >
      <Modal.Content>
        <ProcessingContent>
          <section className='processingStage' aria-live='polite'>
            <strong className='processingStageLabel'>{label}</strong>
            <RoundProgress
              total={progressTotal}
              value={progressValue}
            />
            <span className='processingStageSpend'>{formatOpenRouterSpend(spent)} spent this stage</span>
            <span className='processingStageSpend'>{formatOpenRouterSpend(totalSpent)} spent in total</span>
          </section>

          {overallProgress && (
            <section className='processingOverall' aria-label='Overall progress'>
              <strong className='processingOverallLabel'>Overall progress</strong>
              <LinearProgress
                total={Math.max(1, overallProgress.total)}
                value={overallProgress.completed}
              />
            </section>
          )}


        </ProcessingContent>
      </Modal.Content>
      <Modal.Actions>
        <Button
          icon='times'
          label='Abort'
          onClick={onAbort}
        />
      </Modal.Actions>
    </Modal>
  );
}

const ProcessingContent = styled.div`
  box-sizing: border-box;
  margin: 0 auto;
  max-width: 34rem;
  padding: 0.5rem 0 0.25rem;
  width: 100%;

  .processingStage {
    align-items: center;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    text-align: center;
  }

  .processingStageLabel {
    display: block;
    font-size: 1.05rem;
    line-height: 1.35;
  }

  .processingStageSpend {
    font-size: 0.86rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.72;
  }

  .processingOverall {
    border-top: 1px solid var(--border-table);
    margin-top: 1.25rem;
    padding-top: 1rem;
    width: 100%;
  }

  .processingOverallLabel {
    display: block;
    font-size: 0.9rem;
    margin-bottom: 0.55rem;
    text-align: center;
  }

  .processingActions {
    align-items: center;
    display: flex;
    justify-content: flex-end;
    margin-top: 1.25rem;
    width: 100%;
  }

  .processingActions > * {
    flex: 0 0 auto;
  }
`;

export default React.memo(ProcessingPopup);

export type { ProcessingStatus } from '../types/processing.js';
