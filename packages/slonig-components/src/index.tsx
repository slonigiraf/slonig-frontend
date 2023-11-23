// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0
import QRScanner from './QRScanner.js'
import { IpfsProvider, useIpfsContext } from './IpfsContext.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import ButtonWithLabelBelow from './ButtonWithLabelBelow.js';
import ScanQR from './ScanQR.js';
import QRWithShareAndCopy from './QRWithShareAndCopy.js';
import { getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson } from './utils.js';
export { ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext };
export { getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson }
export interface Question {
    h: string;
    a: string;
}
export interface Skill {
    q: Question[];
}