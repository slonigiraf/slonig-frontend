// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0
import type { Signer } from '@polkadot/api/types';
import QRScanner from './QRScanner.js'
import { IpfsProvider, useIpfsContext } from './IpfsContext.js';
import { InfoProvider, useInfo } from './InfoProvider.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import ButtonWithLabelBelow from './ButtonWithLabelBelow.js';
import ScanQR from './ScanQR.js';
import QRWithShareAndCopy from './QRWithShareAndCopy.js';
import { keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson } from './utils.js';
export { ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext, InfoProvider, useInfo };
export { keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson }
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
    LIST_DIPLOMAS: 3,
    SHOW_TUTOR_IDENTITY: 4,
    SHOW_SKILL_QR: 5,
    SHOW_TEACHER_IDENTITY: 6
};