import React from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
interface Props {
  info: string;
  onClose: () => void;
}

function Confirmation({ info: question, onClose }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();

  return (
    <StyledModal
      header=''
      onClose={onClose}
      size="tiny"
    >
      <Modal.Content>
        <Title>{question}</Title>
        <br />
        <ButtonsRow>
          <Button className='highlighted--button' label={t('OK')} onClick={onClose} />
        </ButtonsRow>
      </Modal.Content>
    </StyledModal>
  );
}
const ButtonsRow = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
  .ui--Button {
    width: 100px;
    text-align: center;
  }
`;

const Title = styled.h1`
  width: 100%;
  text-align: center;
  margin: 0.5rem 0 0;
`;

const StyledModal = styled(Modal)`
  button[data-testid='close-modal'] {
    opacity: 0;
    background: transparent;
    border: none;
    cursor: pointer;
  }
  button[data-testid='close-modal']:focus {
    outline: none;
  }
  .ui--Modal-Header {
    display: none !important;
  }
`;

export default React.memo(Confirmation);