import React from 'react';
import QRCode from 'qrcode.react';
import ShareButton from './ShareButton.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import { styled } from '@polkadot/react-components';

interface QRWithShareAndCopyProps {
    dataQR: string;
    titleShare: string;
    textShare: string;
    urlShare: string;
    dataCopy: string;
}

function QRWithShareAndCopy({ dataQR, titleShare, textShare, urlShare, dataCopy }: QRWithShareAndCopyProps): React.ReactElement<QRWithShareAndCopyProps> {
    return (
        <StyledDiv>
            <div>
                <div className='ui--row'>
                    <QRCode value={dataQR} />
                </div>
                <div className='ui--row'>
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
  .ui--row {
    justify-content: center;
    align-items: center;
  }
`;

export default React.memo(QRWithShareAndCopy);