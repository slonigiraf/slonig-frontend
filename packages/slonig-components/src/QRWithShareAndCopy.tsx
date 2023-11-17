import React from 'react';
import QRCode from 'qrcode.react';
import ShareButton from './ShareButton.js';
import ClipboardCopyButton from './ClipboardCopyButton.js';

interface QRWithShareAndCopyProps {
    dataQR: string;
    titleShare: string;
    textShare: string;
    urlShare: string;
    dataCopy: string;
}

function QRWithShareAndCopy({ dataQR, titleShare, textShare, urlShare, dataCopy }: QRWithShareAndCopyProps): React.ReactElement<QRWithShareAndCopyProps> {
    return (
        <div className='ui--qr'>
            <div className='ui--row'>
              <QRCode value={dataQR} />
            </div>
            <div className='ui--row'>
              <ShareButton title={titleShare} text={textShare} url={urlShare} />
              <ClipboardCopyButton text={dataCopy} />
            </div>
        </div>
    );
}

export default QRWithShareAndCopy;