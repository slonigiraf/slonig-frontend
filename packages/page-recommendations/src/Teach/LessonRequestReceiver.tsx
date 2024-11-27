// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { getLesson, Lesson, storeLesson, storePseudonym } from '@slonigiraf/db';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { QRField, LessonRequest, parseJson, receiveWebRTCData, useInfo, useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';

interface Props {
    setCurrentLesson: (lesson: Lesson) => void;
}

function LessonRequestReceiver({ setCurrentLesson }: Props): React.ReactElement<Props> {
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const webRTCPeerId = queryParams.get(QRField.WEBRTC_PEER_ID);
    const { t } = useTranslation();
    const { currentPair } = useLoginContext();
    const tutorPublicKeyHex = u8aToHex(currentPair?.publicKey);
    const { showInfo, hideInfo } = useInfo();
    const [lessonRequest, setLessonRequest] = useState<LessonRequest | null>(null);
    const [triedToFetchData, setTriedToFetchData] = useState(false);
    const navigate = useNavigate();

    useEffect(() => {
        setTriedToFetchData(false);
        setLessonRequest(null);
    }, [webRTCPeerId, setTriedToFetchData, setLessonRequest]);

    useEffect(() => {
        const fetchLessonRequest = async () => {
            if (webRTCPeerId) {
                const maxLoadingSec = 30;
                showInfo(t('Loading'), 'info', maxLoadingSec);
                try {
                    const webRTCData = await receiveWebRTCData(webRTCPeerId, maxLoadingSec * 1000);
                    hideInfo();
                    const receivedRequest: LessonRequest = parseJson(webRTCData);
                    setLessonRequest(receivedRequest);
                } catch(e){
                    showInfo(t('Ask the sender to refresh the QR page and keep it open while sending data.'), 'error');
                    navigate('', { replace: true });
                }
            }
        };
        if (webRTCPeerId && !triedToFetchData) {
            setTriedToFetchData(true);
            fetchLessonRequest();
        }
    }, [showInfo, webRTCPeerId, hideInfo, setLessonRequest, parseJson, setTriedToFetchData]);


    useEffect(() => {
        const saveLesson = async () => {
            if (lessonRequest) {
                await storePseudonym(lessonRequest.identity, lessonRequest.name);
                await storeLesson(lessonRequest, tutorPublicKeyHex);
                navigate('', { replace: true });
                const lesson = await getLesson(lessonRequest.lesson);
                if (lesson) {
                    setCurrentLesson(lesson);
                }
            }
        };
        saveLesson();
    }, [lessonRequest, storePseudonym, storeLesson]);

    return <></>;
}
export default React.memo(LessonRequestReceiver);