// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';

import { styled } from '@polkadot/react-components';

import type { AiInputEstimate } from './aiEstimate.js';

interface AiPriceEstimateProps {
  estimate: AiInputEstimate | string | undefined;
  title?: string;
}

interface UnitPriceEstimateProps {
  count: number | undefined;
  lineLabel?: string;
  title?: string;
  unitLabel: string;
  unitPriceUsd: number;
}

function formatUsd (value: number): string {
  if (value === 0) {
    return '$0.0000';
  }

  if (value < 0.0001) {
    return `$${value.toFixed(6)}`;
  }

  return `$${value.toFixed(4)}`;
}

function formatRate (priceUsd: number, tokens: number): string {
  if (!tokens) {
    return '$0.00';
  }

  return `$${(priceUsd * 1_000_000 / tokens).toFixed(2)}`;
}

function pluralize (count: number, singular: string, plural = `${singular}s`): string {
  return count === 1 ? singular : plural;
}

function EstimateShell ({ children, requestSummary, title }: { children?: React.ReactNode; requestSummary?: string; title: string }): React.ReactElement {
  return <StyledEstimate>
    <div className='estimateHeading'>
      <strong>{title}</strong>
      {requestSummary && <span className='estimateBadge'>{requestSummary}</span>}
    </div>
    {children}
  </StyledEstimate>;
}

export function AiPriceEstimate ({ estimate, title = 'Estimated cost' }: AiPriceEstimateProps): React.ReactElement {
  if (!estimate) {
    return <EstimateShell title={title}>
      <div className='estimateStatus'>Calculating estimate…</div>
    </EstimateShell>;
  }

  if (typeof estimate === 'string') {
    return <EstimateShell title={title}>
      <div className='estimateStatus'>{estimate}</div>
    </EstimateShell>;
  }

  const requestPrice = estimate.requests ? estimate.totalPriceUsd / estimate.requests : 0;

  return <EstimateShell
    requestSummary={`${estimate.requests.toLocaleString()} ${pluralize(estimate.requests, 'request')}`}
    title={title}
  >
    <div className='estimateRows'>
      <div className='estimateRow'>
        <div>
          <strong>Input</strong>
          <small>{estimate.inputTokens.toLocaleString()} tokens × {formatRate(estimate.inputPriceUsd, estimate.inputTokens)} / 1M</small>
        </div>
        <span className='estimateAmount'>{formatUsd(estimate.inputPriceUsd)}</span>
      </div>
      <div className='estimateRow'>
        <div>
          <strong>Output</strong>
          <small>{estimate.outputTokens.toLocaleString()} tokens × {formatRate(estimate.outputPriceUsd, estimate.outputTokens)} / 1M</small>
        </div>
        <span className='estimateAmount'>{formatUsd(estimate.outputPriceUsd)}</span>
      </div>
    </div>
    <div className='estimateTotal'>
      <div>
        <small>Estimated total</small>
        <strong>{formatUsd(estimate.totalPriceUsd)}</strong>
      </div>
      <span>≈ {formatUsd(requestPrice)} / request</span>
    </div>
    <p className='estimateFootnote'>Estimate based on the selected model and expected token usage. Actual provider usage can differ.</p>
  </EstimateShell>;
}

export function UnitPriceEstimate ({ count, lineLabel = 'Usage', title = 'Estimated cost', unitLabel, unitPriceUsd }: UnitPriceEstimateProps): React.ReactElement {
  if (count === undefined) {
    return <EstimateShell title={title}>
      <div className='estimateStatus'>Calculating estimate…</div>
    </EstimateShell>;
  }

  const total = count * unitPriceUsd;

  return <EstimateShell
    requestSummary={`${count.toLocaleString()} ${pluralize(count, unitLabel)}`}
    title={title}
  >
    <div className='estimateRows'>
      <div className='estimateRow'>
        <div>
          <strong>{lineLabel}</strong>
          <small>{count.toLocaleString()} {pluralize(count, unitLabel)} × {formatUsd(unitPriceUsd)} each</small>
        </div>
        <span className='estimateAmount'>{formatUsd(total)}</span>
      </div>
    </div>
    <div className='estimateTotal'>
      <div>
        <small>Estimated total</small>
        <strong>{formatUsd(total)}</strong>
      </div>
      <span>{formatUsd(unitPriceUsd)} / {unitLabel}</span>
    </div>
  </EstimateShell>;
}

const StyledEstimate = styled.div`
  margin: 1rem 0;

  .estimateHeading {
    align-items: center;
    display: flex;
    gap: 0.75rem;
    justify-content: space-between;
    margin-bottom: 0.55rem;
  }

  .estimateHeading > strong {
    font-size: 0.94rem;
  }

  .estimateBadge {
    background: rgba(127, 127, 127, 0.12);
    border: 1px solid rgba(127, 127, 127, 0.18);
    border-radius: 999px;
    font-size: 0.76rem;
    font-variant-numeric: tabular-nums;
    padding: 0.2rem 0.5rem;
    white-space: nowrap;
  }

  .estimateRows {
    border: 1px solid rgba(127, 127, 127, 0.22);
    border-radius: 0.65rem 0.65rem 0 0;
    overflow: hidden;
  }

  .estimateRow {
    align-items: center;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: minmax(0, 1fr) auto;
    padding: 0.7rem 0.8rem;
  }

  .estimateRow + .estimateRow {
    border-top: 1px solid rgba(127, 127, 127, 0.16);
  }

  .estimateRow strong,
  .estimateRow small {
    display: block;
  }

  .estimateRow strong {
    font-size: 0.88rem;
    font-weight: 600;
  }

  .estimateRow small {
    font-size: 0.76rem;
    line-height: 1.35;
    margin-top: 0.15rem;
    opacity: 0.66;
  }

  .estimateAmount {
    font-size: 0.92rem;
    font-variant-numeric: tabular-nums;
    font-weight: 650;
    white-space: nowrap;
  }

  .estimateTotal {
    align-items: center;
    background: rgba(127, 127, 127, 0.09);
    border: 1px solid rgba(127, 127, 127, 0.24);
    border-radius: 0 0 0.65rem 0.65rem;
    border-top: 0;
    display: flex;
    gap: 1rem;
    justify-content: space-between;
    padding: 0.78rem 0.8rem;
  }

  .estimateTotal small,
  .estimateTotal strong {
    display: block;
  }

  .estimateTotal small {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.035em;
    opacity: 0.66;
    text-transform: uppercase;
  }

  .estimateTotal strong {
    font-size: 1.35rem;
    font-variant-numeric: tabular-nums;
    line-height: 1.15;
    margin-top: 0.12rem;
  }

  .estimateTotal > span {
    font-size: 0.78rem;
    font-variant-numeric: tabular-nums;
    opacity: 0.72;
    text-align: right;
  }

  .estimateStatus {
    background: rgba(127, 127, 127, 0.07);
    border: 1px solid rgba(127, 127, 127, 0.2);
    border-radius: 0.65rem;
    line-height: 1.45;
    padding: 0.8rem;
  }

  .estimateFootnote {
    font-size: 0.73rem;
    line-height: 1.4;
    margin: 0.45rem 0 0;
    opacity: 0.58;
  }

  @media only screen and (max-width: 420px) {
    .estimateTotal {
      align-items: flex-start;
      flex-direction: column;
      gap: 0.35rem;
    }

    .estimateTotal > span {
      text-align: left;
    }
  }
`;
