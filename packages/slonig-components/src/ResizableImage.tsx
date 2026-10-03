import React, { useRef, useState, useEffect } from 'react';
import { Spinner, styled } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { Modal } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useIpfsContext } from './index.js';
import { getIPFSBytesFromContentID } from '@slonigiraf/slonig-components';
import { fileTypeFromBuffer } from 'file-type';

interface BaseProps {
  alt?: string;
  className?: string;
  id?: string;
  style?: React.CSSProperties;
  title?: string;
  'data-tikz-image-id'?: string;
}

type Props = BaseProps & (
  { cid: string; src?: never } |
  { cid?: never; src: string }
);

const ResizableImage: React.FC<Props> = ({ cid, alt, className, id, src: sourceSrc, style, title, 'data-tikz-image-id': tikzImageId }) => {
  const { t } = useTranslation();
  const { ipfs, isIpfsReady } = useIpfsContext();
  const [isBig, toggleSize] = useToggle();
  const [scale, setScale] = useState(1); // State to handle image scale
  const [src, setSrc] = useState<string | null>(null); // State for the image source
  const lastPinchDistance = useRef(0); // Ref to store the last pinch distance

  // Fetch image from IPFS using the CID and utility function
  useEffect(() => {
    const fetchImage = async () => {
      if (!cid) return;

      try {
        const bytes = await getIPFSBytesFromContentID(ipfs, cid);

        // Check if the bytes represent an SVG
        const textDecoder = new TextDecoder('utf-8');
        const content = textDecoder.decode(bytes.slice(0, 100)); // Read the first 100 bytes as text
        const isSvg = content.trim().startsWith('<svg');

        if (isSvg) {
          // Create a Blob for the SVG and set the source
          const svgBlob = new Blob([bytes], { type: 'image/svg+xml' });
          setSrc(URL.createObjectURL(svgBlob));
          return;
        }

        // Handle non-SVG content with file-type detection
        const fileType = await fileTypeFromBuffer(bytes);
        const mimeType = fileType?.mime || 'application/octet-stream';
        const blob = new Blob([bytes], { type: mimeType });
        setSrc(URL.createObjectURL(blob));
      } catch (error) {
        console.error('Error fetching or processing the image from IPFS:', error);
      }
    };

    if (!sourceSrc && cid && isIpfsReady) {
      fetchImage();
    }
  }, [cid, ipfs, isIpfsReady, sourceSrc]);

  const imageSrc = sourceSrc || src;

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

  return (imageSrc ?
    <>
      <NormalImage
        className={className}
        data-tikz-image-id={tikzImageId}
        id={id}
        src={imageSrc}
        alt={alt ? alt : t('Image')}
        onClick={toggleSize}
        style={style}
        title={title}
      />
      {isBig && (
        <ImageModal header=" " onClose={handleToggleSize} size="large">
          <Modal.Content>
            <Viewport onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}>
              <BigImage src={imageSrc} alt={alt ? alt : t('Image')} style={{ transform: `scale(${scale})` }} />
            </Viewport>
          </Modal.Content>
        </ImageModal>
      )}
    </> :
    <NormalImageAlt>
      <Spinner noLabel />
    </NormalImageAlt>
  );
};

const NormalImage = styled.img`
  cursor: zoom-in;
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

export default React.memo(ResizableImage);
