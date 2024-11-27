import React from 'react';
import { useTranslation } from './translate.js';
import { Button, Modal, styled } from '@polkadot/react-components';
interface Props {
    onClose: () => void;
    onConfirm: () => void;
}

function Confirmation({onClose, onConfirm}: Props): React.ReactElement<Props> | null {
    const { t } = useTranslation();
   
    return (
        <StyledModal
                header={t('Are you sure you want to delete it?')}
                onClose={onClose}
                size="small"
            >
                <Modal.Content>
                    <StyledDiv>
                        <Button icon="check" label={t('Yes')} onClick={onConfirm} />
                        <Button icon="close" label={t('No')} onClick={onClose} />
                    </StyledDiv>
                </Modal.Content>
            </StyledModal>
    );
}
const StyledDiv = styled.div`
  width: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
  column-gap: 40px;
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
`;
export default React.memo(Confirmation);