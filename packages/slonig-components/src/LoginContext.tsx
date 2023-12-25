// IpfsContext.tsx
import React, { useContext, createContext, ReactNode } from 'react';
import { useLogin } from './useLogin.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/app-slonig-components';
import Unlock from '@polkadot/app-signing/Unlock';
import { InputAddress } from '@polkadot/react-components';

// Define an interface for your context state.
interface ILoginContext {
  currentPair: KeyringPair | null;
  accountState: AccountState | null;
  isLoginRequired: boolean;
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
    isLoginRequired,
    _onChangeAccount,
    _onUnlock
  } = useLogin();

  return (
    <LoginContext.Provider value={{ currentPair, accountState, isLoginRequired, _onChangeAccount }}>
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          isInput={false}
          label={'account'}
          type='account'
          onChange={_onChangeAccount}
        />
      </div>
      {isLoginRequired && (
        <Unlock
          onClose={() => {}}
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