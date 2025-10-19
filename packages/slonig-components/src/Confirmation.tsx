import React from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { VerticallyCenteredModal } from './index.js';
interface Props {
  question: string;
  onClose: () => void;
  onConfirm: () => void;
}

function Confirmation({ question, onClose, onConfirm }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();

  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size="tiny"
    >
      <Modal.Content>
        <Title>{question}</Title>
        <br />
        <ButtonsRow>
          <Button className='highlighted--button' label={t('Yes')} onClick={onConfirm} />
          <Button className='highlighted--button' label={t('No')} onClick={onClose} />
        </ButtonsRow>
      </Modal.Content>
    </VerticallyCenteredModal>
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

export default React.memo(Confirmation);