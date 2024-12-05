import React, { useRef, useState, useEffect } from 'react';
import { Spinner, styled } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { Modal } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { FullWidthContainer, useIpfsContext } from './index.js';
import { getIPFSBytesFromContentID } from '@slonigiraf/app-slonig-components';
import { fileTypeFromBuffer } from 'file-type';

interface Props {
  cid: string;
  alt?: string;
}

const ResizableImage: React.FC<Props> = ({ cid, alt }) => {
  const { t } = useTranslation();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [isBig, toggleSize] = useToggle();
  const [scale, setScale] = useState(1); // State to handle image scale
  const [src, setSrc] = useState<string | null>(null); // State for the image source
  const lastPinchDistance = useRef(0); // Ref to store the last pinch distance

  // Fetch image from IPFS using the CID and utility function
  useEffect(() => {
    const fetchImage = async () => {
      try {
        const bytes = await getIPFSBytesFromContentID(ipfs, cid);
        const fileType = await fileTypeFromBuffer(bytes);
        const mimeType = fileType?.mime || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mimeType });
        setSrc(URL.createObjectURL(blob));
      } catch (error) {
        console.error('Error fetching or processing the image from IPFS:', error);
      }
    };
    if (isIpfsReady) {
      fetchImage()
    };
  }, [cid, ipfs, isIpfsReady]);

  const handleToggleSize = () => {
    if (isBig) {
      setScale(1);
    }
    toggleSize();
  };

  const handleTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 2) {
      // Calculate the distance between the two fingers
      const dx = event.touches[0].pageX - event.touches[1].pageX;
      const dy = event.touches[0].pageY - event.touches[1].pageY;
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (lastPinchDistance.current !== 0) {
        // Calculate the difference in distance between current and last pinch
        const distanceChange = distance - lastPinchDistance.current;
        // Adjust scale based on the change in distance
        setScale((prevScale) => Math.max(1, prevScale + distanceChange / 200));
      }

      // Update the last pinch distance
      lastPinchDistance.current = distance;
    }
  };

  const handleTouchStart = () => {
    // Reset last pinch distance when a new touch gesture starts
    lastPinchDistance.current = 0;
  };

  return (src? 
    <>
      <NormalImage src={src} alt={alt ? alt : t('Image')} onClick={toggleSize} />
      {isBig && (
        <Modal header=" " onClose={handleToggleSize} size="large">
          <Modal.Content>
            <FullWidthContainer onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}>
              <BigImage src={src} alt={alt ? alt : t('Image')} style={{ transform: `scale(${scale})` }} />
            </FullWidthContainer>
          </Modal.Content>
        </Modal>
      )}
    </> : <Spinner label=' '/>
  );
};

const NormalImage = styled.img`
  padding-top: 5px;
  width: 100%;
  @media (min-width: 768px) {
    width: 400px;
  }
`;

const BigImage = styled.img`
  padding-top: 5px;
  width: 100%;
  transform-origin: center;
`;

export default React.memo(ResizableImage);