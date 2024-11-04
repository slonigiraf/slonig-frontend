// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { QRField, storeLesson, storePseudonym } from '@slonigiraf/db';
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { LessonRequest, parseJson, receiveWebRTCData, useInfo, useLoginContext } from '@slonigiraf/app-slonig-components';
import { u8aToHex } from '@polkadot/util';

interface Props {
    className?: string;
}

function LessonRequestReceiver({ className = '' }: Props): React.ReactElement<Props> {
    const location = useLocation();
    const queryParams = new URLSearchParams(location.search);
    const webRTCPeerId = queryParams.get(QRField.WEBRTC_PEER_ID);

    if (!webRTCPeerId) return <></>;

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
            const maxLoadingSec = 60;
            showInfo(t('Loading'), 'info', maxLoadingSec);
            const webRTCData = await receiveWebRTCData(webRTCPeerId, maxLoadingSec * 1000);
            hideInfo();
            const receivedRequest: LessonRequest = parseJson(webRTCData);
            if(receivedRequest.tutor === tutorPublicKeyHex){
                setLessonRequest(receivedRequest);
            } else {
                showInfo('Student has shown you a QR code created for a different tutor. Ask them to scan your QR code.', 'error');
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
                await storeLesson(lessonRequest);
                showInfo(t('Saved'));
                navigate('', { replace: true });
            }
        };
        saveLesson();
    }, [lessonRequest, storePseudonym, storeLesson]);

    return <></>;
}
export default React.memo(LessonRequestReceiver);