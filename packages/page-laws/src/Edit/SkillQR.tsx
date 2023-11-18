// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { useTranslation } from '../translate';
import { u8aToHex } from '@polkadot/util';
import { QRWithShareAndCopy, getBaseUrl } from '@slonigiraf/app-slonig-components';
import { getAddressName } from '@polkadot/react-components';


interface Props {
  className?: string;
  cid: string;
  currentPair: KeyringPair | null;
}

function SkillQR({ className = '', cid, currentPair }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const publicKeyU8 = currentPair.publicKey;
  const publicKeyHex = u8aToHex(publicKeyU8);
  const [, , name] = getAddressName(currentPair.address, null, "");
  const qrData = {
    q: 5,
    n: name,
    p: publicKeyHex,
    d: `diplomas/mentor?cid=${cid}&student=${publicKeyHex}`,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url = getBaseUrl() + `/#/diplomas/mentor?cid=${cid}&student=${publicKeyHex}`;

  return (
    <>
      <h3>{t('Show the QR to your mentor')}</h3>
      <QRWithShareAndCopy
        dataQR={qrCodeText}
        titleShare={t('QR code')}
        textShare={t('Press the link to start mentoring')}
        urlShare={url}
        dataCopy={url}
      />
    </>
  );
}

export default React.memo(SkillQR);