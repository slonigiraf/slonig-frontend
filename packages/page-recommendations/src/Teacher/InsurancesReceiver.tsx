// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useEffect, useState } from 'react';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { useLocation, useNavigate } from 'react-router-dom';
import { parseJson, useLoginContext, receiveWebRTCData, useInfo, InsurancesTransfer, Person } from '@slonigiraf/app-slonig-components';
import { QRField, storeInsurances, storePseudonym } from '@slonigiraf/db';

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
  const { showInfo, hideInfo } = useInfo();
  const [insurancesTransfer, setInsurancesTransfer] = useState<InsurancesTransfer | null>(null);
  const [triedToFetchData, setTriedToFetchData] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    setTriedToFetchData(false);
    setInsurancesTransfer(null);
  }, [webRTCPeerId, setTriedToFetchData, setInsurancesTransfer]);

  useEffect(() => {
    const fetchInsurancesTransfer = async () => {
      if (webRTCPeerId) {
        const maxLoadingSec = 30;
        showInfo(t('Loading'), 'info', maxLoadingSec);
        try {
          const webRTCData = await receiveWebRTCData(webRTCPeerId, maxLoadingSec * 1000);
          hideInfo();
          const receivedInsurancesTransfer: InsurancesTransfer = parseJson(webRTCData);
          if (receivedInsurancesTransfer.employer === teacherPublicKeyHex) {
            setInsurancesTransfer(receivedInsurancesTransfer);
          } else {
            showInfo(t('Student has shown you a QR code created for a different teacher. Ask them to scan your QR code.'), 'error');
            navigate('', { replace: true });
          }
        } catch (e) {
          showInfo(t('Ask the sender to refresh the QR page and keep it open while sending data.'), 'error');
          navigate('', { replace: true });
        }
      }
    };
    if (webRTCPeerId && !triedToFetchData) {
      setTriedToFetchData(true);
      fetchInsurancesTransfer();
    }
  }, [showInfo, webRTCPeerId, hideInfo, setInsurancesTransfer, parseJson, setTriedToFetchData]);

  useEffect(() => {
    const storeToDb = async () => {
      if (insurancesTransfer) {
        await storePseudonym(insurancesTransfer.identity, insurancesTransfer.name);
        await storeInsurances(insurancesTransfer);
        navigate('', { replace: true });
        const worker: Person = { identity: insurancesTransfer.identity, name: insurancesTransfer.name }
        setWorker(worker);
      }
    };
    storeToDb();
  }, [insurancesTransfer, storePseudonym, storeInsurances, setWorker]);


  return <></>;

}

export default React.memo(InsurancesReceiver);