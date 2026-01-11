// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getLesson, getLessonId, getSetting, Lesson, setSettingToTrue, SettingKey, storeLesson, storePseudonym } from '@slonigiraf/db';
import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LessonRequest, UrlParams, useLog, useLoginContext, EXAMPLE_SKILL_KNOWLEDGE_CID, EXAMPLE_SKILL_KNOWLEDGE_ID, EXAMPLE_MODULE_KNOWLEDGE_CID } from '@slonigiraf/slonig-components';
import { u8aToHex } from '@polkadot/util';
import useFetchWebRTC from '../useFetchWebRTC.js';

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

  const changeRequestIntoTutorial = (lessonRequest: LessonRequest): LessonRequest => {
    const lesson = getLessonId(lessonRequest.identity, []);
    const [[id, cid, diplomaPublicKeyHex]] = lessonRequest.learn;
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
      await storePseudonym(lessonRequest.identity, lessonRequest.name);
      let lessonId = lessonRequest.lesson;

      const dbValueOfHasTutorCompletedTutorial = await getSetting(SettingKey.TUTOR_TUTORIAL_COMPLETED);
      const goWithNormalRequest = dbValueOfHasTutorCompletedTutorial === 'true';

      if (goWithNormalRequest) {
        await storeLesson(lessonRequest, tutorPublicKeyHex);
      }
      else {
        logEvent('SETTINGS', 'NOW_IS_CLASS_ONBOARDING', 'true_or_false', 1);
        await setSettingToTrue(SettingKey.NOW_IS_CLASS_ONBOARDING);
        const tutorialRequest = changeRequestIntoTutorial(lessonRequest);
        lessonId = tutorialRequest.lesson;
        await storeLesson(tutorialRequest, tutorPublicKeyHex);
      }
      navigate('', { replace: true });
      const lesson = await getLesson(lessonId);
      if (lesson) {
        logEvent('TUTORING', 'GET_STUDENT_REQUEST');
        setCurrentLesson(lesson);
      }
    }
  }, [getSetting, navigate, setCurrentLesson]);

  useFetchWebRTC<LessonRequest>(webRTCPeerId, handleData);

  return <></>;
}
export default React.memo(LessonRequestReceiver);