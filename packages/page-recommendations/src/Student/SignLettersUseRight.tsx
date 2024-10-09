// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import BN from 'bn.js';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useEffect, useState } from 'react';
import { u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { ShareButton, getBaseUrl, nameFromKeyringPair, ClipboardCopyButton, SenderComponent, QRAction } from '@slonigiraf/app-slonig-components';
import { useTranslation } from '../translate.js';
import { storeLetterUsageRight } from '../utils.js';
import { keyForCid } from '@slonigiraf/app-slonig-components';
import { Letter } from "../db/Letter.js";

interface Props {
  className?: string;
  letters: Letter[];
  worker: string;
  employer: string;
  currentPair: KeyringPair;
}
function SignLetterUseRight({ className = '', letters, worker, employer, currentPair }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [url, setUrl] = useState('');

  const _onSign =
    async () => {
      if (!currentPair) {
        return;
      }
      let signedLettersPromises = letters.map(async letter => {
        // generate a data to sign      
        const letterInsurance = getDataToSignByWorker(letter.letterNumber, new BN(letter.block), new BN(letter.block), hexToU8a(letter.referee),
          hexToU8a(letter.worker), new BN(letter.amount), hexToU8a(letter.signOverReceipt), hexToU8a(employer));

        const diplomaKey = keyForCid(currentPair, letter.cid);
        const workerSignOverInsurance = u8aToHex(diplomaKey.sign(u8aWrapBytes(letterInsurance)));

        storeLetterUsageRight(letter, employer, workerSignOverInsurance);
        // create the result text
        let result = [];
        result.push(letter.worker);
        result.push(letter.cid);
        result.push(letter.genesis);
        result.push(letter.letterNumber);
        result.push(letter.block);//This is for blockNumber
        result.push(letter.block);//This is for blockAllowed
        result.push(letter.referee);
        result.push(letter.amount);
        result.push(letter.signOverPrivateData);
        result.push(letter.signOverReceipt);
        result.push(workerSignOverInsurance);
        return result.join(",");
      });

      const signedLetters = await Promise.all(signedLettersPromises);
      const studentName = nameFromKeyringPair(currentPair);


      const signedLettersToUrl = JSON.stringify(signedLetters);
      const urlToSend: string = getBaseUrl() + `/#/diplomas/teacher?student=${worker}&name=${encodeURIComponent(studentName)}&t=${employer}&d=${encodeURIComponent(signedLettersToUrl)}`;
      setUrl(urlToSend);
    };

  useEffect(
    () => {
      _onSign();
    }, [currentPair, worker, employer, letters]
  );

  const thereAreDiplomas = letters.length > 0;

  return (
    <div className={`toolbox--Sign ${className}`}>
      {/* <WebRTCTextTransfer /> */}
      <SenderComponent data="Hello, Receiver!" url="https://example.com" action={QRAction.ADD_INSURANCES}/>
      <ShareButton title={t('QR code')} text={t('Press the link to see diplomas of the student')} url={url} isDisabled={!thereAreDiplomas} />
      <ClipboardCopyButton text={url} isDisabled={!thereAreDiplomas} />
    </div>
  );

}

export default React.memo(SignLetterUseRight);