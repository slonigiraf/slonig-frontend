import { useTranslation } from '../translate.js';
import { Modal } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import React from 'react';
import PayToAccountQR from './PayToAccountQR.js';
import { ButtonWithLabelBelow } from '@slonigiraf/app-slonig-components';

function GetSlon(): React.ReactElement {
  const { t } = useTranslation();
  const [isQROpen, toggleQR] = useToggle();

  const _onClick = () => {
    toggleQR();
  }

  return (
    <>
    <ButtonWithLabelBelow
          icon='dollar'
          label={t('Get Slon')}
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

export default GetSlon;