import { IPFSHTTPClient } from 'kubo-rpc-client';

declare global {
  interface Window {
    ipfs?: IPFSHTTPClient;
  }
}