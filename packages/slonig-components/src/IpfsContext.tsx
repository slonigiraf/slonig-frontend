import React, { useContext, createContext, ReactNode } from 'react';
import useIpfsFactory from './useIpfsFactory.js';
import { IPFSHTTPClient } from 'kubo-rpc-client';

interface IIpfsContext {
  ipfs: IPFSHTTPClient | null;
  isIpfsReady: boolean;
  ipfsInitError: Error | null;
}

const IpfsContext = createContext<IIpfsContext | null>(null);

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

export function useIpfsContext(): IIpfsContext {
  const context = useContext(IpfsContext);
  if (!context) {
    throw new Error('useIpfsContext must be used within an IpfsProvider');
  }
  return context;
}