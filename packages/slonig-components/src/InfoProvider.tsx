import React, { createContext, useContext, useState, ReactNode, useRef, useEffect, useCallback } from 'react';
import InfoPopup from './InfoPopup.js';
import type { IconName } from '@fortawesome/fontawesome-svg-core';
import OKBox from './OKBox.js';
import PenaltyPopup from './PenaltyPopup.js';
import LoadResultsReminder from './LoadResultsReminder.js';
import { deleteLearnRequest, getLastNonFinishedLessonRequest, getLastNonSentLesson, LearnRequest, Lesson, putLesson, storeLesson } from '@slonigiraf/db';
import { TOO_LONG_LESSON_MS } from '@slonigiraf/utils';
import { useLiveQuery } from 'dexie-react-hooks';
import SendResultsReminder from './SendResultsReminder.js';
import LessonResultInfo from './LessonResultInfo.js';
import { LessonResult } from './index.jsx';
import { useTranslation } from './translate.js';
interface InfoContextType {
    isInfoVisible: boolean;
    infoMessage: string;
    showInfo: (message: string, type?: 'error' | 'info', timeoutSec?: number, icon?: IconName) => void;
    showOKBox: (message: string) => void;
    showRecentPenalties: () => void;
    hideInfo: () => void;
    showLoadedResult: (lessonResult: LessonResult) => void;
}

const defaultInfoContext: InfoContextType = {
    isInfoVisible: false,
    infoMessage: '',
    showInfo: () => { },
    showOKBox: () => { },
    hideInfo: () => { },
    showRecentPenalties: () => { },
    showLoadedResult: () => { },
};

const InfoContext = createContext<InfoContextType>(defaultInfoContext);

interface InfoProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const InfoProvider: React.FC<InfoProviderProps> = ({ children }) => {
    const defaultIcon: IconName = 'circle-info';
    const { t } = useTranslation();
    const [areLoadedResultsShown, setAreLoadedResultsShown] = useState(false);
    const [isInfoVisible, setInfoVisible] = useState(false);
    const [isBoxVisible, setBoxVisible] = useState(false);
    const [isPenaltyInfoVisible, setIsPenaltyInfoVisible] = useState(false);
    const [isLoadLessonResultsReminderVisible, setIsLoadLessonResultsReminderVisible] = useState(false);
    const [isSendLessonResultsReminderVisible, setIsSendLessonResultsReminderVisible] = useState(false);
    const [infoMessage, setInfoMessage] = useState('');
    const [boxMessage, setBoxMessage] = useState('');
    const [type, setType] = useState<'error' | 'info'>('info');
    const [icon, setIcon] = useState<IconName>(defaultIcon);
    const penaltyKeyRef = useRef(0);
    const [tick, setTick] = useState<number>(Date.now());
    const [loadedResultInfo, setLoadedResultInfo] = useState<ReactNode>();

    const lastNonFinishedLessonRequest = useLiveQuery<LearnRequest>(
        () => getLastNonFinishedLessonRequest(tick - TOO_LONG_LESSON_MS),
        [tick]
    );

    const lastNonSentLesson = useLiveQuery<Lesson>(
        () => getLastNonSentLesson(tick - TOO_LONG_LESSON_MS),
        [tick]
    );

    useEffect(() => {
        setIsLoadLessonResultsReminderVisible(Boolean(lastNonFinishedLessonRequest));
    }, [lastNonFinishedLessonRequest, setIsLoadLessonResultsReminderVisible]);

    useEffect(() => {
        setIsSendLessonResultsReminderVisible(Boolean(lastNonSentLesson));
    }, [lastNonSentLesson, setIsSendLessonResultsReminderVisible]);

    const showInfo = (message: string, type: 'error' | 'info' = 'info', timeoutSec: number = 4, icon: IconName = defaultIcon) => {
        setInfoMessage(message);
        setType(type);
        setInfoVisible(true);
        setIcon(icon);
        setTimeout(() => {
            hideInfo();
        }, 1000 * timeoutSec);
    };

    const showOKBox = (message: string) => {
        setBoxMessage(message);
        setBoxVisible(true);
    };


    const hideInfo = () => {
        setInfoVisible(false);
        setInfoMessage('');
    };

    const showRecentPenalties = () => {
        penaltyKeyRef.current = penaltyKeyRef.current + 1;
        setIsPenaltyInfoVisible(true);
    }

    const showLoadedResult = (lessonResult: LessonResult) => {
        if (lessonResult.tutorIsExperienced) {
            setLoadedResultInfo(<LessonResultInfo title={''} lessonResult={lessonResult} />);
            setAreLoadedResultsShown(Boolean(lessonResult));
        }
    }

    useEffect(() => {
        const id = setInterval(() => {
            setTick(Date.now());
        }, 60_000);

        return () => clearInterval(id);
    }, []);

    const onCloseLastNonFinishedLessonRequest = useCallback(async () => {
        if (lastNonFinishedLessonRequest) {
            await deleteLearnRequest(lastNonFinishedLessonRequest.id);
        }
        setIsLoadLessonResultsReminderVisible(false);
    }, [setIsLoadLessonResultsReminderVisible, lastNonFinishedLessonRequest, deleteLearnRequest])

    const onCloseLoadedResults = useCallback(() => {
        setLoadedResultInfo(null);
        setAreLoadedResultsShown(false);
    }, [setLoadedResultInfo, setAreLoadedResultsShown]);

    return (
        <InfoContext.Provider value={{ isInfoVisible, showLoadedResult, showRecentPenalties, infoMessage, showInfo, showOKBox, hideInfo }}>
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
                <LoadResultsReminder
                    learnRequest={lastNonFinishedLessonRequest}
                    onClose={onCloseLastNonFinishedLessonRequest} />
            }
            {
                isSendLessonResultsReminderVisible && lastNonSentLesson &&
                <SendResultsReminder lesson={lastNonSentLesson} onResult={() => setIsSendLessonResultsReminderVisible(false)} />
            }
            {areLoadedResultsShown && <OKBox info={t('Results are loaded')} decorator={loadedResultInfo} onClose={onCloseLoadedResults} />}
        </InfoContext.Provider>
    );
};

export const useInfo = () => useContext(InfoContext);