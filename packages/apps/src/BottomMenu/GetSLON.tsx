import { useTranslation } from '../translate.js';
import { Button, Modal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import React from 'react';
import PayToAccountQr from './PayToAccountQr';
import { ButtonWithLabelBelow } from './ButtonWithLabelBelow';

function GetSLON(): React.ReactElement {
  const { t } = useTranslation();
  const [isQrOpen, toggleQr] = useToggle();

  const _onClick = () => {
    toggleQr();
  }

  return (
    <>
    <ButtonWithLabelBelow
          icon='dollar'
          label={t('Get SLON')}
          onClick={_onClick}
        />
    {isQrOpen && <>
        <Modal
          header={t('Show the Qr to a sender')}
          onClose={toggleQr}
          size='small'
        >
          <Modal.Content>
            <PayToAccountQr />
          </Modal.Content>
        </Modal>
      </>}
    </>
    
  );
}

export default GetSLON;