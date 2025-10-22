import React from 'react';
import { KatexSpan } from '@slonigiraf/app-slonig-components';
import QRCode from 'qrcode.react';
import { Button, styled } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

interface Props {
  className?: string;
  knowledgeId: string;
  caption: string;
  setIsClassInstructionShown: (isShown: boolean) => void;
}

function ClassInstruction({ className = '', knowledgeId, caption, setIsClassInstructionShown }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const url = `https://app.slonig.org/#/knowledge?id=${knowledgeId}&lesson`;

  const printPage = (): void => {
    window.print();
  };

  return (
    <FullWindow className={className}>
      <CenterContainer>
        <h1><KatexSpan content={caption} /></h1>
        <Steps>
          <Step>
            <h2>{'1. ' + t('Tutee scans this QR code')}</h2>
            <QRWrapper><QRCode value={url} style={{ width: '100%', height: '100%' }} renderAs="canvas" /></QRWrapper>
          </Step>
          <Step>
            <h2>{'2. ' + t('Tutor scans a QR code from the tutee’s device')}</h2>
            <img src="./scan_qr.png" style={{ maxWidth: '100%' }} alt="Scan QR" />
          </Step>
          <Step>
            <h2>{'3. ' + t('Tutor helps the tutee face to face, using hints from the app')}</h2>
            <img src="./signup.png" style={{ maxWidth: '100%' }} alt="Signup" />
          </Step>
        </Steps>
        <ButtonsRow className="no-print">
          <Button
            icon='print'
            label={t('Print')}
            onClick={printPage}
          />
          <Button
            icon='close'
            label={t('Close')}
            onClick={() => setIsClassInstructionShown(false)}
          />
        </ButtonsRow>
      </CenterContainer>
    </FullWindow>
  );
}

const Steps = styled.div`
  display: flex;
  justify-content: center;
  align-items: stretch; /* make all Steps equal height */
  width: 95%;
  flex-wrap: nowrap;
  gap: 10px;
`;

const Step = styled.div`
  flex: 0 0 33%;
  display: flex;
  flex-direction: column;
  justify-content: flex-start; /* keep inner content natural */
  align-items: center;
  box-shadow: 0 0 8px rgba(0,0,0,0.1);
  border: 3px solid #F39200;
  padding: 10px;
  box-sizing: border-box;
  background: white;
`;

const QRWrapper = styled.div`
  width: 66%;
  display: flex;
  justify-content: center;
  align-items: center;
  flex-shrink: 0;
  margin-top: 10px;
  margin-bottom: 10px;
`;


const ButtonsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 20px;

  .ui--Button {
    text-align: center;
    margin: 5px;
  }
`;

const FullWindow = styled.div`
  position: fixed;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 999;
  background: var(--bg-page);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;

  @media print {
    background: white;
    color: black;
    .no-print {
      display: none !important;
    }
  }
`;

const CenterContainer = styled.div`
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 100%;
  margin: 0 auto;
  @media (min-width: 430px) {
    max-width: 800px;
  }
  min-height: 100%;
  padding-bottom: 10px;
  h1 {
    margin-bottom: 20px;
  }
`;

export default React.memo(ClassInstruction);