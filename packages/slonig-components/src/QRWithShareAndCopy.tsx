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
                    <QRCode value={dataQR} />
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
  max-width: 250px;
  .qr--row {
    display: flex;
    justify-content: center;
    align-items: center;
  }
`;

export default React.memo(QRWithShareAndCopy);