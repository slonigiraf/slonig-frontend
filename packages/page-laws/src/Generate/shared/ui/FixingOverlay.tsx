// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { styled } from '@polkadot/react-components';

/** Covers only the item currently being repaired, without hiding its contents. */
export default function FixingOverlay (): React.ReactElement {
  return <Overlay aria-label='Fixing with AI' role='status'>
    <span aria-hidden='true' className='fixingSpinner' />
    <span className='visuallyHidden'>Fixing with AI…</span>
  </Overlay>;
}

const Overlay = styled.div`
  align-items: center;
  background: rgba(24, 30, 42, 0.38);
  border-radius: inherit;
  display: flex;
  inset: 0;
  justify-content: center;
  position: absolute;
  z-index: 5;

  .fixingSpinner {
    animation: fixingOverlaySpin 0.8s linear infinite;
    background: var(--bg-input, #fff);
    border: 4px solid var(--border-table, #ccd2df);
    border-radius: 50%;
    border-top-color: var(--color-primary, #1682d4);
    box-shadow: 0 0 0 7px var(--bg-input, #fff), 0 2px 12px rgba(0, 0, 0, 0.25);
    height: 2.5rem;
    width: 2.5rem;
  }

  .visuallyHidden {
    clip-path: inset(50%);
    height: 1px;
    overflow: hidden;
    position: absolute;
    white-space: nowrap;
    width: 1px;
  }

  @keyframes fixingOverlaySpin {
    to { transform: rotate(360deg); }
  }

  @media (prefers-reduced-motion: reduce) {
    .fixingSpinner { animation-duration: 2s; }
  }
`;
