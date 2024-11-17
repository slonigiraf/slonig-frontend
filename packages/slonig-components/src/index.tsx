// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0
import type { Signer } from '@polkadot/api/types';
import QRScanner from './QRScanner.js'
import { IpfsProvider, useIpfsContext } from './IpfsContext.js';
import { LoginProvider, useLoginContext } from './LoginContext.js';
import { InfoProvider, useInfo } from './InfoProvider.js';
import { ReimbursementProvider, useReimbursement } from './ReimbursementProvider.js';
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
import TextAreaWithPreview from './TextAreaWithPreview.js';
import SelectableList from './SelectableList.js';
import { Button, styled } from '@polkadot/react-components';

import { balanceToSlonString, createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSContentIDAndPinIt, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson, qrPadding } from './utils.js';
import { useEffect, useState } from 'react';
import { getSetting, SettingKey } from '@slonigiraf/db';
export { ReimbursementProvider, useReimbursement, TokenTransferProvider, useTokenTransfer, DateInput, SelectableList, SenderComponent, TextAreaWithPreview, KatexSpan, ResizableImage, LoginButton, ShareButton, ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext, InfoProvider, useInfo };
export { balanceToSlonString, createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getIPFSContentIDAndPinIt, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, LoginProvider, useLoginContext, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson }

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

import { KeyringPair } from '@polkadot/keyring/types';
import { u8aToHex, stringToU8a, u8aConcat } from '@polkadot/util';
import { signatureVerify } from '@polkadot/util-crypto';

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
  insurances: string[];
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