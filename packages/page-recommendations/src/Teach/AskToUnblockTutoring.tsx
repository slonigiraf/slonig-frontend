import React from 'react';
import { useTranslation } from '../translate.js';
import { Button, styled } from '@polkadot/react-components';
import { BadTutorTransfer, CenterQRContainer, FullscreenActivity, nameFromKeyringPair, ScanQR, SenderComponent, useLoginContext } from '@slonigiraf/slonig-components';
import { useToggle } from '@polkadot/react-hooks';
import { u8aToHex } from '@polkadot/util';

interface Props {
  onClose: () => void;
  student: string;
}

function AskToUnblockTutoring({ onClose, student }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [isQrShown, toggleIsQrShown] = useToggle(true);
  const { currentPair } = useLoginContext();
  const name = nameFromKeyringPair(currentPair);

  const data: BadTutorTransfer = {
    identity: u8aToHex(currentPair?.publicKey),
    name,
    student,
  }

  return (
    <FullscreenActivity caption='' onClose={onClose} >
      <StyledDiv>
        {isQrShown ?
          <CenterQRContainer>
            <h1>{t('🚫 Your lesson is paused because it requires teacher supervision')}</h1>
            <SenderComponent
              caption={t('Ask a teacher to scan:')}
              data={JSON.stringify(data)}
              route={'badges/assess'}
              textShare={t('Press the link to start tutoring')}
              onDataSent={toggleIsQrShown}
            />
          </CenterQRContainer>
          :
          <>
            <h1>{t('Scan the teacher’s QR code')}</h1>
            <ScanQR label={t('Scan')} />
            <Button label={t('Reshow the QR')} onClick={toggleIsQrShown} />
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

export default React.memo(AskToUnblockTutoring);
