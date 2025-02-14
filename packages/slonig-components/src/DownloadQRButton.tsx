import React, { useRef, useEffect, useState } from 'react';
import QRCode from 'qrcode.react';
import { Button } from '@polkadot/react-components';

interface Props {
  data: string;
  label: string;
  fileName: string;
}

const DownloadQRButton: React.FC<Props> = ({ data, label, fileName }) => {
  const qrContainerRef = useRef<HTMLDivElement | null>(null);
  const [qrGenerated, setQrGenerated] = useState(false);

  useEffect(() => {
    setQrGenerated(true);
  }, []);

  const downloadQR = () => {
    if (qrContainerRef.current) {
      // Select the canvas inside the div
      const canvas = qrContainerRef.current.querySelector('canvas');
      if (canvas) {
        const url = canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.png`;
        link.click();
      }
    }
  };

  return (
    <div>
      {/* Hidden QR Code Canvas */}
      <div ref={qrContainerRef} style={{ display: 'inline-block' }}>
        {qrGenerated && (
          <QRCode
            value={data}
            size={256}
            renderAs="canvas"
          />
        )}
      </div>
      
      {/* Download Button */}
      <Button icon='download' label={label} onClick={downloadQR} />
    </div>
  );
};

export default DownloadQRButton;