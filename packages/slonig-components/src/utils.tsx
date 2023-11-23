import { IPFSHTTPClient, CID } from 'kubo-rpc-client'
import crypto from 'crypto';

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
    return cid.toString();
  }
  // A helper wrapper to get a text from IPFS CID
  export async function getIPFSDataFromContentID(ipfs: IPFSHTTPClient, cidStr: string): Promise<string | null> {
    const cid = CID.parse(cidStr);
    const result = await ipfs.dag.get(cid);
    // Check if result.value is a string and return it, else return null
    if (typeof result.value === 'string') {
      return result.value;
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
  
  export function parseJson (input: string | null): any | null {
    try {
      const result = JSON.parse(input);
      return result;
    } catch (e) {
      console.error("Error parsing JSON: ", e.message);
      return null;
    }
  }