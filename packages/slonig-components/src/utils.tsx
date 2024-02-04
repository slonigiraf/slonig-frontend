import { IPFSHTTPClient, CID, DAGGetResult } from 'kubo-rpc-client'
import crypto from 'crypto';
import { getAddressName } from '@polkadot/react-components';
import type { KeyringPair } from '@polkadot/keyring/types';
import { getSetting, storeSetting } from '@slonigiraf/app-recommendations';

export const getBaseUrl = () => {
  const { protocol, hostname, port } = window.location;
  return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
};

// ------
export const CODEC = 0x71;
// 1 is v1, 113 is 0x71, 18 is 0x12 the multihash code for sha2-256, 32 is length of digest
const prefix = new Uint8Array([1, 113, 18, 32]);
// ------
// A helper wrapper to get IPFS CID from a text
export async function getIPFSContentID(ipfs: IPFSHTTPClient, content: string) {
  const cid = await ipfs.dag.put(content, { storeCodec: 'dag-cbor', hashAlg: 'sha2-256' });
  // await ipfs.pin.add(cid);
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

export async function getIPFSDataFromContentID(ipfs: IPFSHTTPClient, cidStr: string): Promise<string | null> {
  const cid = CID.parse(cidStr);
  const result = await timeout<DAGGetResult>(3000, ipfs.dag.get(cid));
  await timeout<DAGGetResult>(3000, ipfs.pin.add(cid)); // TODO: add this somewhere else
  // Use type assertion if necessary
  if (typeof result.value === 'string') {
    return result.value;
  } else if (result.value && typeof (result.value as any).toString === 'function') {
    // Handle cases where result.value might be an object with a toString method
    return (result.value as any).toString();
  }
  return null;
}

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

export async function getKey() {
  let keyB64 = await getSetting('encryptionKey');
  if (!keyB64) {
    const cryptoKey = await window.crypto.subtle.generateKey(
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
    const exportedKey = await window.crypto.subtle.exportKey("raw", cryptoKey);
    keyB64 = arrayBufferToBase64(exportedKey);
    await storeSetting('encryptionKey', keyB64);
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
