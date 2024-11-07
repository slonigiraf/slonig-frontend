import { useEffect, useState } from 'react';
import { create, IPFSHTTPClient } from 'kubo-rpc-client';

let ipfs: IPFSHTTPClient | null = null;

export default function useIpfsFactory() {
  const [isIpfsReady, setIpfsReady] = useState(Boolean(ipfs));
  const [ipfsInitError, setIpfsInitError] = useState<Error | null>(null);

  useEffect(() => {
    async function initIpfs() {
      if (ipfs) {
        console.log('IPFS already started');
        setIpfsReady(true);
      } else if (window.ipfs?.enable) {
        console.log('Found window.ipfs');
        ipfs = await window.ipfs.enable({ commands: ['id'] });
        setIpfsReady(Boolean(ipfs));
      } else {
        try {
          console.time('IPFS Started');
          ipfs = await create({ url: `https://${process.env.IPFS_SERVER}/api/v0` });
          setIpfsReady(true);
          console.timeEnd('IPFS Started');
        } catch (error) {
          console.error('IPFS init error:', error);
          setIpfsInitError(error as Error);
        }
      }
    }

    initIpfs();

    return () => {
      if (ipfs && ipfs.stop) {
        console.log('Stopping IPFS');
        ipfs.stop().catch(err => console.error(err));
        ipfs = null;
        setIpfsReady(false);
      }
    };
  }, []);

  return { ipfs, isIpfsReady, ipfsInitError };
}