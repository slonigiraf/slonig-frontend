// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getLesson, Lesson, storeLesson, storePseudonym } from '@slonigiraf/db';
import React from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { QRField, LessonRequest, useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';
import useFetchWebRTC from '../useFetchWebRTC.js';

interface Props {
    setCurrentLesson: (lesson: Lesson) => void;
}

function LessonRequestReceiver({ setCurrentLesson }: Props): React.ReactElement<Props> {
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const webRTCPeerId = queryParams.get(QRField.WEBRTC_PEER_ID);
    const { currentPair } = useLoginContext();
    const tutorPublicKeyHex = u8aToHex(currentPair?.publicKey);
    const navigate = useNavigate();
    useFetchWebRTC<LessonRequest>(webRTCPeerId, async (lessonRequest) => {
        if (lessonRequest) {
          await storePseudonym(lessonRequest.identity, lessonRequest.name);
          await storeLesson(lessonRequest, tutorPublicKeyHex);
          navigate('', { replace: true });
          const lesson = await getLesson(lessonRequest.lesson);
          if (lesson) {
            setCurrentLesson(lesson);
          }
        }
      });
    return <></>;
}
export default React.memo(LessonRequestReceiver);