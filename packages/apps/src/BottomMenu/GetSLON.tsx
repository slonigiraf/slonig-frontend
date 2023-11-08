import { useTranslation } from '../translate.js';
import { Button, Modal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import React from 'react';
import PayToAccountQR from './PayToAccountQR';
import { ButtonWithLabelBelow } from './ButtonWithLabelBelow';

function GetSLON(): React.ReactElement {
  const { t } = useTranslation();
  const [isQROpen, toggleQR] = useToggle();

  const _onClick = () => {
    toggleQR();
  }

  return (
    <>
    <ButtonWithLabelBelow
          icon='dollar'
          label={t('Get SLON')}
          onClick={_onClick}
        />
    {isQROpen && <>
        <Modal
          header={t('Show the QR to a sender')}
          onClose={toggleQR}
          size='small'
        >
          <Modal.Content>
            <PayToAccountQR />
          </Modal.Content>
        </Modal>
      </>}
    </>
    
  );
}

export default GetSLON;