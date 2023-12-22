// Copyright 2017-2023 @polkadot/apps authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ThemeDef } from '@polkadot/react-components/types';
import type { KeyringStore } from '@polkadot/ui-keyring/types';

import React, { Suspense, useEffect, useState, useCallback } from 'react';
import { HashRouter } from 'react-router-dom';
import { ThemeProvider } from 'styled-components';
import { useToggle } from '@polkadot/react-hooks';

import { ApiCtxRoot } from '@polkadot/react-api';
import { ApiStatsCtxRoot, BlockAuthorsCtxRoot, BlockEventsCtxRoot, KeyringCtxRoot, QueueCtxRoot, WindowSizeCtxRoot } from '@polkadot/react-hooks';
import { settings } from '@polkadot/ui-settings';
import { InputAddress } from '@polkadot/react-components';
import Apps from './Apps.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import type { AccountState } from '@slonigiraf/app-slonig-components';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import Unlock from '@polkadot/app-signing/Unlock';

interface Props {
  isElectron: boolean;
  store?: KeyringStore;
}

function createTheme({ uiTheme }: { uiTheme: string }): ThemeDef {
  const theme = uiTheme === 'dark'
    ? 'dark'
    : 'light';

  document?.documentElement?.setAttribute('data-theme', theme);

  return { theme };
}

function Root({ isElectron, store }: Props): React.ReactElement<Props> {
  const [theme, setTheme] = useState(() => createTheme(settings));

  // Begin: Login system
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => null);
  const [accountState, setAccountState] = useState<AccountState | null>();
  const [isUnlockOpen, toggleUnlock] = useToggle();

  const _onChangeAccount = useCallback(
    async (accountId: string | null) => {
      if (accountId) {
        const accountInDB = await getSetting('account');
        const newPair = keyring.getPair(accountId);
        if (accountId !== accountInDB) {
          newPair.lock();
          storeSetting('account', newPair.address);
          storeSetting('password', '');
        }
        setCurrentPair(newPair);
        setAccountState(null);
      }
    },
    []//setCurrentPair, setAccountState
  );
  const _onUnlock = useCallback(
    (): void => {
      toggleUnlock();
    },
    [toggleUnlock]
  );

  useEffect((): void => {
    if (currentPair && currentPair.meta) {
      const meta = (currentPair && currentPair.meta) || {};
      const isExternal = (meta.isExternal as boolean) || false;
      const isHardware = (meta.isHardware as boolean) || false;
      const isInjected = (meta.isInjected as boolean) || false;
      setAccountState({ isExternal, isHardware, isInjected });
    }
  }, [currentPair]);
  useEffect(() => {
    const login = async () => {
      // Check if currentPair exists and is locked
      if (currentPair && currentPair.isLocked && accountState) {
        if (!accountState.isInjected) {
          const account: string | undefined = await getSetting('account');
          if (currentPair.address === account) {
            const password: string | undefined = await getSetting('password');
            try {
              currentPair.decodePkcs8(password);
            } catch {
              toggleUnlock();
            }
          } else {
            toggleUnlock();
          }
        }
      }
    };
    login();
  }, [currentPair, accountState]);

  const hiddenKeyringInitializer = <div className='ui--row' style={{ display: 'none' }}>
    <InputAddress
      className='full'
      isInput={false}
      label={'account'}
      onChange={_onChangeAccount}
      type='account'
    />
  </div>;
  // END: Login system

  useEffect((): void => {
    settings.on('change', (settings) => setTheme(createTheme(settings)));
  }, []);

  // The ordering here is critical. It defines the hierarchy of dependencies,
  // i.e. Block* depends on Api. Certainly no cross-deps allowed
  return (
    <Suspense fallback='...'>
      <ThemeProvider theme={theme}>
        <QueueCtxRoot>
          <ApiCtxRoot
            apiUrl={settings.apiUrl}
            isElectron={isElectron}
            store={store}
          >
            <KeyringCtxRoot>
              <ApiStatsCtxRoot>
                <BlockAuthorsCtxRoot>
                  <BlockEventsCtxRoot>
                    <HashRouter>
                      <WindowSizeCtxRoot>
                        {/* BEGIN: Login actions */}
                        {hiddenKeyringInitializer}
                        {isUnlockOpen && (
                          <Unlock
                            onClose={toggleUnlock}
                            onUnlock={_onUnlock}
                            pair={currentPair}
                          />
                        )}
                        {/* END: Login actions */}
                        <Apps />
                      </WindowSizeCtxRoot>
                    </HashRouter>
                  </BlockEventsCtxRoot>
                </BlockAuthorsCtxRoot>
              </ApiStatsCtxRoot>
            </KeyringCtxRoot>
          </ApiCtxRoot>
        </QueueCtxRoot>
      </ThemeProvider>
    </Suspense>
  );
}

export default React.memo(Root);
