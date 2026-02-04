// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback } from 'react';
import { useTranslation } from '../translate.js';
import { u8aToHex } from '@polkadot/util';
import { useLocation, useNavigate } from 'react-router-dom';
import { useLoginContext, useInfo, InsurancesTransfer, Person, UrlParams, useLog, BadTutorTransfer, OKBox } from '@slonigiraf/slonig-components';
import { getSetting, setSettingToTrue, SettingKey, storeInsurances, storePseudonym } from '@slonigiraf/db';
import useFetchWebRTC from '../useFetchWebRTC.js';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  setWorker: (person: Person) => void;
  setBadTutor: (badTutor: BadTutorTransfer) => void;
  setIsLoading: (loading: boolean) => void;
}

function InsurancesReceiver({ setWorker, setBadTutor, setIsLoading }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(UrlParams.WEBRTC_PEER_ID);
  const { currentPair } = useLoginContext();
  const { t } = useTranslation();
  const employer = u8aToHex(currentPair?.publicKey);
  const { showInfo } = useInfo();
  const { logEvent } = useLog();
  const navigate = useNavigate();
  const [isNotTeacherWarningShown, toggleIsNotTeacherWarningShown] = useToggle();

  const handleData = useCallback(async (data: InsurancesTransfer | BadTutorTransfer) => {
    if ('employer' in data) {
      if (data.employer === employer) {
        const assessmentTutorialWasCompleted = await getSetting(SettingKey.ASSESSMENT_TUTORIAL_COMPLETED);
        if (assessmentTutorialWasCompleted !== 'true') {
          logEvent('ONBOARDING', 'ASSESSMENT_TUTORIAL_COMPLETED');
          await setSettingToTrue(SettingKey.ASSESSMENT_TUTORIAL_COMPLETED);
        }
        logEvent('ASSESSMENT', 'RECEIVE_INSURANCE_DATA', 'insurances', data.insurances.length);
        await storePseudonym(data.identity, data.name);
        await storeInsurances(data);
        const worker: Person = { identity: data.identity, name: data.name }
        setWorker(worker);
      } else {
        showInfo(t('Student has shown you a QR code created for a different teacher. Ask them to scan your QR code.'), 'error');
      }
    } else {
      if (data.student === employer) {
        toggleIsNotTeacherWarningShown()
      } else{
        setBadTutor(data);
      }
    }
    setIsLoading(false);
    navigate('', { replace: true });
  }, [employer, navigate, setWorker, showInfo, t]);

  const onCloseTeacherWarning = useCallback(async () => {
    toggleIsNotTeacherWarningShown();
    const fallbackKnowledgeId = await getSetting(SettingKey.FALLBACK_KNOWLEDGE_ID);
    if (fallbackKnowledgeId) {
      navigate(`/knowledge?id=${fallbackKnowledgeId}`, { replace: true });
    } else {
      navigate(`/knowledge`, { replace: true });
    }
  }, [toggleIsNotTeacherWarningShown, getSetting, navigate]);

  useFetchWebRTC<InsurancesTransfer>(webRTCPeerId, handleData);

  return isNotTeacherWarningShown ? <OKBox info={'You’re not a teacher!'} onClose={onCloseTeacherWarning} /> : <></>;
}

export default React.memo(InsurancesReceiver);