// IpfsContext.tsx
import React, { useContext } from 'react';
import useIpfsFactory from './useIpfsFactory';

const IpfsContext = React.createContext();

export function IpfsProvider({ children }) {
  const { ipfs, isIpfsReady, ipfsInitError } = useIpfsFactory();

  return (
    <IpfsContext.Provider value={{ ipfs, isIpfsReady, ipfsInitError }}>
      {children}
    </IpfsContext.Provider>
  );
}

export function useIpfsContext() {
  const context = useContext(IpfsContext);
  if (!context) {
    throw new Error('useIpfs must be used within an IpfsProvider');
  }
  return context;
}