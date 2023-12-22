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
    const [isUnlockOpen, setUnlockOpen] = useState(false);

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
        setUnlockOpen(false);
    }, []);

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
        const attemptUnlock = async (pair: KeyringPair) => {
            const password = await getSetting('password');
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

        const initializeAccount = async () => {
            let account = await getSetting('account');
            console.log("account", account)
            try {
                if (!account && keyring.getPairs().length > 0) {
                    const defaultPair = keyring.getPairs()[0];
                    account = defaultPair.address;
                    await storeSetting('account', account);
                    setCurrentPair(defaultPair);
                }
            }
            catch (e) {
                const error = (e as Error).message;
                console.error(error)
            }
            return account;
        };

        const login = async () => {
            const account = await initializeAccount();

            if (account) {
                _onChangeAccount(account);

                if (currentPair && currentPair.isLocked && !accountState?.isInjected && currentPair.address === account) {
                    await attemptUnlock(currentPair);
                }
            }
        };

        login();
    }, [currentPair, accountState]);


    return { currentPair, accountState, isUnlockOpen, _onChangeAccount, _onUnlock, setUnlockOpen };
}