// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';
import InsurancesList from './InsurancesList.js';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, QRAction, nameFromKeyringPair, getBaseUrl, useLoginContext, LoginButton, CenterQRContainer, Person, StyledContentCloseButton, qrWidthPx } from '@slonigiraf/app-slonig-components';
import { getPseudonym } from '@slonigiraf/db';
import InsurancesReceiver from './InsurancesReceiver.js';
import { getAllPseudonyms } from '@slonigiraf/db';
import { useLiveQuery } from "dexie-react-hooks";
import { Dropdown, styled } from '@polkadot/react-components';
import type { Pseudonym } from '@slonigiraf/db';

interface Props {
  className?: string;
}

function Assess({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  // Initialize account
  const { currentPair, isLoggedIn } = useLoginContext();
  const [student, setStudent] = useState<Person | null>(null);
  const students = useLiveQuery(() => getAllPseudonyms(), []);

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.TEACHER_IDENTITY,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url = getBaseUrl() + `/#/diplomas?teacher=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  // Prepare dropdown options
  let studentOptions = students?.map((student: Pseudonym) => ({
    text: student.pseudonym,
    value: student.publicKey
  }));

  const handleStudentSelect = async (selectedKey: string) => {
    if(selectedKey){
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
              <InsurancesReceiver setWorker={setStudent} />
              <StyledDiv>
                <CenterQRContainer>
                  <FlexRow>
                    <Dropdown
                      className={`dropdown ${className}`}
                      label={t('select a student')}
                      value={''}
                      onChange={handleStudentSelect}
                      options={studentOptions || []}
                    />
                  </FlexRow>
                  <h2>{t('Show to a student to see their results')}</h2>
                  <QRWithShareAndCopy
                    dataQR={qrCodeText}
                    titleShare={t('QR code')}
                    textShare={t('Press the link to show diplomas')}
                    urlShare={url}
                    dataCopy={url} />
                </CenterQRContainer>
              </StyledDiv>
            </>
          }
        </>
      }
      <LoginButton />
    </div>
  );

}
const StyledDiv = styled.div`
  justify-content: center;
  align-items: center;
  .ui--Dropdown {
    width: ${qrWidthPx}px;
    padding-left: 0px !important;
  }
  label {
    left: 20px !important;
  }
`;
const FlexRow = styled.div`
  display: flex;
  justify-content: left;
  align-items: left;
  margin-top: 20px;
`;
export default React.memo(Assess);