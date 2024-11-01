import { useState, useCallback, useEffect } from 'react';
import { keyring } from '@polkadot/ui-keyring';
import { getSetting, storeSetting } from '@slonigiraf/db';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/app-slonig-components';
import { SettingKey } from '@slonigiraf/app-slonig-components';
import { useApi } from '@polkadot/react-hooks';

export function useLogin() {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(null);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [isLoginRequired, setLoginIsRequired] = useState<boolean>(false);
  const [isReady, setIsReady] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isAddingAccount, setIsAddingAccount] = useState<boolean>(false);
  const [hasError, setHasError] = useState(true);
  const { isApiConnected } = useApi();

  const testKeyringState = async () => {
    try {
      await keyring.getPairs();
      setHasError(false);
      setTimeout(() => setIsReady(true), 1000);// In case no local account exist
    } catch (error) {
      setHasError(true);
      setTimeout(testKeyringState, 100);
    }
  };

  useEffect(() => {
    if (isApiConnected) {
      setTimeout(testKeyringState, 100);
    }
  }, [isApiConnected]);

  const attemptUnlock = async (pair: KeyringPair) => {
    try {
      // Intentionally dont use passwords
      const password = '';
      pair.decodePkcs8(password);
      if (!pair.isLocked) {
        setLoginIsRequired(false);
        setIsLoggedIn(true);
        setIsReady(true);
      }
    } catch {
      setIsReady(true);
    }
  };

  const _onChangeAccount = useCallback(
    async (accountId: string | null) => {
      if (accountId && accountId !== currentPair?.address) {
        const accountInDB = await getSetting(SettingKey.ACCOUNT);
        try {
          const newPair = keyring.getPair(accountId);
          if (accountId !== accountInDB) {
            newPair.lock();
            setIsLoggedIn(false);
            storeSetting(SettingKey.ACCOUNT, newPair.address);
          }
          setCurrentPair(newPair);
          if (newPair && newPair.meta) {
            const meta = (newPair && newPair.meta) || {};
            const isExternal = (meta.isExternal as boolean) || false;
            const isHardware = (meta.isHardware as boolean) || false;
            const isInjected = (meta.isInjected as boolean) || false;
            if (newPair.isLocked && !isInjected) {
              await attemptUnlock(newPair);
            }
            setAccountState({ isExternal, isHardware, isInjected });
          } else {
            setAccountState(null);
          }
        } catch (e) {
          const error = (e as Error).message;
          console.error(error);
        }
      }
    },
    [keyring]
  );

  const _onUnlock = useCallback(
    async () => {
      const accountInDB = await getSetting(SettingKey.ACCOUNT);
      if (accountInDB) {
        const newPair = keyring.getPair(accountInDB);
        setCurrentPair(newPair);
        if (newPair && newPair.meta) {
          const meta = (newPair && newPair.meta) || {};
          const isExternal = (meta.isExternal as boolean) || false;
          const isHardware = (meta.isHardware as boolean) || false;
          const isInjected = (meta.isInjected as boolean) || false;
          if (newPair.isLocked && !isInjected) {
            await attemptUnlock(newPair);
          }
          setAccountState({ isExternal, isHardware, isInjected });
        } else {
          setAccountState(null);
        }
      }
    },
    [keyring]
  );

  return { isReady, currentPair, accountState, isLoggedIn, isLoginRequired, isAddingAccount, setIsLoggedIn, setLoginIsRequired, setIsAddingAccount, _onChangeAccount, _onUnlock };
}