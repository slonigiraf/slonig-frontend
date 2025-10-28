import React from 'react';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, getBaseUrl, nameFromKeyringPair, useLoginContext } from '@slonigiraf/slonig-components';

function PayToAccountQR(): React.ReactElement {
  const { t } = useTranslation();
  const { currentPair } = useLoginContext();

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const url = getBaseUrl() + `/#/accounts?name=${encodeURIComponent(name)}&recipientHex=${publicKeyHex}`;

  return (
    <>
      <QRWithShareAndCopy
        titleShare={t('QR code')}
        textShare={t('Press the link to send Slon')}
        urlShare={url}
        dataCopy={url} />
    </>
  );
}

export default React.memo(PayToAccountQR);