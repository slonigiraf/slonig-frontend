// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { deleteAllBanScheduledEvents, deleteSetting, getLesson, getSetting, hasSetting, Lesson, setSettingToTrue, SettingKey, storeLesson, storePseudonym, storeSetting } from '@slonigiraf/db';
import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LessonRequest, UrlParams, useLog, useLoginContext, useInfo, EnableTutoringRequest, OKBox, timeStampStringToNumber } from '@slonigiraf/slonig-components';
import { u8aToHex } from '@polkadot/util';
import useFetchWebRTC from '../useFetchWebRTC.js';
import { useTranslation } from '../translate.js';
import { EXAMPLE_MODULE_KNOWLEDGE_CID, EXAMPLE_MODULE_KNOWLEDGE_ID, EXAMPLE_SKILL_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_ID } from '@slonigiraf/utils';
import { processNewPartner } from '../utils.js';
import { useToggle } from '@polkadot/react-hooks';

interface Props {
  setCurrentLesson: (lesson: Lesson) => void;
}

function LessonRequestReceiver({ setCurrentLesson }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(UrlParams.WEBRTC_PEER_ID);
  const { currentPair } = useLoginContext();
  const { logEvent, logPartners } = useLog();
  const tutorPublicKeyHex = u8aToHex(currentPair?.publicKey);
  const navigate = useNavigate();
  const { showInfo } = useInfo();
  const { t } = useTranslation();
  const [isContinueTutoringShown, toggleIsContinueTutoringShown] = useToggle();


  const changeRequestIntoTutorial = (lessonRequest: LessonRequest): LessonRequest => {
    const tuple = lessonRequest.learn.at(-1) ?? lessonRequest.learn.at(0);
    if (!tuple) throw new Error('lessonRequest.learn is empty');
    const [id, cid, diplomaPublicKeyHex] = tuple;


    const tutorialRequest = {
      ...lessonRequest,
      cid: EXAMPLE_MODULE_KNOWLEDGE_CID,
      reexamine: [],
      learn: [[EXAMPLE_SKILL_KNOWLEDGE_ID, EXAMPLE_SKILL_KNOWLEDGE_CID, diplomaPublicKeyHex, '1'],
      [id, cid, diplomaPublicKeyHex, '0']]
    };
    return tutorialRequest;
  }

  const unblockTutoring = useCallback(async () => {
    const lastBanStartTime = timeStampStringToNumber(await getSetting(SettingKey.LAST_BAN_START_TIME));
    const timePassed = lastBanStartTime ? (Date.now() - lastBanStartTime) : 0;
    logEvent('TUTORING', 'BAN', 'unban_after_sec', Math.round(timePassed / 1000));

    await deleteAllBanScheduledEvents();
    await deleteSetting(SettingKey.COUNT_WITHOUT_CORRECT_FAKE_IN_RAW);
    await deleteSetting(SettingKey.BAN_TUTORING);
    await deleteSetting(SettingKey.LAST_BAN_START_TIME);
    toggleIsContinueTutoringShown();
  }, [deleteAllBanScheduledEvents]);

  const onCloseContinueTutoring = useCallback(() => {
    toggleIsContinueTutoringShown();
    navigate('', { replace: true });
  }, [navigate]);

  const handleData = useCallback(async (data: LessonRequest | EnableTutoringRequest) => {
    if ('lesson' in data) {
      const dbValueOfHasTutorCompletedTutorial = await getSetting(SettingKey.TUTOR_TUTORIAL_COMPLETED);
      if (data.cid === EXAMPLE_MODULE_KNOWLEDGE_CID && dbValueOfHasTutorCompletedTutorial) {
        logEvent('ONBOARDING', 'ATTEMPT_TO_WARMUP_WRONG_TUTOR');
        await deleteSetting(SettingKey.LESSON);
        logEvent('SETTINGS', 'CLASS_ONBOARDING_ON');
        await setSettingToTrue(SettingKey.NOW_IS_CLASS_ONBOARDING);
        showInfo(t('Please change your partner.'), 'error');
        navigate('', { replace: true });
      } else {
        await storePseudonym(data.identity, data.name);

        logPartners(await processNewPartner(data.identity));

        let lessonId = data.lesson;
        const goWithNormalRequest = dbValueOfHasTutorCompletedTutorial === 'true';

        if (goWithNormalRequest) {
          const processOnboaring = async () => {
            const nowIsOnboarding = await hasSetting(SettingKey.NOW_IS_CLASS_ONBOARDING);
            if (nowIsOnboarding) {
              logEvent('SETTINGS', 'CLASS_ONBOARDING_OFF');
              await deleteSetting(SettingKey.NOW_IS_CLASS_ONBOARDING);
            }
          }
          await storeLesson(data, tutorPublicKeyHex, processOnboaring);
        } else {
          const processOnboaring = async () => {
            logEvent('SETTINGS', 'CLASS_ONBOARDING_ON');
            await setSettingToTrue(SettingKey.NOW_IS_CLASS_ONBOARDING);
          }
          const tutorialRequest = changeRequestIntoTutorial(data);
          lessonId = tutorialRequest.lesson;
          await storeLesson(tutorialRequest, tutorPublicKeyHex, processOnboaring);
          if (tutorialRequest.kid !== EXAMPLE_MODULE_KNOWLEDGE_ID) {
            await storeSetting(SettingKey.FALLBACK_KNOWLEDGE_ID, tutorialRequest.kid);
          }
        }
        navigate('', { replace: true });
        const lesson = await getLesson(lessonId);
        if (lesson) {
          logEvent('TUTORING', 'GET_STUDENT_REQUEST');
          setCurrentLesson(lesson);
        }
      }
    } else {
      if (data.tutor === tutorPublicKeyHex) {
        unblockTutoring();
      }
    }
  }, [getSetting, navigate, setCurrentLesson, t, showInfo]);

  useFetchWebRTC<LessonRequest>(webRTCPeerId, handleData);

  return isContinueTutoringShown ? <OKBox info={t('You can continue tutoring under teacher supervision')} onClose={onCloseContinueTutoring} /> : <></>;
}
export default React.memo(LessonRequestReceiver);