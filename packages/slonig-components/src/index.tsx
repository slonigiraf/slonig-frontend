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
import LoginButton from './LoginButton.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import ButtonWithLabelBelow from './ButtonWithLabelBelow.js';
import ScanQR from './ScanQR.js';
import ResizableImage from './ResizableImage.js';
import QRWithShareAndCopy from './QRWithShareAndCopy.js';
import SenderComponent from './SenderComponent.js';
import DateInput from './DateInput.js';
import KatexSpan from './KatexSpan.js';
import DBImport from './DBImport.js';
import DBExport from './DBExport.js';
import Confirmation from './Confirmation.js';
import TextAreaWithPreview from './TextAreaWithPreview.js';
import SelectableList from './SelectableList.js';
import { Button, styled } from '@polkadot/react-components';
import BN from 'bn.js';
import { balanceToSlonString, createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSContentIDAndPinIt, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson, qrPadding } from './utils.js';
import { useEffect, useState } from 'react';
import { getSetting, SettingKey } from '@slonigiraf/db';
export { BlockchainSyncProvider, useBlockchainSync, TokenTransferProvider, useTokenTransfer, DateInput, SelectableList, SenderComponent, TextAreaWithPreview, KatexSpan, ResizableImage, LoginButton, ShareButton, ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext, InfoProvider, useInfo };
export { balanceToSlonString, createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getIPFSContentIDAndPinIt, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, LoginProvider, useLoginContext, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson }
export { DBImport, DBExport, Confirmation };
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a } from '@polkadot/util';
import type { ApiPromise } from '@polkadot/api';
import { Codec } from '@polkadot/types/types';
import { KeyringPair } from '@polkadot/keyring/types';
import { u8aToHex, stringToU8a, u8aConcat } from '@polkadot/util';
import { signatureVerify } from '@polkadot/util-crypto';

export const EXISTENTIAL_BATCH_SENDER_BALANCE = new BN('10000000000000'); // 10 Slon = 10000000000000
export const EXISTENTIAL_REFEREE_BALANCE = new BN('1000000000000000'); // 1k Slon = 1000000000000000
export const REIMBURSEMENT_BATCH_SIZE = 5;

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
  /** The base64 encoded string for the exercise's primary image. */
  p: string;
  /** The base64 encoded string for the exercise's solution image. */
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
  @media (min-width: 768px) {
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
`;
export const InstructionsButtonsContainer = styled.div`
  display: flex;
  align-items: center;
  width: 100%;
  margin: 0 auto;
`;
export const InstructionsButtonsGroup = styled.div`
  display: flex;
  align-items: center;
  max-width: 400px;
  margin: 0 auto;
`;
export const StyledSpinnerContainer = styled.div`
  .ui--Spinner{
    width: 50px;
    margin-left: 0px;
    margin-right: 25px;
  }
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
  sender: 'you' | 'them';
  senderName: string | null;
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

export const QRAction = {
  NAVIGATION: 0,
  TRANSFER: 1,
  ADD_DIPLOMA: 2,
  BUY_DIPLOMAS: 3,
  SKILL: 4,
  TEACHER_IDENTITY: 5,
  ADD_INSURANCES: 6,
  LEARN_MODULE: 7
};

export const QRField = {
  WEBRTC_PEER_ID: 'c',
  ID: 'i',
  QR_ACTION: 'q',
  QR_SIGNATURE: 's',
  PERSON_NAME: 'n',
  PERSON_IDENTITY: 'p',
  TUTOR: 't',
  DATA: 'd',
  PRICE: 'm',
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