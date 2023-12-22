// useLogin.ts
import { useState, useCallback, useEffect } from 'react';
import { keyring } from '@polkadot/ui-keyring';
import { useToggle } from '@polkadot/react-hooks';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/app-slonig-components';

export function useLogin() {
    const [currentPair, setCurrentPair] = useState<KeyringPair | null>(null);
    const [accountState, setAccountState] = useState<AccountState | null>(null);
    const [isUnlockOpen, toggleUnlock] = useToggle();
    console.log("useLoging, currentPair", currentPair?.address)

    const _onChangeAccount = useCallback(
        async (accountId: string | null) => {
            if (accountId) {
                const accountInDB = await getSetting('account');
                try {
                    const newPair = keyring.getPair(accountId);
                    if (accountId !== accountInDB) {
                        newPair.lock();
                        storeSetting('account', newPair.address);
                        storeSetting('password', '');
                    }
                    setCurrentPair(newPair);
                    setAccountState(null);
                } catch (e) {
                    const error = (e as Error).message;
                    console.error(error)
                }
            }
        },
        []
    );

    const _onUnlock = useCallback((): void => {
        toggleUnlock();
    }, [toggleUnlock]);

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
            const account: string | undefined = await getSetting('account');
            if (currentPair && currentPair.isLocked && accountState) {
                if (!accountState.isInjected) {
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
            } else {
                account && _onChangeAccount(account);
            }
        };
        login();
    }, [currentPair, accountState]);

    return { currentPair, accountState, isUnlockOpen, _onChangeAccount, _onUnlock, toggleUnlock };
}