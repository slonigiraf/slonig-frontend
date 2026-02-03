import React from 'react';
import { useTranslation } from '../translate.js';
import { styled } from '@polkadot/react-components';
import { CenterQRContainer, FullscreenActivity, nameFromKeyringPair, ScanQR, SenderComponent, useLoginContext } from '@slonigiraf/slonig-components';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  onClose: () => void;
}

function UnblockTutoring({ onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [isQrShown, toggleIsQrShown] = useToggle();
  const { currentPair } = useLoginContext();
  const name = nameFromKeyringPair(currentPair);

  const data = JSON.stringify({
    name,
  })

  return (
    <FullscreenActivity caption='' onClose={onClose} >
      <StyledDiv>
        {isQrShown ?
          <CenterQRContainer>
            <h1>{t('🚫 Your tutoring is paused')}</h1>
            <SenderComponent
              caption={t('Ask a teacher to scan:')}
              data={data}
              route={'badges/assess'}
              textShare={t('Press the link to start tutoring')}
              onDataSent={toggleIsQrShown}
            />
          </CenterQRContainer>
          :
          <>
            <h1>{t('Scan the teacher’s QR code')}</h1>
            <ScanQR label={t('Scan')} />
          </>
        }
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

export default React.memo(UnblockTutoring);
