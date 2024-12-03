// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRField, useLoginContext, useInfo, InsurancesTransfer, Person } from '@slonigiraf/app-slonig-components';
import { storeInsurances, storePseudonym } from '@slonigiraf/db';
import useFetchWebRTC from '../useFetchWebRTC.js';
interface Props {
  setWorker: (person: Person) => void;
}

function InsurancesReceiver({ setWorker }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(QRField.WEBRTC_PEER_ID);
  const { currentPair } = useLoginContext();
  const { t } = useTranslation();
  const teacherPublicKeyHex = u8aToHex(currentPair?.publicKey);
  const { showInfo } = useInfo();
  const navigate = useNavigate();

  useFetchWebRTC<InsurancesTransfer>(webRTCPeerId, async (insurancesTransfer) => {
    if (insurancesTransfer.employer === teacherPublicKeyHex) {
      await storePseudonym(insurancesTransfer.identity, insurancesTransfer.name);
      await storeInsurances(insurancesTransfer);
      navigate('', { replace: true });
      const worker: Person = { identity: insurancesTransfer.identity, name: insurancesTransfer.name }
      setWorker(worker);
    } else {
      showInfo(t('Student has shown you a QR code created for a different teacher. Ask them to scan your QR code.'), 'error');
      navigate('', { replace: true });
    }
  });

  return <></>;
}

export default React.memo(InsurancesReceiver);