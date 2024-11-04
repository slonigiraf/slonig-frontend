// Copyright 2021-2022 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { QRField } from '@slonigiraf/db';
import React, { useCallback, useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { useInfo, useLoginContext } from '@slonigiraf/app-slonig-components';
import { hexToU8a, u8aToHex } from '@polkadot/util';

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
    const [lessonRequestJson, setLessonRequestJson] = useState<LessonResult | null>(null);
    const [agreement, setAgreement] = useState<Agreement | null>(null);
    const [triedToFetchData, setTriedToFetchData] = useState(false);
    const navigate = useNavigate();



    await storePseudonym(qrJSON[QRField.PERSON_IDENTITY], qrJSON[QRField.PERSON_NAME]);
    const maxLoadingSec = 60;
    showInfo(t('Loading'), 'info', maxLoadingSec);
    try {
        const webRTCData = await receiveWebRTCData(qrJSON.c, maxLoadingSec * 1000);
        hideInfo();
        const webRTCJSON = parseJson(webRTCData);
        const tutorPublicKeyHex = u8aToHex(currentPair?.publicKey);
        await storeLesson(tutorPublicKeyHex, qrJSON, webRTCJSON);
    } catch (error) {
        showInfo(t('Ask to regenerate the QR'), 'error');
        console.error("Failed to save lesson:", error);
    }
    navigate(`diplomas/tutor?lesson=${qrJSON[QRField.ID]}`);

    return <></>;
}
export default React.memo(LessonRequestReceiver);