// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';

const ExerciseItemContainer = styled.li`
  position: relative;
`;

const ExerciseHeading = styled.div`
  align-items: flex-start;
  display: flex;
  gap: 0.75rem;
  justify-content: space-between;

  > p {
    flex: 1;
    min-width: 0;
  }
`;

const ExerciseEditForm = styled.div`
  box-sizing: border-box;
  display: grid;
  gap: 1rem;
  margin: 0 auto;
  max-width: 48rem;
  padding: 0.25rem 0;
  width: 100%;

  > label {
    color: var(--color-text);
    display: grid;
    font-weight: 600;
    gap: 0.4rem;
    margin: 0;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  > label > span {
    line-height: 1.25;
    text-transform: none;
  }

  input, textarea {
    background: var(--bg-input, #fff);
    border: 1px solid var(--border-table, #cfd5e1);
    border-radius: 0.45rem;
    box-sizing: border-box;
    color: var(--color-text);
    font: inherit;
    font-weight: 400;
    line-height: 1.45;
    margin: 0;
    outline: none;
    padding: 0.65rem 0.75rem;
    text-align: left;
    text-transform: none;
    width: 100%;
  }

  input {
    min-height: 2.75rem;
  }

  textarea {
    min-height: 5.5rem;
    resize: vertical;
  }

  input:focus, textarea:focus {
    border-color: var(--color-primary, #1682d4);
    box-shadow: 0 0 0 2px rgba(22, 130, 212, 0.12);
  }

  input:disabled, textarea:disabled {
    cursor: not-allowed;
    opacity: 0.65;
  }

  .exerciseEditActions {
    align-items: center;
    display: flex;
    gap: 0.65rem;
    justify-content: flex-end;
    padding-top: 0.25rem;
  }

  @media only screen and (max-width: 600px) {
    gap: 0.8rem;

    .exerciseEditActions {
      flex-wrap: wrap;
    }
  }
`;

export { ExerciseEditForm, ExerciseHeading, ExerciseItemContainer };
