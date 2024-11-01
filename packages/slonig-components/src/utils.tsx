import { IPFSHTTPClient, CID, DAGGetResult } from 'kubo-rpc-client'
import crypto from 'crypto';
import { getAddressName } from '@polkadot/react-components';
import type { KeyringPair } from '@polkadot/keyring/types';
import { getSetting, storeSetting, SettingKey } from '@slonigiraf/db';
import Peer from 'peerjs';
import { formatBalance } from '@polkadot/util';
import BN from 'bn.js';

// export const tokenSymbol = formatBalance(balance, { withUnit: false });

export const getBaseUrl = () => {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
};

export const balanceToSlonString = (balance: BN): string => {
  const numberWith4Decimals = formatBalance(balance, { withUnit: false });
  const number = parseFloat(numberWith4Decimals);
  return number.toFixed(0);
}

// ------
export const CODEC = 0x71;
// 1 is v1, 113 is 0x71, 18 is 0x12 the multihash code for sha2-256, 32 is length of digest
const prefix = new Uint8Array([1, 113, 18, 32]);
// ------
// A helper wrapper to get IPFS CID from a text
export async function getIPFSContentID(ipfs: IPFSHTTPClient, content: string) {
  const cid = await ipfs.dag.put(content, { storeCodec: 'dag-cbor', hashAlg: 'sha2-256' });
  return cid.toString();
}
export async function getIPFSContentIDAndPinIt(ipfs: IPFSHTTPClient, content: string) {
  const cid = await ipfs.dag.put(content, { storeCodec: 'dag-cbor', hashAlg: 'sha2-256' });
  await ipfs.pin.add(cid);
  return cid.toString();
}

// Define a generic function to add timeout capability
function timeout<T>(ms: number, promise: Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`Timeout after ${ms} ms`));
    }, ms);
    promise.then(
      (res) => {
        clearTimeout(timeoutId);
        resolve(res);
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      }
    );
  });
}

async function tryToGetIPFSDataFromContentID(ipfs: IPFSHTTPClient, cidStr: string): Promise<string | null> {
  const cid = CID.parse(cidStr);
  const result = await timeout<DAGGetResult>(3000, ipfs.dag.get(cid));
  // Use type assertion if necessary
  if (typeof result.value === 'string') {
    return result.value;
  } else if (result.value && typeof (result.value as any).toString === 'function') {
    // Handle cases where result.value might be an object with a toString method
    return (result.value as any).toString();
  }
  return null;
}

export const getIPFSDataFromContentID = async (ipfs: IPFSHTTPClient, cidString: string, maxAttempts = 60, delay = 1000) => {
  let attempts = 0;
  while (attempts < maxAttempts) {
    try {
      const jsonText = await tryToGetIPFSDataFromContentID(ipfs, cidString);
      if (jsonText) {
        return jsonText;
      }
    } catch (error) {
      attempts++;
      console.error(`CID: ${cidString} - attempt ${attempts} failed: ${error.message}`);
      if (attempts < maxAttempts) {
        // Wait for specified delay before trying again
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  throw new Error("Failed to fetch IPFS data after multiple attempts.");
};

export async function digestFromCIDv1(cidStr: string) {
  const cid = CID.parse(cidStr);
  if (cid.version !== 1) {
    throw new Error('The provided CID is not a CIDv1.');
  }
  const multihash = cid.multihash;
  if (multihash.code !== 0x12) {
    throw new Error('The provided CID does not use the SHA-256 hash function.');
  }
  return cid.multihash.digest;
}

export async function getCIDFromBytes(digest: Uint8Array) {
  const cidBytes = new Uint8Array([...prefix, ...digest]);
  const cid = CID.decode(cidBytes);
  return cid.toString();
}


function encryptText(text: string, password: string, salt: string) {
  const iv = crypto.randomBytes(16);
  const key = crypto.scryptSync(password, salt, 32); // Using the provided salt for encryption
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + encrypted;  // IV concatenated with encrypted text
}

function decryptText(encryptedText: string, password: string, salt: string) {
  const iv = Buffer.from(encryptedText.substring(0, 32), 'hex');
  const encrypted = encryptedText.substring(32);
  const key = crypto.scryptSync(password, salt, 32); // Using the provided salt for decryption
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export async function storeEncryptedTextOnIPFS(ipfs: any, text: string, password: string, salt: string) {
  const encryptedText = encryptText(text, password, salt);
  const cid = await getIPFSContentID(ipfs, encryptedText);
  return cid;
}

export async function retrieveDecryptedDataFromIPFS(ipfs: any, cid: string, password: string, salt: string) {
  const encryptedData = await getIPFSDataFromContentID(ipfs, cid);
  return decryptText(encryptedData, password, salt);
}

export function parseJson(input: string | null): any | null {
  try {
    const result = JSON.parse(input);
    return result;
  } catch (e) {
    console.error("Error parsing JSON: ", e.message);
    return null;
  }
}

export function nameFromKeyringPair(keyringPair: KeyringPair | null): string {
  if (keyringPair === null) {
    return '';
  }
  const [, , name] = getAddressName(keyringPair.address, null, "");
  return name;
}

export function keyForCid(keyPair: KeyringPair, cid: string): KeyringPair {
  const derivedPair = keyPair.derive('//' + cid);
  return derivedPair;
}

// Utility functions for converting between Base64 and ArrayBuffer
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary_string = window.atob(base64);
  const len = binary_string.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary_string.charCodeAt(i);
  }
  return bytes.buffer;
}

export function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return window.btoa(binary);
}

export async function encryptData(key: CryptoKey, data: string) {
  const encoded = new TextEncoder().encode(data);
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    encoded
  );
  return { encrypted: arrayBufferToBase64(encrypted), iv: arrayBufferToBase64(iv.buffer) };
}

