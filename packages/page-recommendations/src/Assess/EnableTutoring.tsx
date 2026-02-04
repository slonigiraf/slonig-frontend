import React from 'react';
import { useTranslation } from '../translate.js';
import { styled } from '@polkadot/react-components';
import { BadTutorTransfer, CenterQRContainer, EnableTutoringRequest, FullscreenActivity, SenderComponent } from '@slonigiraf/slonig-components';


interface Props {
  onClose: () => void;
  tutor: BadTutorTransfer;
}

function EnableTutoring({ onClose, tutor }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const data: EnableTutoringRequest = {
    tutor: tutor.identity,
  }

  return (
    <FullscreenActivity caption='' onClose={onClose} >
      <StyledDiv>
        <CenterQRContainer>
            <h1>{t('{{tutorName}} provided a poor tutoring session; please listen to how {{tutorName}} teaches', {replace: {tutorName: tutor.name}})}</h1>
            <SenderComponent
              caption={t('To start, ask {{tutorName}} to scan:', {replace: {tutorName: tutor.name}})}
              data={JSON.stringify(data)}
              route={'badges/teach'}
              textShare={t('Press the link to unlock tutoring')}
              onDataSent={onClose}
            />
          </CenterQRContainer>
      </StyledDiv>
    </FullscreenActivity>
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
    margin-top: 0px;
    margin-bottom: 0px;
  }
`;

export default React.memo(EnableTutoring);
