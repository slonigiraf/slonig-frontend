// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0
import type { Signer } from '@polkadot/api/types';
import QRScanner from './QRScanner.js'
import { IpfsProvider, useIpfsContext } from './IpfsContext.js';
import { LoginProvider, useLoginContext } from './LoginContext.js';
import { InfoProvider, useInfo } from './InfoProvider.js';
import { BlockchainSyncProvider, useBlockchainSync } from './BlockchainSyncProvider.js';
import { TokenTransferProvider, useTokenTransfer } from './TokenTransferProvider.js';
import ShareButton from './ShareButton.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import ButtonWithLabelBelow from './ButtonWithLabelBelow.js';
import ScanQR from './ScanQR.js';
import ResizableImage from './ResizableImage.js';
import QRWithShareAndCopy from './QRWithShareAndCopy.js';
import SenderComponent from './SenderComponent.js';
import DateInput from './DateInput.js';
import KatexSpan from './KatexSpan.js';
import DBImport from './DBImport.js';
import DownloadQRButton from './DownloadQRButton.js';
import DBExport from './DBExport.js';
import Confirmation from './Confirmation.js';
import SelectableList from './SelectableList.js';
import { Button, styled } from '@polkadot/react-components';
import BN from 'bn.js';
import { getIPFSContentIDForBytesAndPinIt, getIPFSBytesFromContentID, balanceToSlonString, createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSContentIDAndPinIt, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson, qrPadding } from './utils.js';
import { useEffect, useState } from 'react';
import { getSetting, SettingKey, storeSetting } from '@slonigiraf/db';
export * from './constants.js';
export { default as SVGButton } from './SVGButton.js';
export { DownloadQRButton, BlockchainSyncProvider, useBlockchainSync, TokenTransferProvider, useTokenTransfer, DateInput, SelectableList, SenderComponent, KatexSpan, ResizableImage, ShareButton, ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext, InfoProvider, useInfo };
export { getIPFSContentIDForBytesAndPinIt, getIPFSBytesFromContentID, balanceToSlonString, createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getIPFSContentIDAndPinIt, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, LoginProvider, useLoginContext, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson }
export { DBImport, DBExport, Confirmation };
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a } from '@polkadot/util';
import type { ApiPromise } from '@polkadot/api';
import { Codec } from '@polkadot/types/types';
import { KeyringPair } from '@polkadot/keyring/types';
import { u8aToHex, stringToU8a, u8aConcat } from '@polkadot/util';
import { signatureVerify } from '@polkadot/util-crypto';
import SVGButton from './SVGButton.jsx';

export const EXISTENTIAL_BATCH_SENDER_BALANCE = new BN('10000000000000'); // 10 Slon = 10000000000000
export const EXISTENTIAL_REFEREE_BALANCE = new BN('1000000000000000'); // 1k Slon = 1000000000000000
export const REIMBURSEMENT_BATCH_SIZE = 5;
export const progressFromButtomPx = 80;

