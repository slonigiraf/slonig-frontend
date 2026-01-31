import React, { ReactNode } from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
import { VerticallyCenteredModal } from './index.js';
interface Props {
  info: string;
  onClose: () => void;
  decorator?: ReactNode;
}

function OKBox({ info, onClose, decorator }: Props): React.ReactElement<Props> | null {
  const { t } = useTranslation();

  return (
    <VerticallyCenteredModal
      header=''
      onClose={onClose}
      size="tiny"
    >
      <Modal.Content>
        <Title>{info}</Title>
        {decorator && <><br />{decorator}</>}
        <br />
        <ButtonsRow>
          <Button className='highlighted--button' label={t('OK')} onClick={onClose} />
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


export default React.memo(OKBox);