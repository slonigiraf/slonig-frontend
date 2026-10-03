import { useState, useCallback, useEffect } from 'react';
import { keyring } from '@polkadot/ui-keyring';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/slonig-components';
import { useAccounts } from '@polkadot/react-hooks';

const ACCOUNT_PASSWORD = 'password';

export function useLogin() {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(null);
  const [defaultAccount, setDefaultAccount] = useState<string|undefined>(undefined);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [isLoginRequired, setLoginIsRequired] = useState<boolean>(false);
  const [isLoginReady, setIsLoginReady] = useState<boolean>(false);
  const [isLoggedIn, setIsLoggedIn] = useState<boolean>(false);
  const [isAddingAccount, setIsAddingAccount] = useState<boolean>(false);
  const { areAccountsLoaded } = useAccounts();

  const setLoggedOut = useCallback(() => {
    setCurrentPair(null);
    setAccountState(null);
    setIsLoggedIn(false);
    setLoginIsRequired(true);
  }, []);

  const setPairState = useCallback((pair: KeyringPair) => {
    setCurrentPair(pair);

    if (pair.meta) {
      const meta = pair.meta || {};
      const isExternal = (meta.isExternal as boolean) || false;
      const isHardware = (meta.isHardware as boolean) || false;
      const isInjected = (meta.isInjected as boolean) || false;

      setAccountState({ isExternal, isHardware, isInjected });
    } else {
      setAccountState(null);
    }
  }, []);

  const activatePair = useCallback((pair: KeyringPair): boolean => {
    setPairState(pair);

    const isInjected = (pair.meta?.isInjected as boolean) || false;

    try {
      // Injected accounts are managed by the extension and do not need local decoding.
      // Local accounts use a fixed password by design in this application.
      if (pair.isLocked && !isInjected) {
        pair.decodePkcs8(ACCOUNT_PASSWORD);
      }

      // This also handles a pair that was already unlocked before LoginProvider mounted.
      if (!pair.isLocked || isInjected) {
        setLoginIsRequired(false);
        setIsLoggedIn(true);

        return true;
      }
    } catch (error) {
      console.error('Failed to restore the selected account', error);
    }

    setIsLoggedIn(false);
    setLoginIsRequired(true);

    return false;
  }, [setPairState]);

  useEffect(() => {
    // areAccountsLoaded is emitted only after the API has initialized the keyring.
    // Waiting for it prevents treating an as-yet-unloaded keyring as "no account".
    if (!areAccountsLoaded) {
      return;
    }

    let isCancelled = false;

    const initializeLogin = async () => {
      try {
        const pairs = keyring.getPairs();
        let accountInDB: string | undefined;

        try {
          accountInDB = await getSetting(SettingKey.ACCOUNT);
        } catch (error) {
          // The keyring is the source of truth for whether a usable local account
          // exists. A settings read failure must not send that user to sign-up.
          console.error('Failed to read the persisted account', error);
        }

        if (isCancelled) {
          return;
        }

        let selectedPair: KeyringPair | undefined;

        if (accountInDB) {
          try {
            selectedPair = keyring.getPair(accountInDB);
          } catch (error) {
            // A stale persisted address should not strand an existing keyring account
            // on the create-account screen. Fall back to the first available pair.
            console.error('Persisted account is not available in the keyring', error);
            selectedPair = pairs[0];
          }
        } else {
          selectedPair = pairs[0];
        }

        if (selectedPair) {
          if (selectedPair.address !== accountInDB) {
            try {
              await storeSetting(SettingKey.ACCOUNT, selectedPair.address);
            } catch (error) {
              // Persistence failure should be visible in the console, but should not
              // make an otherwise usable local account appear logged out this session.
              console.error('Failed to persist the selected account', error);
            }
          }

          if (isCancelled) {
            return;
          }

          setDefaultAccount(selectedPair.address);
          activatePair(selectedPair);
        } else {
          setLoggedOut();
        }
      } catch (error) {
        console.error('Failed to initialize login state', error);
        setLoggedOut();
      } finally {
        if (!isCancelled) {
          // Ready now means account restoration has actually finished, rather than
          // merely that an arbitrary startup timer expired.
          setIsLoginReady(true);
        }
      }
    };

    void initializeLogin();

    return () => {
      isCancelled = true;
    };
  }, [activatePair, areAccountsLoaded, setLoggedOut]);

  const _onChangeAccount = useCallback(
    async (accountId: string | null) => {
      if (!accountId || accountId === currentPair?.address) {
        return;
      }

      try {
        const accountInDB = await getSetting(SettingKey.ACCOUNT);
        const newPair = keyring.getPair(accountId);

        if (accountId !== accountInDB) {
          newPair.lock();
          setIsLoggedIn(false);
          await storeSetting(SettingKey.ACCOUNT, newPair.address);
        }

        setDefaultAccount(newPair.address);
        activatePair(newPair);
        setIsLoginReady(true);
      } catch (error) {
        console.error('Failed to change the selected account', error);
        setIsLoggedIn(false);
        setLoginIsRequired(true);
        setIsLoginReady(true);
      }
    },
    [activatePair, currentPair?.address]
  );

  const _onUnlock = useCallback(
    async () => {
      try {
        const accountInDB = await getSetting(SettingKey.ACCOUNT);

        if (!accountInDB) {
          setLoggedOut();
          setIsLoginReady(true);
          return;
        }

        const newPair = keyring.getPair(accountInDB);

        setDefaultAccount(accountInDB);
        activatePair(newPair);
        setIsLoginReady(true);
      } catch (error) {
        console.error('Failed to unlock the selected account', error);
        setLoggedOut();
        setIsLoginReady(true);
      }
    },
    [activatePair, setLoggedOut]
  );

  return { defaultAccount, isLoginReady, currentPair, accountState, isLoggedIn, isLoginRequired, isAddingAccount, setIsLoggedIn, setLoginIsRequired, setIsAddingAccount, _onChangeAccount, _onUnlock, setDefaultAccount };
}
