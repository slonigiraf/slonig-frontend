// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import InsurancesList from './InsurancesList.js';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, nameFromKeyringPair, getBaseUrl, useLoginContext, CenterQRContainer, Person, StyledContentCloseButton, qrWidthPx } from '@slonigiraf/app-slonig-components';
import { getPseudonym } from '@slonigiraf/db';
import InsurancesReceiver from './InsurancesReceiver.js';
import PersonSelector from '../PersonSelector.js';

interface Props {
  className?: string;
}

function Assess({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  // Initialize account
  const { currentPair, isLoggedIn } = useLoginContext();
  const [student, setStudent] = useState<Person | null>(null);
  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const url = getBaseUrl() + `/#/badges?employer=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  const handleStudentSelect = async (selectedKey: string) => {
    if (selectedKey) {
      const pseudonym = await getPseudonym(selectedKey);
      if (pseudonym) {
        setStudent({ name: pseudonym, identity: selectedKey });
      }
    }
  };

  return (
    <div className={`toolbox--Student ${className}`}>
      {
        isLoggedIn && <>
          {student ?
            <div className='ui--row'>
              <StyledContentCloseButton onClick={() => setStudent(null)}
                icon='close'
              />
              <InsurancesList teacher={publicKeyHex} student={student.identity} studentNameFromUrl={student.name} />
            </div>
            :
            <>
              <PersonSelector
                label={t('assessment history')}
                onChange={handleStudentSelect}
              />
              <CenterQRContainer>
                <h2 style={{ marginTop: '0px' }}>{t('Show to a student to see their results')}</h2>
                <QRWithShareAndCopy
                  titleShare={t('QR code')}
                  textShare={t('Press the link to show badges')}
                  urlShare={url}
                  dataCopy={url} />
              </CenterQRContainer>
            </>
          }
          <InsurancesReceiver setWorker={setStudent} />
        </>
      }
    </div>
  );

}
export default React.memo(Assess);