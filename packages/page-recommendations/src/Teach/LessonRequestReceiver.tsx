// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getLesson, Lesson, storeLesson, storePseudonym } from '@slonigiraf/db';
import React, { useCallback } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { LessonRequest, UrlParams, useLog, useLoginContext } from '@slonigiraf/slonig-components';
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

  const handleData = useCallback(async (lessonRequest: LessonRequest) => {
    if (lessonRequest) {
      await storePseudonym(lessonRequest.identity, lessonRequest.name);
      await storeLesson(lessonRequest, tutorPublicKeyHex);
      navigate('', { replace: true });
      const lesson = await getLesson(lessonRequest.lesson);
      if (lesson) {
        logEvent('TUTORING', 'GET_STUDENT_REQUEST');
        setCurrentLesson(lesson);
      }
    }
  }, [navigate, setCurrentLesson]);

  useFetchWebRTC<LessonRequest>(webRTCPeerId, handleData);
  
  return <></>;
}
export default React.memo(LessonRequestReceiver);