export function getFormattedTimestamp(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${year}${month}${day}_${hours}_${minutes}`;
};

export const qrWidthPx = getQrWidth();
export interface Exercise {
  /** The exercise text. */
  h: string;
  /** The solution text to the exercise. */
  a: string;
  /** CID of the exercise primary image. */
  p: string;
  /** CID of the exercise solution image. */
  i: string;
}

export interface Skill {
  i: string;
  h: string;
  q: Exercise[];
}

export interface AccountState {
  isExternal: boolean;
  isHardware: boolean;
  isInjected: boolean;
}

export interface SignerState {
  isUsable: boolean;
  signer: Signer | null;
}

// Styled components
export const FullWidthContainer = styled.div`
  width: 100%;
`;
const CenterItemsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0 auto;
  @media (min-width: 800px) {
    width: 800px;
  }
`;
export const AppContainer = styled(CenterItemsContainer)`
  min-height: 500px;
`;
export const VerticalCenterItemsContainer = styled(CenterItemsContainer)`
`;
export const HorizontalCenterItemsContainer = styled(CenterItemsContainer)`
  flex-direction: row;
`;
export const AlignRightDiv = styled.div`
    width: 100%;
    display: flex;
    justify-content: right;
`;
export const CenterQRContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: ${qrWidthPx + qrPadding}px;
  margin: 0 auto;
`;

export const InstructionsContainer = styled.div`
  padding-top: 15px;
  width: 100%;
  margin-top: 10px;
  max-height: calc(100vh - 260px); /* Limit height to ensure it stops 200px from the bottom */
  overflow-y: auto; /* Enable scrolling when content exceeds height */
  box-sizing: border-box; /* Include padding in height calculations */
`;

export const InstructionsButtonsContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  .hint {
    text-align: center;
    padding-bottom: 10px;
  }
  background-color: white;
  border-radius: 7.5px;
  box-shadow: 0 1px 0.5px rgba(0, 0, 0, 0.13);
  width: 100%;
  padding: 15px;
  margin: 0;
  word-wrap: break-word;
  position: relative;
  outline: 2px solid var(--color-header);
  text-align: center;
`;
export const InstructionsButtonsGroup = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0 auto;
  min-width: 300px;
  max-width: 300px;
  & > button {
    height: 2.5rem !important;
    padding: 10px !important;
  }
`;
export const ChatContainer = styled.div`
  font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
  font-size: 18px;
  width: 100%;
`;

export const StyledSpinnerContainer = styled.div`
  .ui--Spinner{
    width: 50px;
    margin-left: 0px;
    margin-right: 25px;
  }
`;

export const ToggleContainer = styled.div`
  margin: 5px 0;
  display: flex;
  flex-direction: row;
`;

export const StyledContentCloseButton = styled(Button)`
  position: absolute;
  width: 40px;
  top: 50px;
  right: 2px;
  z-index: 1;
`;

export function useDeveloperSetting(): boolean {
  const [isDeveloper, setDeveloper] = useState<boolean>(false);

  useEffect((): void => {
    const loadDev = async () => {
      const isDev = await getSetting(SettingKey.DEVELOPER);
      setDeveloper(isDev === 'true' ? true : false);
    };
    loadDev();
  }, []);

  return isDeveloper;
}

/**
 * Signs an array of strings with a keyPair.
 *
 * @param messages - Array of strings to sign.
 * @param keyPair - The key pair used to sign the messages.
 * @returns The signature as a hex string.
 */
export function signStringArray(messages: string[], keyPair: KeyringPair): string {
  // Convert each string to a Uint8Array and concatenate them
  const messageU8a = u8aConcat(...messages.map((msg) => stringToU8a(msg)));

  // Sign the concatenated message
  const signature = keyPair.sign(messageU8a);

  // Return the signature as a hex string
  return u8aToHex(signature);
}

/**
 * Validates that the signature is correct using the array of strings and public key of the signer.
 *
 * @param messages - Array of strings that were signed.
 * @param signatureHex - The signature as a hex string.
 * @param publicKeyHex - The public key of the signer as a hex string.
 * @returns True if the signature is valid, false otherwise.
 */
export function verifySignature(messages: string[], signatureHex: string, publicKeyHex: string): boolean {
  // Convert each string to a Uint8Array and concatenate them
  const messageU8a = u8aConcat(...messages.map((msg) => stringToU8a(msg)));

  // Verify the signature
  const { isValid } = signatureVerify(messageU8a, signatureHex, publicKeyHex);

  return isValid;
}

export interface Economy {
  success: boolean;
  airdrop: string;
  badge: string;
  warranty: string;
  validity: string;
}

export interface AirdropResults {
  success: boolean;
  amount?: string;
  error?: string;
}

export async function fetchEconomy(): Promise<void> {
  const response = await fetch('https://economy.slonig.org/prices/');
  if (!response.ok) {
    throw new Error(`Fetching ecomomy error! status: ${response.status}`);
  }
  const economySettings: Economy = await response.json();
  await storeSetting(SettingKey.DIPLOMA_PRICE, economySettings.badge);
  await storeSetting(SettingKey.DIPLOMA_WARRANTY, economySettings.warranty);
  await storeSetting(SettingKey.DIPLOMA_VALIDITY, economySettings.validity);
  await storeSetting(SettingKey.ECONOMY_INITIALIZED, 'true');
};
export interface LessonResult {
  agreement: string;
  price: string; // BN.toString()
  workerId: string;
  genesis: string;
  referee: string;
  refereeName: string;
  amount: string;
  letters: string[];
  reexaminations: string[];
}

export interface LessonRequest {
  cid: string;
  learn: string[][];
  reexamine: string[][];
  lesson: string;
  name: string;
  identity: string;
}

export interface InsurancesTransfer {
  identity: string,
  name: string,
  insurances: string[],
  employer: string,
}

export interface Person {
  identity: string,
  name: string,
}

export interface IMessage {
  text: string;
  title: string | null;
  comment?: string;
  image?: string;
}

export const getAddressFromPublickeyHex = (publickeyHex: string) => {
  return encodeAddress(hexToU8a(publickeyHex));
}

export const getRecommendationsFrom = async (
  api: ApiPromise,
  referee: string,
  letterIds: number[]
): Promise<Map<number, boolean> | null> => {
  if (letterIds.length > 0) {
    const sortedNumbers = letterIds.sort((a, b) => a - b);

    const insurancePerChunk: number = 1000;
    const firstLetterNumber = sortedNumbers[0];
    let currentChunk = Math.floor(firstLetterNumber / insurancePerChunk);
    let data = await api.query.letters.ownedLetersArray([referee, currentChunk]);
    const result = new Map<number, boolean>();

    for (const letterId of sortedNumbers) {
      if (letterId >= 0) {
        const chunk = Math.floor(letterId / insurancePerChunk);
        if (chunk !== currentChunk) {
          currentChunk = chunk;
          data = await api.query.letters.ownedLetersArray([referee, chunk]);
        }
        const index = letterId % insurancePerChunk;

        if (data && (data as Codec).toJSON) {
          const jsonData = (data as Codec).toJSON();
          if (Array.isArray(jsonData)) {
            const letterArray = jsonData as boolean[];
            if (letterArray.length === 0) {
              result.set(letterId, true);
            } else if (index < letterArray.length) {
              result.set(letterId, letterArray[index]);
            }
          }
        }
      }
    }
    return result;
  }
  return null;
};

export const predictBlockNumber = (currentBlock: BN, blockTimeMs: number, secondsToAdd: number): BN => {
  const secondsToGenerateBlock = blockTimeMs / 1000;
  const blocksToAdd = new BN(secondsToAdd).div(new BN(secondsToGenerateBlock));
  const blockAllowed = currentBlock.add(blocksToAdd);
  return blockAllowed;
}

export const UrlParams = {
  WEBRTC_PEER_ID: 'c',
};

export const LawType = {
  LIST: 0,
  COURSE: 1,
  MODULE: 2,
  SKILL: 3,
  EXERCISE: 4
};

export async function clearAllData(onSuccess: () => void, onError: (error: string) => void) {
  try {
    // Clear localStorage
    localStorage.clear();

    console.log('localStorage.clear()')

    // Clear sessionStorage
    sessionStorage.clear();

    console.log('sessionStorage.clear()')

    // Clear cookies
    document.cookie.split(";").forEach((cookie) => {
      const name = cookie.split("=")[0].trim();
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/`;
    });

    console.log('Clear cookies')

    // Clear IndexedDB (specifically Slonig database)
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase('slonig');
      request.onsuccess = () => resolve();
      request.onerror = () => reject(new Error("Failed to delete IndexedDB."));
      request.onblocked = () => reject(new Error("The database deletion is blocked."));
    });

    // Call onSuccess after everything is cleared
    onSuccess();
  } catch (error) {
    // Call onError if anything fails
    if (error instanceof Error) {
      onError(error.message);
    } else {
      onError("An unknown error occurred.");
    }
  }
}