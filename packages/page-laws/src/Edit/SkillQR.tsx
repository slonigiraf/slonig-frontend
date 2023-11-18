// Copyright 2021-2022 @slonigiraf/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import QRCode from 'qrcode.react';
import { useTranslation } from '../translate';
import { u8aToHex } from '@polkadot/util';

interface Props {
  className?: string;
  cid: string;
  currentPair: KeyringPair | null;
}

function SkillQR({ className = '', cid, currentPair }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  
  const publicKeyU8 = currentPair.publicKey;
  const publicKeyHex = u8aToHex(publicKeyU8);
  const qrText = `{"q": 0,"d": "diplomas/mentor?cid=${cid}&student=${publicKeyHex}"}`;

  return (
    <>
      <h3>{t('Show the QR to your mentor')}</h3>
      <QRCode value={qrText} />
    </>
  );
}

export default React.memo(SkillQR);