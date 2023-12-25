// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0
import type { Signer } from '@polkadot/api/types';
import QRScanner from './QRScanner.js'
import { IpfsProvider, useIpfsContext } from './IpfsContext.js';
import { LoginProvider, useLoginContext } from './LoginContext.js';
import { InfoProvider, useInfo } from './InfoProvider.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import ButtonWithLabelBelow from './ButtonWithLabelBelow.js';
import ScanQR from './ScanQR.js';
import QRWithShareAndCopy from './QRWithShareAndCopy.js';
import { getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson } from './utils.js';
export { ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext, InfoProvider, useInfo };
export { getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, LoginProvider, useLoginContext, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson }
export interface Question {
    h: string;
    a: string;
}
export interface Skill {
    h: string;
    q: Question[];
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

export const QRAction = {
    NAVIGATION: 0,
    TRANSFER: 1,
    ADD_DIPLOMA: 2,
    SELL_DIPLOMAS: 3,
    TUTOR_IDENTITY: 4,
    SKILL: 5,
    TEACHER_IDENTITY: 6
};