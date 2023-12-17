// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0
import BN from 'bn.js';
import QRCode from 'qrcode.react';
import { getDataToSignByWorker } from '@slonigiraf/helpers';
import type { KeyringPair } from '@polkadot/keyring/types';
import React, { useCallback, useState } from 'react';
import { Button, Modal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { u8aToHex, hexToU8a, u8aWrapBytes } from '@polkadot/util';
import { QRAction, QRWithShareAndCopy, getBaseUrl, nameFromKeyringPair } from '@slonigiraf/app-slonig-components';
import { useTranslation } from '../translate.js';
import { qrCodeSize } from '../constants.js';
import { storeLetterUsageRight } from '../utils.js';
import { keyForCid } from '@slonigiraf/app-slonig-components';
import { Letter } from "./Letter.js";

interface Props {
  className?: string;
  letters: Letter[];
  worker: string;
  employer: string;
  currentPair: KeyringPair;
}
function SignLetterUseRight({ className = '', letters, worker, employer, currentPair }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [letterInfo, setLetterInfo] = useState('')
  const [url, setUrl] = useState('')
  const [isQROpen, toggleQR] = useToggle();

  const _onSign = useCallback(
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

      const qrData = {
        q: QRAction.SELL_DIPLOMAS,
        p: worker,
        n: studentName,
        t: employer,
        d: signedLetters
      };
      const qrCodeText = JSON.stringify(qrData);
      const signedLettersToUrl = JSON.stringify(signedLetters);
      const urlToSend: string = getBaseUrl() + `/#/diplomas/teacher?student=${worker}&name=${encodeURIComponent(studentName)}&t=${employer}&d=${signedLettersToUrl}`;
      setUrl(urlToSend);
      // show QR
      setLetterInfo(letters.length > 0 && letters.length < 5 ? qrCodeText : "");
      toggleQR();
    },
    [currentPair, worker, employer, letters]
  );

  return (
    <div className={`toolbox--Sign ${className}`}>
      <Button
        icon='dollar'
        label={t('Get bonuses')}
        onClick={_onSign}
      />
      {isQROpen && (
        <Modal
          header={letterInfo === "" ? t('Warning') : t('Show this QR to your teacher')}
          onClose={toggleQR}
          size='small'
        >
          <Modal.Content>
            {letterInfo === "" ? <h2>{t('Select at least 1 and no more than 4 diplomas')}</h2> :
              <QRWithShareAndCopy
                dataQR={letterInfo}
                titleShare={t('QR code')}
                textShare={t('Press the link to see diplomas of the student')}
                urlShare={url}
                dataCopy={url} />
            }
          </Modal.Content>
        </Modal>
      )}
    </div>
  );
}

export default React.memo(SignLetterUseRight);