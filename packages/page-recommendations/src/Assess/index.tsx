// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import InsurancesList from './InsurancesList.js';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, nameFromKeyringPair, getBaseUrl, useLoginContext, CenterQRContainer, Person, StyledContentCloseButton, qrWidthPx, useLog, useBooleanSettingValue } from '@slonigiraf/slonig-components';
import { getPseudonym, SettingKey } from '@slonigiraf/db';
import InsurancesReceiver from './InsurancesReceiver.js';
import PersonSelector from '../PersonSelector.js';
import { Button, styled } from '@polkadot/react-components';

interface Props {
  className?: string;
}

function Assess({ className = '' }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const assessmentTutorialCompleted = useBooleanSettingValue(SettingKey.ASSESSMENT_TUTORIAL_COMPLETED);
  // Initialize account
  const { currentPair, isLoggedIn } = useLoginContext();
  const [student, setStudent] = useState<Person | null>(null);
  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const [isAssessmentAllowed, setIsAssessmentAllowed] = useState(false);

  const url = getBaseUrl() + `/#/badges?employer=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  useEffect(() => {
    if (assessmentTutorialCompleted === true) {
      setIsAssessmentAllowed(true);
    }
  }, [assessmentTutorialCompleted]);

  const handleStudentSelect = async (selectedKey: string) => {
    if (selectedKey) {
      const pseudonym = await getPseudonym(selectedKey);
      if (pseudonym) {
        setStudent({ name: pseudonym, identity: selectedKey });
      }
    }
  };

  useEffect(() => {
    if (isLoggedIn) {
      if (student) {
        logEvent('ASSESSMENT', 'VIEW_STUDENT');
      } else {
        logEvent('ASSESSMENT', 'SHOW_QR');
      }
    }
  }, [isLoggedIn, student]);

  const guard = <StyledDiv>
    <h1>{t('Are you a parent or a teacher?')}</h1>
    <ButtonsRow>
      <Button className='highlighted--button' label={t('Parent')} onClick={() => setIsAssessmentAllowed(true)} />
      <Button className='highlighted--button' label={t('Teacher')} onClick={() => setIsAssessmentAllowed(true)} />
    </ButtonsRow>
  </StyledDiv>;

  return (
    <div className={`toolbox--Student ${className}`}>
      {
        isLoggedIn && !isAssessmentAllowed ? guard : <>
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
                <h2 style={{ marginTop: '0px' }} className='prompt'>{t('To assess a student, ask them to scan:')}</h2>
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

const StyledDiv = styled.div`
  flex: 1;
  width: 100%;
  min-height: 0;
  display: flex;
  align-items: center;
  text-align: center;
  justify-content: center;
  flex-direction: column;
  gap: 10px;
  h1 {
    margin-bottom: 0px;
  }
`;

const ButtonsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
  .ui--Button {
    width: 100px;
    text-align: center;
  }
`;

export default React.memo(Assess);