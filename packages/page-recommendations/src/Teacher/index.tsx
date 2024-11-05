// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import InsurancesList from './InsurancesList.js';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, nameFromKeyringPair, getBaseUrl, useLoginContext, LoginButton, CenterQRContainer, Person } from '@slonigiraf/app-slonig-components';
import { QRAction } from '@slonigiraf/db';
import InsurancesReceiver from './InsurancesReceiver.js';

interface Props {
  className?: string;
}

function Teacher({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  // Initialize account
  const { currentPair, isLoggedIn } = useLoginContext();
  const [student, setStudent] = useState<Person | null>(null);

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.TEACHER_IDENTITY,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url = getBaseUrl() + `/#/diplomas?teacher=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  return (
    <div className={`toolbox--Student ${className}`}>
      {
        isLoggedIn && <>
          {student ?
            <div className='ui--row'>
              <InsurancesList teacher={publicKeyHex} student={student.identity} studentNameFromUrl={student.name} />
            </div>
            :
            <>
              <InsurancesReceiver setWorker={setStudent} />
              <CenterQRContainer>
                <h2>{t('Show to a student to see their results')}</h2>
                <QRWithShareAndCopy
                  dataQR={qrCodeText}
                  titleShare={t('QR code')}
                  textShare={t('Press the link to show diplomas')}
                  urlShare={url}
                  dataCopy={url} />
              </CenterQRContainer>
            </>
          }
        </>
      }
      <LoginButton />
    </div>
  );

}

export default React.memo(Teacher);