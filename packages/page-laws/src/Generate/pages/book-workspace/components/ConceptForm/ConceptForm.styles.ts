// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';

const ConceptFormContainer = styled.div`
  box-sizing: border-box;
  display: grid;
  gap: 1rem;
  margin: 0 auto;
  max-width: 42rem;
  padding: 0.25rem 0;
  width: 100%;

  > .ui--Labelled,
  > .ui--Dropdown,
  > label {
    margin: 0;
    width: 100%;
  }

  > label {
    color: var(--color-text);
    display: grid;
    font-weight: 600;
    gap: 0.4rem;
    text-align: left;
    text-transform: none;
  }

  > label > span {
    line-height: 1.25;
    text-transform: none;
  }

  textarea {
    background: var(--bg-input, #fff);
    border: 1px solid var(--border-table, #cfd5e1);
    border-radius: 0.45rem;
    box-sizing: border-box;
    color: var(--color-text);
    font: inherit;
    font-weight: 400;
    line-height: 1.45;
    margin: 0;
    min-height: 6.5rem;
    outline: none;
    padding: 0.65rem 0.75rem;
    resize: vertical;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  textarea:focus {
    border-color: var(--color-primary, #1682d4);
    box-shadow: 0 0 0 2px rgba(22, 130, 212, 0.12);
  }

  textarea:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  @media only screen and (max-width: 600px) {
    gap: 0.8rem;
  }
`;

export { ConceptFormContainer };
