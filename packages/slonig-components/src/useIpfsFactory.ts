import { useEffect, useState, useCallback } from 'react';
import { create, IPFSHTTPClient } from 'kubo-rpc-client';

export default function useIpfsFactory() {
  const [ipfs, setIpfs] = useState<IPFSHTTPClient | null>(null);
  const [isIpfsReady, setIpfsReady] = useState(false);
  const [ipfsInitError, setIpfsInitError] = useState<Error | null>(null);

  const startIpfs = useCallback(async () => {
    if (ipfs) {
      console.log('IPFS already started');
      setIpfsReady(true);
    } else if (window.ipfs?.enable) {
      console.log('Found window.ipfs');
      const enabledIpfs = await window.ipfs.enable({ commands: ['id'] });
      setIpfs(enabledIpfs);
      setIpfsReady(true);
    } else {
      try {
        console.time('IPFS Started');
        const newIpfs = await create({ url: `https://${process.env.IPFS_SERVER}/api/v0` });
        setIpfs(newIpfs);
        setIpfsReady(true);
        console.timeEnd('IPFS Started');
      } catch (error) {
        console.error('IPFS init error:', error);
        setIpfsInitError(error as Error);
        setIpfsReady(false);
        setIpfs(null);
      }
    }
  }, [ipfs]);

  useEffect(() => {
    startIpfs();

    return () => {
      if (ipfs && ipfs.stop) {
        console.log('Stopping IPFS');
        ipfs.stop().catch((err: unknown) => console.error(err));
        setIpfs(null);
        setIpfsReady(false);
      }
    };
  }, [startIpfs, ipfs]);

  // Attempt to reconnect if ipfs becomes null
  useEffect(() => {
    if (!ipfs && !isIpfsReady) {
      console.log('Reinitializing IPFS connection');
      startIpfs();
    }
  }, [isIpfsReady, startIpfs]);

  return { ipfs, isIpfsReady, ipfsInitError };
}