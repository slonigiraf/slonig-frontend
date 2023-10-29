import { useTranslation } from '../translate.js';
import { Button, Modal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import React from 'react';
import PayToAccountQr from './PayToAccountQr';

function GetSLON(): React.ReactElement {
  const { t } = useTranslation();
  const [isQrOpen, toggleQr] = useToggle();

  const _onClick = () => {
    toggleQr();
  }

  return (
    <>
    <Button
          icon='dollar'
          label=''
          onClick={_onClick}
        />
    <br /><span>{t('Get SLON')}</span>
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