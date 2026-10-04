// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { styled } from '@polkadot/react-components';

export const UploadLayout = styled.section`
  margin: 1.5rem auto 2rem;
  max-width: 90rem;

  .bookToolbar {
    margin-bottom: 0.75rem;
  }

  .bookToolbarPrimary {
    align-items: center;
    display: grid;
    gap: 0.5rem;
    grid-template-columns: auto minmax(0, 1fr) auto;
  }

  .bookToolbarPrimary .ui--Button {
    margin: 0;
  }

  .bookSelect.ui--Dropdown { min-width: 0; overflow: visible; }
  .bookSelect.ui--Dropdown .ui.selection.dropdown { box-sizing: border-box; min-width: 0 !important; width: 100%; }
  .bookSelect.ui--Dropdown .ui.selection.dropdown > .text {
    display: block !important;
    max-width: 100%;
    min-width: 0;
    overflow: hidden !important;
    text-overflow: ellipsis;
    white-space: nowrap !important;
  }

  .batchModelSelect {
    margin: 1rem 0;
  }

  .fileInput {
    display: none;
  }

  .errorMessage {
    color: #9f3a38;
    margin: 0.75rem 0 0;
  }

  @media only screen and (max-width: 700px) {
    .bookToolbarPrimary {
      gap: 0.35rem;
    }

    .bookToolbarPrimary .ui--Button {
      min-width: 0;
    }
  }
`;
