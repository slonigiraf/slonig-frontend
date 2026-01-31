import React, { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import InfoPopup from './InfoPopup.js';
import type { IconName } from '@fortawesome/fontawesome-svg-core';
import OKBox from './OKBox.js';
import PenaltyPopup from './PenaltyPopup.js';
import ResultsReminder from './ResultsReminder.js';
import { deleteLearnRequest, getLastNonFinishedLessonRequest, LearnRequest } from '@slonigiraf/db';
import { TOO_LONG_LESSON_MS } from '@slonigiraf/utils';

interface InfoContextType {
    isInfoVisible: boolean;
    infoMessage: string;
    showInfo: (message: string, type?: 'error' | 'info', timeoutSec?: number, icon?: IconName) => void;
    showOKBox: (message: string, type?: 'error' | 'info', timeoutSec?: number, icon?: IconName) => void;
    showRecentPenalties: () => void;
    hideInfo: () => void;
}

const defaultInfoContext: InfoContextType = {
    isInfoVisible: false,
    infoMessage: '',
    showInfo: () => { },
    showOKBox: () => { },
    hideInfo: () => { },
    showRecentPenalties: () => { }
};

const InfoContext = createContext<InfoContextType>(defaultInfoContext);

interface InfoProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const InfoProvider: React.FC<InfoProviderProps> = ({ children }) => {
    const defaultIcon: IconName = 'circle-info';
    const [isInfoVisible, setInfoVisible] = useState(false);
    const [isBoxVisible, setBoxVisible] = useState(false);
    const [isPenaltyInfoVisible, setIsPenaltyInfoVisible] = useState(false);
    const [isLoadLessonResultsReminderVisible, setIsLoadLessonResultsReminderVisible] = useState(false);
    const [infoMessage, setInfoMessage] = useState('');
    const [boxMessage, setBoxMessage] = useState('');
    const [type, setType] = useState<'error' | 'info'>('info');
    const [icon, setIcon] = useState<IconName>(defaultIcon);
    const penaltyKeyRef = useRef(0);
    const [lastNonFinishedLessonRequest, setLastNonFinishedLessonRequest] = useState<LearnRequest | undefined>(undefined);

    const showInfo = (message: string, type: 'error' | 'info' = 'info', timeoutSec: number = 4, icon: IconName = defaultIcon) => {
        setInfoMessage(message);
        setType(type);
        setInfoVisible(true);
        setIcon(icon);
        setTimeout(() => {
            hideInfo();
        }, 1000 * timeoutSec);
    };

    const showOKBox = (message: string, type: 'error' | 'info' = 'info', timeoutSec: number = 4, icon: IconName = defaultIcon) => {
        setBoxMessage(message);
        // setType(type);
        setBoxVisible(true);
        // setIcon(icon);
        setTimeout(() => {
            hideBox();
        }, 1000 * timeoutSec);
    };


    const hideInfo = () => {
        setInfoVisible(false);
        setInfoMessage('');
    };

    const hideBox = () => {
        setBoxVisible(false);
        setBoxMessage('');
    };

    const showRecentPenalties = () => {
        penaltyKeyRef.current = penaltyKeyRef.current + 1;
        setIsPenaltyInfoVisible(true);
    }

    useEffect(() => {
        let canceled = false;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;

        const check = async () => {
            try {
                const last = await getLastNonFinishedLessonRequest(
                    Date.now() - TOO_LONG_LESSON_MS
                );

                if (canceled) return;

                setLastNonFinishedLessonRequest(last);
                setIsLoadLessonResultsReminderVisible(Boolean(last));
            } finally {
                if (!canceled) {
                    timeoutId = setTimeout(check, 1_000);
                }
            }
        };

        void check();

        return () => {
            canceled = true;
            if (timeoutId !== null) clearTimeout(timeoutId);
        };
    }, []);

    const onCloseLastNonFinishedLessonRequest = useCallback(() => {
        setIsLoadLessonResultsReminderVisible(false);
        if (lastNonFinishedLessonRequest) {
            deleteLearnRequest(lastNonFinishedLessonRequest.id);
        }
    }, [setIsLoadLessonResultsReminderVisible, lastNonFinishedLessonRequest, deleteLearnRequest])

    return (
        <InfoContext.Provider value={{ isInfoVisible, showRecentPenalties, infoMessage, showInfo, showOKBox, hideInfo }}>
            {children}
            <InfoPopup message={infoMessage} isEnabled={isInfoVisible} type={type} icon={icon} />
            {isBoxVisible && (
                <OKBox info={boxMessage} onClose={() => { }} />
            )}
            {isPenaltyInfoVisible && (
                <PenaltyPopup key={penaltyKeyRef.current} onClose={() => setIsPenaltyInfoVisible(false)} />
            )}
            {
                isLoadLessonResultsReminderVisible && lastNonFinishedLessonRequest &&
                <ResultsReminder
                    learnRequest={lastNonFinishedLessonRequest}
                    onClose={onCloseLastNonFinishedLessonRequest} />
            }
        </InfoContext.Provider>
    );
};

export const useInfo = () => useContext(InfoContext);