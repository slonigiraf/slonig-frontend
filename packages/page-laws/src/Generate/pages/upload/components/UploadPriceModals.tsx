// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import React from 'react';

import { Modal, styled } from '@polkadot/react-components';

import type { BookExternalCalls } from '../../../book/runtime/bookExternalCalls.js';
import type { BookStageTimes } from '../../../book/runtime/bookStageTime.js';

import { BOOK_PRICE_STAGES } from '../../../book/runtime/bookPipeline.js';
import { bookExternalCallTotal } from '../../../book/runtime/bookExternalCalls.js';
import { formatBookStageTime } from '../../../book/runtime/bookStageTime.js';
import { formatOpenRouterSpend } from '../../../../openrouter/cost.js';
import StageRunPricePopup from '../../../components/StageRunPricePopup.js';
import { useTranslation } from '../../../../common/translate.js';

export interface FastForwardEstimate {
  aiUsd: number;
  pageCount: number;
  recognitionUsd: number;
  remainingStages: number;
  totalUsd: number;
}

interface FastForwardPricePopupProps {
  estimate?: FastForwardEstimate;
  onClose: () => void;
  onRun: () => void;
}

export function FastForwardPricePopup ({ estimate, onClose, onRun }: FastForwardPricePopupProps): React.ReactElement {
  const { t } = useTranslation();

  return (
    <StageRunPricePopup
      header={t('Run remaining stages')}
      isRunDisabled={!estimate || estimate.remainingStages === 0}
      onClose={onClose}
      onRun={onRun}
      runLabel={t('Run')}
    >
      <PriceContent>
        <p className='priceIntro'>{t('Run every remaining processing stage automatically, one by one. Publishing to blockchain is not included.')}</p>
        {!estimate
          ? <div className='fastForwardEstimateStatus'>{t('Calculating price estimate…')}</div>
          : <>
            <div className='fastForwardEstimateHeading'>
              <strong>{t('Estimated processing cost')}</strong>
              <span className='fastForwardStageBadge'>{estimate.remainingStages} {t(estimate.remainingStages === 1 ? 'stage' : 'stages')}</span>
            </div>
            <div className='priceTableFrame'>
              <table className='priceTable fastForwardPriceTable'>
                <tbody>
                  <tr className={estimate.recognitionUsd === 0 ? 'isZero' : undefined}>
                    <th scope='row'>
                      {t('Mathpix recognition')}
                      <small className='priceSource'>{estimate.pageCount.toLocaleString()} {t(estimate.pageCount === 1 ? 'page' : 'pages')}</small>
                    </th>
                    <td>{formatOpenRouterSpend(estimate.recognitionUsd)}</td>
                  </tr>
                  <tr className={estimate.aiUsd === 0 ? 'isZero' : undefined}>
                    <th scope='row'>
                      {t('AI / processing')}
                      <small className='priceSource'>{t('Remaining automated processing')}</small>
                    </th>
                    <td>{formatOpenRouterSpend(estimate.aiUsd)}</td>
                  </tr>
                </tbody>
                <tfoot>
                  <tr>
                    <th scope='row'>{t('Estimated total')}</th>
                    <td>≈ {formatOpenRouterSpend(estimate.totalUsd)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className='fastForwardEstimateFootnote'>{t('Based on the current book size, default models for each stage, and recorded stage costs when available. Later stages may cost more or less as earlier stages create content.')}</p>
          </>}
      </PriceContent>
    </StageRunPricePopup>
  );
}

interface BookStatisticsModalProps {
  book?: Book;
  externalCalls: BookExternalCalls;
  onClose: () => void;
  stageTimes: BookStageTimes;
}

export function BookStatisticsModal ({ book, externalCalls, onClose, stageTimes }: BookStatisticsModalProps): React.ReactElement {
  const { t } = useTranslation();
  const totalSpend = BOOK_PRICE_STAGES.reduce((total, { key }) => total + (book?.stageSpend?.[key] ?? 0), 0);
  const totalStageTime = BOOK_PRICE_STAGES.reduce((total, { key }) => total + (stageTimes[key] ?? 0), 0);
  const totalExternalCalls = BOOK_PRICE_STAGES.reduce((total, { key }) => total + bookExternalCallTotal(externalCalls[key]), 0);

  return (
    <PriceModal
      header={t('Statistics')}
      onClose={onClose}
      size='small'
    >
      <Modal.Content>
        <PriceContent>
          <div className='priceTableFrame'>
            <table className='priceTable'>
              <colgroup>
                <col className='priceStageColumn' />
                <col className='priceCallsColumn' />
                <col className='priceValueColumn' />
                <col className='priceTimeColumn' />
              </colgroup>
              <thead>
                <tr>
                  <th scope='col'>{t('Stage')}</th>
                  <th scope='col'>{t('External calls')}</th>
                  <th scope='col'>{t('Price, $')}</th>
                  <th scope='col'>{t('Time, s')}</th>
                </tr>
              </thead>
              <tbody>
                {BOOK_PRICE_STAGES.map(({ key, label }) => {
                  const value = book?.stageSpend?.[key] ?? 0;
                  const elapsedMs = stageTimes[key] ?? 0;
                  const stageExternalCalls = externalCalls[key];

                  return <tr className={value === 0 && elapsedMs === 0 && bookExternalCallTotal(stageExternalCalls) === 0 ? 'isZero' : undefined} key={key}>
                    <th scope='row'>{t(label)}</th>
                    <td className='priceCallsCell'>{bookExternalCallTotal(stageExternalCalls).toLocaleString()}</td>
                    <td>{formatOpenRouterSpend(value)}</td>
                    <td>{formatBookStageTime(elapsedMs)}</td>
                  </tr>;
                })}
              </tbody>
              <tfoot>
                <tr>
                  <th scope='row'>{t('Total')}</th>
                  <td className='priceCallsCell'>{totalExternalCalls.toLocaleString()}</td>
                  <td>{formatOpenRouterSpend(totalSpend)}</td>
                  <td>{formatBookStageTime(totalStageTime)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </PriceContent>
      </Modal.Content>
    </PriceModal>
  );
}

const PriceModal = styled(Modal)`
  .ui--Modal__body {
    max-width: 58rem;
    width: calc(100vw - 2rem);
  }
`;

const PriceContent = styled.div`
  padding: 0.15rem 0 0.35rem;

  .priceIntro {
    line-height: 1.5;
    margin: 0 0 1rem;
    opacity: 0.72;
  }

  .priceTableFrame {
    border: 1px solid rgba(127, 127, 127, 0.22);
    border-radius: 0.65rem;
    overflow: hidden;
  }

  .priceTable {
    border-collapse: collapse;
    table-layout: fixed;
    width: 100%;
  }

  .priceTable th,
  .priceTable td {
    border-bottom: 1px solid rgba(127, 127, 127, 0.16);
    padding: 0.68rem 0.9rem;
    vertical-align: middle;
  }

  .priceStageColumn {
    width: 38%;
  }

  .priceCallsColumn {
    width: 20%;
  }

  .priceValueColumn,
  .priceTimeColumn {
    width: 21%;
  }

  .priceTable th {
    font-weight: 550;
    text-align: left;
  }

  .priceTable thead th {
    background: rgba(127, 127, 127, 0.06);
    font-size: 0.8rem;
    font-weight: 650;
    letter-spacing: 0.02em;
  }

  .priceTable thead th:not(:first-child) {
    text-align: right;
  }

  .fastForwardPriceTable th {
    width: 62%;
  }

  .priceTable td {
    font-variant-numeric: tabular-nums;
    font-weight: 500;
    letter-spacing: 0.01em;
    text-align: right;
    white-space: nowrap;
  }

  .priceTable tbody tr:last-child th,
  .priceTable tbody tr:last-child td {
    border-bottom: 0;
  }

  .priceTable tbody tr.isZero {
    opacity: 0.56;
  }

  .priceSource {
    display: block;
    font-size: 0.78rem;
    font-weight: 400;
    margin-top: 0.1rem;
    opacity: 0.68;
  }

  .priceTable tfoot th,
  .priceTable tfoot td {
    background: rgba(127, 127, 127, 0.08);
    border-bottom: 0;
    border-top: 1px solid rgba(127, 127, 127, 0.24);
    font-weight: 700;
    padding-bottom: 0.78rem;
    padding-top: 0.78rem;
  }

  .fastForwardEstimateStatus {
    background: rgba(127, 127, 127, 0.07);
    border: 1px solid rgba(127, 127, 127, 0.2);
    border-radius: 0.65rem;
    line-height: 1.45;
    padding: 0.8rem 0.9rem;
  }

  .fastForwardEstimateHeading {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    margin: 0 0 0.55rem;
  }

  .fastForwardEstimateHeading > strong {
    font-size: 0.94rem;
  }

  .fastForwardStageBadge {
    background: rgba(127, 127, 127, 0.12);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: 999px;
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
    padding: 0.2rem 0.5rem;
    white-space: nowrap;
  }

  .fastForwardPriceTable tfoot td {
    font-size: 1.08rem;
    font-weight: 700;
  }

  .fastForwardEstimateFootnote {
    font-size: 0.73rem;
    line-height: 1.4;
    margin: 0.55rem 0 0;
    opacity: 0.58;
  }

  @media only screen and (max-width: 480px) {
    .priceTable th,
    .priceTable td {
      padding-left: 0.7rem;
      padding-right: 0.7rem;
    }
  }
`;
