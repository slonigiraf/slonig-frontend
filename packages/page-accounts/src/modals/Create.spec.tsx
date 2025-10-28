// Copyright 2017-2023 @polkadot/page-accounts authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { fireEvent, screen } from '@testing-library/react';

import i18next from '@polkadot/react-components/i18n';
import { MemoryStore } from '@polkadot/test-support/keyring';
import { assertButtonDisabled, assertText, clickButton, fillInput } from '@polkadot/test-support/utils';
import { keyring } from '@polkadot/ui-keyring';
import { cryptoWaitReady } from '@polkadot/util-crypto';

import { AccountsPage } from '../../test/pages/accountsPage.js';

const spy = jest.spyOn(keyring, 'addUri');

const newAccountName = 'NEW ACCOUNT NAME';
const newAccountPassword = 'mySecretPassword';

describe('Create an account modal', () => {
  let accountsPage: AccountsPage;

  beforeAll(async () => {
    await cryptoWaitReady();
    await i18next.changeLanguage('en');

    if (keyring.getAccounts().length === 0) {
      keyring.loadAll({ isDevelopment: true, store: new MemoryStore() });
    }
  });
  beforeEach(() => {
    accountsPage = new AccountsPage();
  });

  // eslint-disable-next-line jest/expect-expect
  it('creates an account', async () => {
    assertButtonDisabled('Next');
    await fillFirstStep();
    await clickButton('Next');
    assertButtonDisabled('Next');
    fillSecondStep();
    await clickButton('Next');
    await clickButton('Save');
    expectCreateAnAccountCall();
  });

  // eslint-disable-next-line jest/expect-expect
  it('navigates through the modal flow with enter key', async () => {
    assertButtonDisabled('Next');
    pressEnterKey();
    await fillFirstStep();
    expectCreateAnAccountCall();
  });

  // eslint-disable-next-line jest/expect-expect
  it('gives an error message when entering invalid derivation path', async () => {

    const showAdvancedOptionsButton = await screen.findByText('Advanced creation options');

    fireEvent.click(showAdvancedOptionsButton);

    fillInput('secret derivation path', '//abc//');

    await assertText('Unable to match provided value to a secret URI');
  });
});

function fillSecondStep () {
  fillInput('name', newAccountName);
  fillInput('password', newAccountPassword);
  fillInput('password (repeat)', newAccountPassword);
}

async function fillFirstStep () {
  const checkbox = await screen.findByText('I have saved my mnemonic seed safely');

  fireEvent.click(checkbox);
}

function pressEnterKey () {
  fireEvent.keyDown(window, {
    code: 'Enter',
    key: 'Enter'
  });
}

function expectCreateAnAccountCall () {
  expect(spy).toHaveBeenCalledWith(
    expect.anything(),
    newAccountPassword,
    expect.objectContaining({
      name: newAccountName
    }),
    'sr25519'
  );
}
