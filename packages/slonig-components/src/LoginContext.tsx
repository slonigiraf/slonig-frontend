// IpfsContext.tsx
import React, { useContext, createContext, ReactNode } from 'react';
import { useLogin } from './useLogin.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/app-slonig-components';
import Unlock from '@polkadot/app-signing/Unlock';

// Define an interface for your context state.
interface ILoginContext {
  currentPair: KeyringPair | null;
  accountState: AccountState | null;
  isUnlockOpen: boolean;
  _onChangeAccount: (accountId: string | null) => void;
}

// Initialize the context with a default value.
const LoginContext = createContext<ILoginContext | null>(null);

// Define an interface for the props of IpfsProvider
interface LoginProviderProps {
  children: ReactNode;
}

export const LoginProvider: React.FC<LoginProviderProps> = ({ children }) => {
  const {
    currentPair,
    accountState,
    isUnlockOpen,
    _onChangeAccount,
    _onUnlock,
    setUnlockOpen
  } = useLogin();

  return (
    <LoginContext.Provider value={{ currentPair, accountState, isUnlockOpen, _onChangeAccount }}>
      {isUnlockOpen && (
        <Unlock
          onClose={setUnlockOpen(false)}
          onUnlock={_onUnlock}
          pair={currentPair}
        />
      )}
      {children}
    </LoginContext.Provider>
  );
};

export function useLoginContext() {
  const context = useContext(LoginContext);
  if (!context) {
    throw new Error('useLoginContext must be used within an LoginProvider');
  }
  return context;
}