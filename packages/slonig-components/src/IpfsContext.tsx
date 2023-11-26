// IpfsContext.tsx
import React, { useContext, createContext, ReactNode } from 'react';
import useIpfsFactory from './useIpfsFactory.js';

// Define an interface for your context state.
interface IIpfsContext {
  ipfs: any; // Replace 'any' with a more specific type if you know the structure of 'ipfs'
  isIpfsReady: boolean;
  ipfsInitError: Error | null;
}

// Initialize the context with a default value.
const IpfsContext = createContext<IIpfsContext | null>(null);

// Define an interface for the props of IpfsProvider
interface IpfsProviderProps {
  children: ReactNode;
}

export const IpfsProvider: React.FC<IpfsProviderProps> = ({ children }) => {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsFactory();

  return (
    <IpfsContext.Provider value={{ ipfs, isIpfsReady, ipfsInitError }}>
      {children}
    </IpfsContext.Provider>
  );
};

export function useIpfsContext() {
  const context = useContext(IpfsContext);
  if (!context) {
    throw new Error('useIpfsContext must be used within an IpfsProvider');
  }
  return context;
}