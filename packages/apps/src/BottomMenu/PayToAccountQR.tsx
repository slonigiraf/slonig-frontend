import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import React, { useState, useCallback } from 'react';
import { InputAddress } from '@polkadot/react-components';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, getBaseUrl, nameFromKeyringPair, QRAction, useLoginContext } from '@slonigiraf/app-slonig-components';

function PayToAccountQR(): React.ReactElement {
  const { t } = useTranslation();
  const {
    currentPair,
  } = useLoginContext();

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.TRANSFER,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url = getBaseUrl() + `/#/accounts?name=${encodeURIComponent(name)}&recipientHex=${publicKeyHex}`;

  return (
    <>
      <QRWithShareAndCopy
        dataQR={qrCodeText}
        titleShare={t('QR code')}
        textShare={t('Press the link to send Slon')}
        urlShare={url}
        dataCopy={url} />
    </>
  );
}

export default React.memo(PayToAccountQR);