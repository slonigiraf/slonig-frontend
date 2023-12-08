// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import InsurancesList from './InsurancesList.js';
import { IPFS } from 'ipfs-core';
import { useTranslation } from '../translate.js';
import { InputAddress } from '@polkadot/react-components';
import type { KeyringPair } from '@polkadot/keyring/types';
import { keyring } from '@polkadot/ui-keyring';
import { u8aToHex } from '@polkadot/util';
import { useLocation } from 'react-router-dom';
import { QRWithShareAndCopy, nameFromKeyringPair, getBaseUrl, QRAction } from '@slonigiraf/app-slonig-components';

interface Props {
  className?: string;
  ipfs: IPFS;
}

function Teacher({ className = '', ipfs }: Props): React.ReactElement<Props> {
  const [currentPair, setCurrentPair] = useState<KeyringPair | null>(() => keyring.getPairs()[0] || null);
  const { t } = useTranslation();
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const student = queryParams.get("student") || "";

  const _onChangeAccount = useCallback(
    (accountId: string | null) => accountId && setCurrentPair(keyring.getPair(accountId)),
    []
  );

  const publicKeyHex = currentPair ? u8aToHex(currentPair.publicKey) : "";
  const name = nameFromKeyringPair(currentPair);
  const qrData = {
    q: QRAction.SHOW_TEACHER_IDENTITY,
    n: name,
    p: publicKeyHex,
  };
  const qrCodeText = JSON.stringify(qrData);
  const url = getBaseUrl() + `/#/diplomas?teacher=${publicKeyHex}&name=${encodeURIComponent(name)}`;

  return (
    <div className={`toolbox--Student ${className}`}>
      {/* The div below helps initialize account */}
      <div className='ui--row' style={{ display: 'none' }}>
        <InputAddress
          className='full'
          isInput={false}
          label={t('account')}
          type='account'
          onChange={_onChangeAccount}
        />
      </div>
      {
        student === "" ? <>
          <h2>{t('Show to a student to see their results')}</h2>
          <QRWithShareAndCopy
            dataQR={qrCodeText}
            titleShare={t('QR code')}
            textShare={t('Press the link to show diplomas')}
            urlShare={url}
            dataCopy={url} />
        </>
          :
          <div className='ui--row'>
            <InsurancesList ipfs={ipfs} teacher={u8aToHex(currentPair?.publicKey)} student={student} />
          </div>
      }
    </div>
  )
}

export default React.memo(Teacher);