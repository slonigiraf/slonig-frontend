// useLogin.ts
import { useState, useCallback, useEffect } from 'react';
import { keyring } from '@polkadot/ui-keyring';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/app-slonig-components';

export function useLogin() {
    const [currentPair, setCurrentPair] = useState<KeyringPair | null>(null);
    const [accountState, setAccountState] = useState<AccountState | null>(null);
    const [isUnlockOpen, setUnlockOpen] = useState(false);

    console.log("---- useLogin run ----");
    console.log("useLogin, isUnlockOpen:", isUnlockOpen);

    const attemptUnlock = async (pair: KeyringPair) => {
        console.log("attemptUnlock");
        const password = await getSetting('password');
        console.log("attemptUnlock, password:", password);
        if (password) {
            try {
                pair.decodePkcs8(password);
            } catch {
                setUnlockOpen(true);
            }
        } else {
            setUnlockOpen(true);
        }
    };

    const _onChangeAccount = useCallback(
        async (accountId: string | null) => {
            console.log("_onChangeAccount, accountId", accountId);
            if (accountId && accountId !== currentPair?.address) {
                const accountInDB = await getSetting('account');
                try {
                    console.log("_onChangeAccount, try block enter");
                    const newPair = keyring.getPair(accountId);
                    console.log("_onChangeAccount, newPair", newPair);
                    if (accountId !== accountInDB) {
                        console.log("_onChangeAccount, start locking");
                        newPair.lock();
                        console.log("_onChangeAccount, locked");
                        storeSetting('account', newPair.address);
                        storeSetting('password', '');
                        console.log("_onChangeAccount, db with new account and empty pass updated");
                    }
                    setCurrentPair(newPair);
                    //----
                    if (newPair && newPair.meta) {
                        const meta = (newPair && newPair.meta) || {};
                        const isExternal = (meta.isExternal as boolean) || false;
                        const isHardware = (meta.isHardware as boolean) || false;
                        const isInjected = (meta.isInjected as boolean) || false;
                        if (newPair.isLocked && !isInjected) {
                            await attemptUnlock(newPair);
                        }
                        setAccountState({ isExternal, isHardware, isInjected });
                    } else{
                        setAccountState(null);
                    }
                } catch (e) {
                    const error = (e as Error).message;
                    console.error(error)
                }
            }
        },
        [keyring]
    );

    const _onUnlock = useCallback((): void => {
        setUnlockOpen(false);
    }, []);

    return { currentPair, accountState, isUnlockOpen, _onChangeAccount, _onUnlock, setUnlockOpen };
}