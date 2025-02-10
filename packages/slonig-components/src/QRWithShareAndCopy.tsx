import React from 'react';
import QRCode from 'qrcode.react';
import ShareButton from './ShareButton.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';
import { styled } from '@polkadot/react-components';
import { qrWidthPx } from './index.js';

interface Props {
    className?: string;
    titleShare: string;
    textShare: string;
    urlShare: string;
    dataCopy: string;
    isDisabled?: boolean;
}

function QRWithShareAndCopy({ className, titleShare, textShare, urlShare, dataCopy, isDisabled = false }: Props): React.ReactElement<Props> {
    return (
        <StyledDiv>
            <div>
                <div
                    className='qr--row'
                    style={{ display: isDisabled ? 'none' : '', paddingTop: '5px' }}
                >
                    {/* This size of QR code was set to allow accounts page show Slon balance without scroll on Redmi 9C NFC */}
                    <QRCode value={urlShare} size={qrWidthPx} />
                </div>

                <div
                    className='qr--row'
                    style={{ display: isDisabled ? 'none' : '' }}
                >
                    <ShareButton title={titleShare} text={textShare} url={urlShare} isDisabled={isDisabled} />
                    <ClipboardCopyButton text={dataCopy} isDisabled={isDisabled} />
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
  @media (min-width: 500px) {
    width: 400px;
  }
`;

export default React.memo(QRWithShareAndCopy);