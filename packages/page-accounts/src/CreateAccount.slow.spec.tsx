// Copyright 2017-2023 @polkadot/app-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import '@polkadot/react-components/i18n';

import { fireEvent, render, waitForElementToBeRemoved } from '@testing-library/react';
import React from 'react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';

import AccountsApp from '@polkadot/app-accounts';
import { ApiCtxRoot } from '@polkadot/react-api';
import { lightTheme } from '@polkadot/react-components';
import { MemoryStore } from '@polkadot/test-support/keyring';
import { WaitForApi } from '@polkadot/test-support/react';
import { SUBSTRATE_PORT } from '@polkadot/test-support/substrate';

function noop (): void {
  // do nothing
}

const renderAccounts = () => {
  const memoryStore = new MemoryStore();

  return render(
    <MemoryRouter>
      <ThemeProvider theme={lightTheme}>
        <ApiCtxRoot
          apiUrl={`ws://127.0.0.1:${SUBSTRATE_PORT}`}
          isElectron={false}
          store={memoryStore}
        >
          <WaitForApi>
            <div>
              <AccountsApp
                basePath='/accounts'
                onStatusChange={noop}
              />
            </div>
          </WaitForApi>
        </ApiCtxRoot>
      </ThemeProvider>
    </MemoryRouter>
  );
};

  it('gives an error message when entering invalid derivation path', async () => {
    const { findByTestId, findByText } = renderAccounts();

    const addAccountButton = await findByText('Add account', {});

    fireEvent.click(addAccountButton);

    const derivationPathInput = await findByTestId('secret derivation path', {});

    fireEvent.change(derivationPathInput, { target: { value: '//abc//' } });

    const errorMsg = await findByText('Unable to match provided value to a secret URI', {});

    expect(errorMsg).toBeTruthy();
  });
});
