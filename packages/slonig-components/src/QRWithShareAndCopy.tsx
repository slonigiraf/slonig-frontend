import React from 'react';
import QRCode from 'qrcode.react';
import ShareButton from './ShareButton.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import { styled } from '@polkadot/react-components';

interface Props {
    className?: string;
    dataQR: string;
    titleShare: string;
    textShare: string;
    urlShare: string;
    dataCopy: string;
}

function QRWithShareAndCopy({ className, dataQR, titleShare, textShare, urlShare, dataCopy }: Props): React.ReactElement<Props> {
    return (
        <StyledDiv>
            <div>
                <div className='qr--row'>
                    {/* This size of QR code was set to allow accounts page show Slon balance without scroll on Redmi 9C NFC */}
                    <QRCode value={dataQR} size={260} />
                </div>
                <div className='qr--row'>
                    <ShareButton title={titleShare} text={textShare} url={urlShare} />
                    <ClipboardCopyButton text={dataCopy} />
                </div>
            </div>
        </StyledDiv>
    );
}

const StyledDiv = styled.div`
  display: flex;
  flex-direction: row;
  justify-content: center;
  align-items: center;
  width: 100%;
  .qr--row {
    display: flex;
    justify-content: center;
    align-items: center;
  }
  @media (min-width: 768px) {
    width: 400px;
  }
`;

export default React.memo(QRWithShareAndCopy);