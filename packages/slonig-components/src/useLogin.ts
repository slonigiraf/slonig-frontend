import { useState, useCallback } from 'react';
import { keyring } from '@polkadot/ui-keyring';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/app-slonig-components';
import { arrayBufferToBase64, base64ToArrayBuffer, decryptData, getKey } from '@slonigiraf/app-slonig-components';

export function useLogin() {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(null);
  const [accountState, setAccountState] = useState<AccountState | null>(null);
  const [isLoginRequired, setLoginIsRequired] = useState<boolean>(true);
  const [isReady, setIsReady] = useState<boolean>(false);

  const attemptUnlock = async (pair: KeyringPair) => {
    const encryptedPasswordB64 = await getSetting('password');
    const ivB64 = await getSetting('iv');
    if (encryptedPasswordB64 && ivB64) {
      const key = await getKey();
      try {
        const password = await decryptData(key, encryptedPasswordB64, ivB64);
        pair.decodePkcs8(password);
        if (!pair.isLocked) {
          setLoginIsRequired(false);
          setIsReady(true);
        }
      } catch {
        setLoginIsRequired(true);
        setIsReady(true);
      }
    } else {
      setLoginIsRequired(true);
      setIsReady(true);
    }
  };

  const _onChangeAccount = useCallback(
    async (accountId: string | null) => {
      if (accountId && accountId !== currentPair?.address) {
        const accountInDB = await getSetting('account');
        try {
          const newPair = keyring.getPair(accountId);
          if (accountId !== accountInDB) {
            newPair.lock();
            storeSetting('account', newPair.address);
            storeSetting('password', '');
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

  const _onUnlock = useCallback((): void => {
    setLoginIsRequired(false);
  }, []);

  return { isReady, currentPair, accountState, isLoginRequired, _onChangeAccount, _onUnlock };
}