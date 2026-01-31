import React, { useLayoutEffect, useRef, useState } from 'react';
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

function QRWithShareAndCopy({
    className,
    titleShare,
    textShare,
    urlShare,
    dataCopy,
    isDisabled = false
}: Props): React.ReactElement<Props> {
    const wrapRef = useRef<HTMLDivElement | null>(null);
    const [qrSize, setQrSize] = useState<number>(qrWidthPx);

    useLayoutEffect(() => {
        const el = wrapRef.current;
        if (!el) return;

        const update = () => {
            // Available width inside the wrapper (with a small padding so it never touches edges)
            const padding = 16;
            const available = Math.floor(el.clientWidth - padding);

            // Clamp: never bigger than qrWidthPx, never smaller than 64
            const next = Math.max(64, Math.min(qrWidthPx, available));

            setQrSize(next);
        };

        update();

        const ro = new ResizeObserver(update);
        ro.observe(el);

        return () => ro.disconnect();
    }, []);

    return (
        <>
            <StyledDiv className={className}>
                <Inner ref={wrapRef}>
                    <div
                        className='qr--row'
                        style={{ display: isDisabled ? 'none' : '', paddingTop: '5px' }}
                    >
                        <QRCode value={urlShare} size={qrSize} />
                    </div>

                    <div
                        className='qr--row'
                        style={{ display: isDisabled ? 'none' : '' }}
                    >
                        <ShareButton title={titleShare} text={textShare} url={urlShare} isDisabled={isDisabled} />
                        <ClipboardCopyButton text={dataCopy} isDisabled={isDisabled} />
                    </div>
                </Inner>
            </StyledDiv>

            <ScanHint>
                <img src='./scan_qr.png' alt='Scan' />
            </ScanHint>
        </>
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

const Inner = styled.div`
  width: 100%;
  min-width: 0;
`;

const ScanHint = styled.div`
  display: flex;
  justify-content: center;
  width: 100%;

  img {
    width: 50%;
    max-width: 320px;
    height: auto;
  }
`;

export default React.memo(QRWithShareAndCopy);