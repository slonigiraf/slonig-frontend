import React from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { VerticallyCenteredModal } from './index.js';
interface Props {
  knowledgeId: string;
  student?: string;
  onClose: () => void;
  onConfirm: () => void;
}

function ResultsReminder({ knowledgeId, student='', onClose, onConfirm }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();
  const yes = t('Yes');
  const no = t('No');


  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size="tiny"
    >
      <Modal.Content>
        
        <Title>{student? t('You have forgotten to send lesson results') : t('You have forgotten to receive lesson results')}</Title>
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

export default React.memo(ResultsReminder);