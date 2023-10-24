// Copyright 2017-2023 @polkadot/app-slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import crypto from 'crypto';
import { getIPFSContentID, getIPFSDataFromContentID } from '@slonigiraf/helpers';

export function parseJson (input: string): any | null {
  try {
    const result = JSON.parse(input);
    return result;
  } catch (e) {
    console.error("Error parsing JSON: ", e.message);
    return null;
  }
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