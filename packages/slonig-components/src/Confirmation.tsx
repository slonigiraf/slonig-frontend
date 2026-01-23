import React from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { VerticallyCenteredModal } from './index.js';
interface Props {
  question: string;
  agreeText?: string;
  disagreeText?: string;
  decorator?: React.ReactNode;
  onClose: () => void;
  onConfirm: () => void;
}

function Confirmation({ question, agreeText, disagreeText, decorator, onClose, onConfirm }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const yes = agreeText || t('Yes');
  const no = disagreeText || t('No');

  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size="tiny"
    >
      <Modal.Content>
        {decorator}
        <Title>{question}</Title>
        <br />
        <ButtonsRow>
          <Button className='highlighted--button' label={yes} onClick={onConfirm} />
          <Button className='highlighted--button' label={no} onClick={onClose} />
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