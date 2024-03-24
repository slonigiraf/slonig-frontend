import React from 'react';
import { styled } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import { Modal } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

interface Props {
  src: string;
  alt?: string;
}

const ResizableImage: React.FC<Props> = ({ src, alt}) => {
  const { t } = useTranslation();
  const [isBig, toggleSize] = useToggle();
  return (
    <>
      <NormalImage src={src} alt={alt? alt : t('Image')} onClick={toggleSize} />
      {isBig && (
        <Modal
          header=' '
          onClose={toggleSize}
          size='large'
        >
          <Modal.Content>
            <BigImage src={src} alt={alt? alt : t('Image')} />
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
`;
export default React.memo(ResizableImage);
