import React, { useCallback, useEffect, useRef, useState } from 'react';
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

function QrScannerComponent({
  onResult,
  initialFacingMode = 'environment',
  className = ''
}: Props): React.ReactElement<Props> {
  const { t } = useTranslation();

  const [facingMode, setFacingMode] = useState<FacingMode>(initialFacingMode);
  const [isSwitching, setIsSwitching] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scannerRef = useRef<QrScanner | null>(null);
  const onResultRef = useRef(onResult);
  const didEmitRef = useRef(false);

  // keep latest callback without recreating scanner
  useEffect(() => {
    onResultRef.current = onResult;
  }, [onResult]);

  // Create scanner ONCE
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    video.setAttribute('playsinline', 'true');

    const scanner = new QrScanner(
      video,
      (result) => {
        if (didEmitRef.current) return;
        didEmitRef.current = true;
        try {
          scanner.pause();
        } catch {
        }
        onResultRef.current(result.data);
      },
      { preferredCamera: initialFacingMode }
    );

    scanner.setInversionMode('both');
    scannerRef.current = scanner;

    scanner.start().catch((e) => console.error('Failed to start QR scanner:', e));

    return () => {
      scanner.stop();
      scanner.destroy();
      scannerRef.current = null;
    };
    // only once on mount (initialFacingMode is fine to read here)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch camera via setCamera (async) — no recreate
  const changeCamera = useCallback(async () => {
    const scanner = scannerRef.current;
    if (!scanner || isSwitching) return;

    const next: FacingMode = facingMode === 'user' ? 'environment' : 'user';

    try {
      setIsSwitching(true);
      await scanner.setCamera(next); // <-- key fix (async)
      setFacingMode(next);
    } catch (e) {
      console.error('Failed to switch camera:', e);
    } finally {
      setIsSwitching(false);
    }
  }, [facingMode, isSwitching]);

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

      <Button
        icon="repeat"
        label={t('Change camera')}
        onClick={changeCamera}
        isDisabled={isSwitching}
      />
    </div>
  );
}

export default React.memo(styled(QrScannerComponent)`
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

  .ui--qr-Scan-container {
    position: relative;
    width: 100%;
    aspect-ratio: 1 / 1;
    overflow: hidden;
    background: #000;

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