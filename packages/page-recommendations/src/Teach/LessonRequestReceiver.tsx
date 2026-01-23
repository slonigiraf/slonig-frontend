// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { deleteSetting, getLesson, getLessonId, getSetting, Lesson, setSettingToTrue, SettingKey, storeLesson, storePseudonym, storeSetting } from '@slonigiraf/db';
import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LessonRequest, UrlParams, useLog, useLoginContext, useInfo } from '@slonigiraf/slonig-components';
import { u8aToHex } from '@polkadot/util';
import useFetchWebRTC from '../useFetchWebRTC.js';
import { useTranslation } from '../translate.js';
import { EXAMPLE_MODULE_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_ID } from '@slonigiraf/utils';
import { processNewPartner } from '../utils.js';

interface Props {
  setCurrentLesson: (lesson: Lesson) => void;
}

function LessonRequestReceiver({ setCurrentLesson }: Props): React.ReactElement<Props> {
  const location = useLocation();
  const queryParams = new URLSearchParams(location.search);
  const webRTCPeerId = queryParams.get(UrlParams.WEBRTC_PEER_ID);
  const { currentPair } = useLoginContext();
  const { logEvent } = useLog();
  const tutorPublicKeyHex = u8aToHex(currentPair?.publicKey);
  const navigate = useNavigate();
  const { showInfo } = useInfo();
  const { t } = useTranslation();


  const changeRequestIntoTutorial = (lessonRequest: LessonRequest): LessonRequest => {
    const lesson = getLessonId(lessonRequest.identity, []);
    const tuple = lessonRequest.learn.at(-1) ?? lessonRequest.learn.at(0);
    if (!tuple) throw new Error('lessonRequest.learn is empty');
    const [id, cid, diplomaPublicKeyHex] = tuple;


    const tutorialRequest = {
      ...lessonRequest,
      lesson,
      cid: EXAMPLE_MODULE_KNOWLEDGE_CID,
      reexamine: [],
      learn: [[EXAMPLE_SKILL_KNOWLEDGE_ID, EXAMPLE_SKILL_KNOWLEDGE_CID, diplomaPublicKeyHex],
      [id, cid, diplomaPublicKeyHex]]
    };
    return tutorialRequest;
  }

  const handleData = useCallback(async (lessonRequest: LessonRequest) => {
    if (lessonRequest) {
      const dbValueOfHasTutorCompletedTutorial = await getSetting(SettingKey.TUTOR_TUTORIAL_COMPLETED);
      if (lessonRequest.cid === EXAMPLE_MODULE_KNOWLEDGE_CID && dbValueOfHasTutorCompletedTutorial) {
        logEvent('ONBOARDING', 'ATTEMPT_TO_WARMUP_WRONG_TUTOR');
        await deleteSetting(SettingKey.LESSON);
        logEvent('SETTINGS', 'NOW_IS_CLASS_ONBOARDING', 'true_or_false', 1);
        await setSettingToTrue(SettingKey.NOW_IS_CLASS_ONBOARDING);
        showInfo(t('Please change your partner.'), 'error');
        navigate('', { replace: true });
      } else {
        await storePseudonym(lessonRequest.identity, lessonRequest.name);
        await processNewPartner(lessonRequest.identity);

        let lessonId = lessonRequest.lesson;
        const goWithNormalRequest = dbValueOfHasTutorCompletedTutorial === 'true';

        if (goWithNormalRequest) {
          const processOnboaring = async () => {
            logEvent('SETTINGS', 'NOW_IS_CLASS_ONBOARDING', 'true_or_false', 0);
            await deleteSetting(SettingKey.NOW_IS_CLASS_ONBOARDING);
          }
          await storeLesson(lessonRequest, tutorPublicKeyHex, processOnboaring);
        }
        else {
          const processOnboaring = async () => {
            logEvent('SETTINGS', 'NOW_IS_CLASS_ONBOARDING', 'true_or_false', 1);
            await setSettingToTrue(SettingKey.NOW_IS_CLASS_ONBOARDING);
          }
          const tutorialRequest = changeRequestIntoTutorial(lessonRequest);
          lessonId = tutorialRequest.lesson;
          await storeLesson(tutorialRequest, tutorPublicKeyHex, processOnboaring);
        }
        navigate('', { replace: true });
        const lesson = await getLesson(lessonId);
        if (lesson) {
          logEvent('TUTORING', 'GET_STUDENT_REQUEST');
          setCurrentLesson(lesson);
        }
      }
    }
  }, [getSetting, navigate, setCurrentLesson, t, showInfo]);

  useFetchWebRTC<LessonRequest>(webRTCPeerId, handleData);

  return <></>;
}
export default React.memo(LessonRequestReceiver);