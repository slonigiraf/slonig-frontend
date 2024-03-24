import React, { useRef, useState } from 'react';
import { styled } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { Modal } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { FullWidthContainer } from './index.js';

interface Props {
  src: string;
  alt?: string;
}

const ResizableImage: React.FC<Props> = ({ src, alt }) => {
  const { t } = useTranslation();
  const [isBig, toggleSize] = useToggle();
  const [scale, setScale] = useState(1); // State to handle image scale
  const lastPinchDistance = useRef(0); // Ref to store the last pinch distance

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

  return (
    <>
      <NormalImage src={src} alt={alt ? alt : t('Image')} onClick={toggleSize} />
      {isBig && (
        <Modal header=" " onClose={toggleSize} size="large">
          <Modal.Content>
            <FullWidthContainer onTouchStart={handleTouchStart} onTouchMove={handleTouchMove}>
              <BigImage src={src} alt={alt ? alt : t('Image')} style={{ transform: `scale(${scale})` }} />
            </FullWidthContainer>
          </Modal.Content>
        </Modal>
      )}
    </>
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