export async function decryptData(key: CryptoKey, encrypted: string, iv: string) {
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: new Uint8Array(base64ToArrayBuffer(iv)) },
    key,
    base64ToArrayBuffer(encrypted)
  );
  return new TextDecoder().decode(decrypted);
}

// Use to encrypt archives
export async function getKey() {
  let keyB64 = await getSetting(SettingKey.ENCRYPTION_KEY);
  if (!keyB64) {
    const cryptoKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exportedKey = await window.crypto.subtle.exportKey("raw", cryptoKey);
    keyB64 = arrayBufferToBase64(exportedKey);
    await storeSetting(SettingKey.ENCRYPTION_KEY, keyB64);
    return cryptoKey;
  } else {
    const keyBytes = base64ToArrayBuffer(keyB64);
    return window.crypto.subtle.importKey(
      "raw",
      keyBytes,
      "AES-GCM",
      true,
      ["encrypt", "decrypt"]
    );
  }
}

const sessionStorageKey = (prefix: string, name: string) => {
  return prefix + ':' + name;
}
export const saveToSessionStorage = (prefix: string, name: string, value: any) => {
  if (typeof window === "undefined") return;
  try {
    const serializedValue = JSON.stringify(value);
    sessionStorage.setItem(sessionStorageKey(prefix, name), serializedValue);
  } catch (error) {
    console.error("Error saving to session storage", error);
  }
};

export const loadFromSessionStorage = (prefix: string, name: string) => {
  if (typeof window === "undefined") return undefined;
  try {
    const serializedValue = sessionStorage.getItem(sessionStorageKey(prefix, name));
    return serializedValue === null ? null : JSON.parse(serializedValue);
  } catch (error) {
    console.error("Error loading from session storage", error);
    return undefined;
  }
};

export const qrPadding = 5;
export const getQrWidth = () => {
  const deviceMaxWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
  const maxWidth = 260;
  // Assuming devices with a width of 768px or less are mobile
  const isMobile = deviceMaxWidth <= 768;

  // For mobile devices, use the device's maximum width; otherwise, use maxWidth
  return isMobile ? (deviceMaxWidth - 4 * qrPadding) : maxWidth;
}

export const createPeer = () => {
  return new Peer({
    host: process.env.PEERJS_SERVER,
    port: 443,
    secure: true,
    path: '/',
    config: {
      'iceServers': [
        { urls: `stun:${process.env.COTURN_SERVER}` },
        { urls: `turn:${process.env.COTURN_SERVER}`, username: process.env.COTURN_USER, credential: process.env.COTURN_PASSWORD }
      ]
    }
  });
}

export const receiveWebRTCData = async (
  peerId: string,
  timeoutMsec: number
): Promise<any> => {
  const startTime = Date.now();

  // Function to calculate remaining time
  const getRemainingTime = (): number => {
    const elapsed = Date.now() - startTime;
    return timeoutMsec - elapsed;
  };

  // Step 1: Initialize the peer with a dynamic timeout
  let peer: Peer;
  const peerInitPromise = new Promise<Peer>((resolve, reject) => {
    const p = createPeer();
    p.on('open', () => resolve(p));
    p.on('error', (err) => {
      reject(new Error(`Peer initialization error: ${err.message}`));
    });
  });

  const peerInitTimeout = getRemainingTime();
  if (peerInitTimeout <= 0) {
    throw new Error('Operation timed out before peer initialization could start');
  }

  peer = await Promise.race([
    peerInitPromise,
    new Promise<Peer>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Peer initialization not completed within ${peerInitTimeout} ms`
            )
          ),
        peerInitTimeout
      )
    )
  ]);

  // Step 2: Establish connection to the remote peer with a dynamic timeout
  const connectionPromise = new Promise<any>((resolve, reject) => {
    const conn = peer.connect(peerId);
    conn.on('open', () => resolve(conn));
    conn.on('error', (err) => {
      reject(new Error(`Connection error: ${err.message}`));
    });
  });

  const connectionTimeout = getRemainingTime();
  if (connectionTimeout <= 0) {
    throw new Error('Operation timed out before connection establishment could start');
  }

  const connection = await Promise.race([
    connectionPromise,
    new Promise<any>((_, reject) =>
      setTimeout(
        () =>
          reject(
            new Error(
              `Connection not established within ${connectionTimeout} ms`
            )
          ),
        connectionTimeout
      )
    )
  ]);

  // Step 3: Wait for data from the connected peer with a dynamic timeout
  const dataPromise = new Promise<any>((resolve, reject) => {
    const onData = (receivedData: any) => {
      cleanup();
      resolve(receivedData);
    };

    const onClose = () => {
      cleanup();
      reject(new Error('Connection closed before data was received'));
    };

    const onError = (err: { message: any }) => {
      cleanup();
      reject(new Error(`Connection error during data transfer: ${err.message}`));
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      connection.off('data', onData);
      connection.off('close', onClose);
      connection.off('error', onError);
    };

    connection.on('data', onData);
    connection.on('close', onClose);
    connection.on('error', onError);

    const timeoutId = setTimeout(() => {
      cleanup();
      reject(new Error(`No data received within the remaining timeout`));
    }, getRemainingTime());
  });

  const dataTimeout = getRemainingTime();
  if (dataTimeout <= 0) {
    throw new Error('Operation timed out before data reception could start');
  }

  const data = await Promise.race([
    dataPromise,
    new Promise<any>((_, reject) =>
      setTimeout(
        () => reject(new Error(`No data received within ${dataTimeout} ms`)),
        dataTimeout
      )
    )
  ]);

  return data;
};
