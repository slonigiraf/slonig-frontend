// IpfsContext.tsx
import React, { useContext, createContext, ReactNode, useState, useEffect } from 'react';
import { useLogin } from './useLogin.js';
import type { KeyringPair } from '@polkadot/keyring/types';
import type { AccountState } from '@slonigiraf/slonig-components';
import { InputAddress } from '@polkadot/react-components';
import CreateAccountModal from '@polkadot/app-accounts/modals/CreateAccountModal';
import { useAccounts } from '@polkadot/react-hooks';
import type { ActionStatus } from '@polkadot/react-components/Status/types';

// Define an interface for your context state.
interface ILoginContext {
  currentPair: KeyringPair | null;
  isLoginReady: boolean;
  accountState: AccountState | null;
  isLoggedIn: boolean;
  isAddingAccount: boolean;
  setIsLoggedIn: (v: boolean) => void;
  setIsAddingAccount: (v: boolean) => void;
  isLoginRequired: boolean;
  setLoginIsRequired: (v: boolean) => void;
  _onChangeAccount: (accountId: string | null) => void;
  setDefaultAccount: (accountId: string) => void;
  onCreateAccount: (status: ActionStatus) => void;
}

// Initialize the context with a default value.
const LoginContext = createContext<ILoginContext | null>(null);

// Define an interface for the props of IpfsProvider
interface LoginProviderProps {
  children: ReactNode;
}

export const LoginProvider: React.FC<LoginProviderProps> = ({ children }) => {
  const { hasAccounts } = useAccounts();
  const [isSignIn, setIsSignIn] = useState(false);

  const {
    defaultAccount,
    isLoginReady,
    currentPair,
    accountState,
    isLoggedIn,
    isAddingAccount,
    setIsLoggedIn,
    isLoginRequired,
    setLoginIsRequired,
    setIsAddingAccount,
    _onChangeAccount,
    _onUnlock,
    setDefaultAccount,
  } = useLogin();

  useEffect(() => {
    if (hasAccounts) {
      setIsSignIn(true);
    }
  }, [hasAccounts]);

  const cancelAddingAnAccount = () => {
    setIsAddingAccount(false);
  }

  const onCreateAccount = (status: ActionStatus) => {
    if (status.status === 'success' && status.account) {
      _onUnlock();
    }
    setIsAddingAccount(false);
  }

  return (
    <LoginContext.Provider value={{
      currentPair, isLoginReady, accountState, isAddingAccount, isLoggedIn,
      setIsLoggedIn, isLoginRequired, setLoginIsRequired, _onChangeAccount, setIsAddingAccount, setDefaultAccount, onCreateAccount
    }}>
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          key={defaultAccount ? defaultAccount : 'login-account-selector'}
          className='full'
          isInput={false}
          label={'account'}
          type='account'
          onChange={_onChangeAccount}
          value={defaultAccount}
        />
      </div>

      {isLoginReady && isAddingAccount && (
        <CreateAccountModal
          onClose={cancelAddingAnAccount}
          onStatusChange={onCreateAccount}
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