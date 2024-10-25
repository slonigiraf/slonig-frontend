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
import ResizableImage from './ResizableImage.js';
import QRWithShareAndCopy from './QRWithShareAndCopy.js';
import SenderComponent from './SenderComponent.js';
import DateInput from './DateInput.js';
import KatexSpan from './KatexSpan.js';
import TextAreaWithPreview from './TextAreaWithPreview.js';
import SelectableList from './SelectableList.js';
import { Button, Progress, styled } from '@polkadot/react-components';

import { createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSContentIDAndPinIt, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson, qrPadding } from './utils.js';
import { useEffect, useState } from 'react';
import { getSetting } from '@slonigiraf/app-recommendations';
export { DateInput, SelectableList, SenderComponent, TextAreaWithPreview, KatexSpan, ResizableImage, LoginButton, ShareButton, ClipboardCopyButton, QRWithShareAndCopy, QRScanner, ButtonWithLabelBelow, ScanQR, IpfsProvider, useIpfsContext, InfoProvider, useInfo };
export { createPeer, receiveWebRTCData, getQrWidth, saveToSessionStorage, loadFromSessionStorage, getIPFSContentIDAndPinIt, getKey, arrayBufferToBase64, base64ToArrayBuffer, decryptData, encryptData, LoginProvider, useLoginContext, keyForCid, nameFromKeyringPair, getBaseUrl, CODEC, getIPFSContentID, getIPFSDataFromContentID, digestFromCIDv1, getCIDFromBytes, storeEncryptedTextOnIPFS, retrieveDecryptedDataFromIPFS, parseJson }

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

export const QRAction = {
  NAVIGATION: 0,
  TRANSFER: 1,
  ADD_DIPLOMA: 2,
  BUY_DIPLOMAS: 3,
  TUTOR_IDENTITY: 4,
  SKILL: 5,
  TEACHER_IDENTITY: 6,
  ADD_INSURANCES: 7,
  LEARN_MODULE: 8
};

export const QRField = {
  ID: 'i', 
  QR_ACTION: 'q',
  PERSON_NAME: 'n',
  PERSON_IDENTITY: 'p',
  TUTOR: 't',
};

export const LawType = {
  LIST: 0,
  COURSE: 1,
  MODULE: 2,
  SKILL: 3,
  EXERCISE: 4
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
export const StyledCloseButton = styled(Button)`
  position: fixed;
  width: 40px;
  top: 95px;
  right: 10px;
  z-index: 1;
  @media (min-width: 768px) {
    left: 50%;
    transform: translateX(-50%) translateX(375px);
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