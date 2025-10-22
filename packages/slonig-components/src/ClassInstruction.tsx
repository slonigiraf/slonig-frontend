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
            <QRCode value={url} style={{ width: '100%', height: '100%' }} renderAs="canvas" />
          </Step>
          <Step>
            <img src="./scan_qr.png" style={{ maxWidth: '100%' }} alt="Scan QR" />
          </Step>
          <Step>
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
  align-items: center;
  width: 100%;
  flex-wrap: nowrap;
`;

const Step = styled.div`
  flex: 0 0 33%;
  display: flex;
  justify-content: center;
  align-items: center;
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
`;

export default React.memo(ClassInstruction);