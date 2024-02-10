// Copyright 2017-2023 @polkadot/app-settings authors & contributors
// SPDX-License-Identifier: Apache-2.0
import type { Signer } from '@polkadot/api/types';
import QRScanner from './QRScanner.js'
import { IpfsProvider, useIpfsContext } from './IpfsContext.js';
import { LoginProvider, useLoginContext } from './LoginContext.js';
import { InfoProvider, useInfo } from './InfoProvider.js';
import ShareButton from './ShareButton.js';
import LoginButton from './LoginButton.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import ButtonWithLabelBelow from './ButtonWithLabelBelow.js';
import ScanQR from './ScanQR.js';
import QRWithShareAndCopy from './QRWithShareAndCopy.js';
import { styled } from '@polkadot/react-components';

import { getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson } from './utils.js';
import { useEffect, useState } from 'react';
import { getSetting } from '@slonigiraf/app-recommendations';
export { LoginButton, ShareButton, ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext, InfoProvider, useInfo };
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
export const VerticalCenterItemsContainer = styled(CenterItemsContainer)`
  min-height: 500px;
`;
export const HorizontalCenterItemsContainer = styled(CenterItemsContainer)`
  flex-direction: row;
`;

export const CenterQRContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
  margin: 0 auto;
  @media (min-width: 768px) {
    width: 400px;
  }
`;

export function useDeveloperSetting(): boolean {
  const [isDeveloper, setDeveloper] = useState<boolean>(false);

  useEffect((): void => {
    const loadDev = async () => {
      const isDev = await getSetting('developer');
      setDeveloper(isDev === 'true' ? true : false);
    };
    loadDev();
  }, []);

  return isDeveloper;
}