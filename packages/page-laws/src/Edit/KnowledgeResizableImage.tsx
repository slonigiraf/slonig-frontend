import React, { useEffect, useRef, useState } from 'react';
import { Modal, Spinner, styled } from '@polkadot/react-components';
import { useIpfsContext } from '@slonigiraf/slonig-components';
import { getCachedIpfsImageUrl, loadCachedIpfsImageUrl } from './ipfsImageCache.js';

interface Props {
  alt?: string;
  cid: string;
}

/**
 * Keeps the existing ResizableImage interaction used by knowledge images
 * (click -> modal, pinch to zoom), while constraining the initial popup image
 * to the available viewport in both directions.
 */
export default function KnowledgeResizableImage ({ alt = 'Image', cid }: Props): React.ReactElement {
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [isBig, setIsBig] = useState(false);
  const [scale, setScale] = useState(1);
  const [src, setSrc] = useState<string | null>(() => getCachedIpfsImageUrl(cid) ?? null);
  const lastPinchDistance = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const cached = getCachedIpfsImageUrl(cid);

    // Reuse the same browser blob URL immediately on a tab switch. Do not
    // revoke it when the pane unmounts; the bounded shared LRU owns its life.
    setSrc(cached ?? null);

    if (isIpfsReady && !cached) {
      void loadCachedIpfsImageUrl(ipfs, cid)
        .then((url) => { if (!cancelled) setSrc(url); })
        .catch((error: unknown) => console.error('Error fetching or processing the image from IPFS:', error));
    }

    return () => { cancelled = true; };
  }, [cid, ipfs, isIpfsReady]);

  const close = (): void => {
    setScale(1);
    setIsBig(false);
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>): void => {
    if (event.touches.length !== 2) {
      return;
    }

    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (lastPinchDistance.current !== 0) {
      const distanceChange = distance - lastPinchDistance.current;
      setScale((previous) => Math.max(1, previous + distanceChange / 200));
    }

    lastPinchDistance.current = distance;
  };

  if (!src) {
    return <NormalImageAlt><Spinner noLabel /></NormalImageAlt>;
  }

  return <>
    <NormalImage alt={alt} src={src} onClick={() => setIsBig(true)} />
    {isBig && <ImageModal header=" " onClose={close} size="large">
      <Modal.Content>
        <Viewport
          onTouchMove={handleTouchMove}
          onTouchStart={() => { lastPinchDistance.current = 0; }}
        >
          <BigImage
            alt={alt}
            src={src}
            style={{ transform: `scale(${scale})` }}
          />
        </Viewport>
      </Modal.Content>
    </ImageModal>}
  </>;
}

const NormalImage = styled.img`
  cursor: zoom-in;
  max-height: 18rem;
  max-width: min(100%, 32rem);
  object-fit: contain;
  padding-top: 5px;
  width: 150px;
`;

const NormalImageAlt = styled.div`
  padding-top: 5px;
  width: 150px;
`;

const ImageModal = styled(Modal)`
  .ui--Modal__body {
    box-sizing: border-box;
    max-height: calc(100dvh - 16px);
    max-width: calc(100vw - 16px);
    overflow: auto;
  }
`;

const Viewport = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 0;
  overflow: auto;
  width: 100%;
`;

const BigImage = styled.img`
  display: block;
  height: auto;
  margin: 0 auto;
  max-height: calc(100dvh - 9rem);
  max-width: 100%;
  object-fit: contain;
  padding-top: 5px;
  transform-origin: center center;
  width: 100%;
`;
