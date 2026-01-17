import React, { useEffect, useRef, useState } from 'react';
import styled from 'styled-components';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import QrScanner from 'qr-scanner';

type FacingMode = 'user' | 'environment';

interface Props {
  className?: string;
  onResult: (data: string) => void;
  initialFacingMode?: FacingMode; // default: environment
}

function QrScannerElement({
  onResult,
  initialFacingMode = 'environment',
  className = ''
}: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const [facingMode, setFacingMode] = useState<FacingMode>(initialFacingMode);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);

  const changeCamera = () => {
    setFacingMode((m) => (m === 'user' ? 'environment' : 'user'));
  };

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // iOS Safari: must be inline
    video.setAttribute('playsinline', 'true');

    // Clean up previous scanner instance (if any)
    if (scannerRef.current) {
      scannerRef.current.stop();
      scannerRef.current.destroy();
      scannerRef.current = null;
    }

    const scanner = new QrScanner(
      video,
      (result) => {
        onResult(result.data);
      },
      {
        preferredCamera: facingMode
      }
    );
    scanner.setInversionMode('both');

    scannerRef.current = scanner;

    scanner.start().catch((e) => {
      console.error('Failed to start QR scanner:', e);
    });

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
  }, [facingMode, onResult]);

  return (
    <div className={`qr-wrapper ${className}`}>
      <div className="qr-size">
        <section className={`ui--qr-Scan ${facingMode === 'user' ? 'mirrored' : ''}`}>
          <section className="ui--qr-Scan-container">
            <div className="ui--qr-Scan-focus" />
            <video ref={videoRef} muted />
          </section>
        </section>
      </div>

      <Button icon="repeat" label={t('Change camera')} onClick={changeCamera} />
    </div>
  );
}

export default React.memo(styled(QrScannerElement)`
  text-align: center;
  max-width: 30rem;
  margin: 0px auto;

  .qr-size {
    width: 100%;
  }

  .ui--qr-Scan {
    display: inline-block;
    width: 100%;
  }

  .ui--qr-Scan.mirrored {
    transform: matrix(-1, 0, 0, 1, 0, 0);
  }

  /* IMPORTANT: give the container height (aspect-ratio) */
  .ui--qr-Scan-container {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1; /* square scanner; change to 4/3 if you want */
    overflow: hidden;
    background: #000; /* so you see something before camera starts */

    video {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
  }

  .ui--qr-Scan-focus {
    position: absolute;
    inset: 0;
    z-index: 1;
    box-sizing: border-box;
    border: 50px solid rgba(0, 0, 0, 0.3);
    box-shadow: rgb(255 0 0 / 50%) 0px 0px 0px 5px inset;
    pointer-events: none;
  }
`);