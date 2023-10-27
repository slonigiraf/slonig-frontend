import { useTranslation } from '../translate.js';
import { Button, Modal, InputAddress } from '@polkadot/react-components';
import { useToggle } from '@polkadot/react-hooks';
import QRCode from 'qrcode.react';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import React, { useCallback, useState } from 'react';

function GetSLON(): React.ReactElement {
  const { t } = useTranslation();
  console.log("keyring: "+keyring);
  // const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const [isQrOpen, toggleQr] = useToggle();

  const _onChangeAccount = useCallback(
    (accountId: string | null) => {
      // accountId && setCurrentPair(keyring.getPair(accountId))
    },
    []
  );

  const _onClick = () => {
    toggleQr();
  }

  // console.log("currentPair: "+currentPair);
  const cidString = "";
  const publicKeyHex = "";
  const qrText = `{"q": 1,"d": "recommendations?cid=${cidString}&person=${publicKeyHex}"}`;

  const hiddenKeyringInitializer = <div className='ui--row' style={{ display: 'none' }}>
    <InputAddress
      className='full'
      help={t('select the account you wish to sign data with')}
      isInput={false}
      label={t('account')}
      onChange={_onChangeAccount}
      type='account'
    />
  </div>;

  return (
    <>
    {hiddenKeyringInitializer}
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
            <QRCode value={qrText} />
          </Modal.Content>
        </Modal>
      </>}
    </>
    
  );
}

export default GetSLON;