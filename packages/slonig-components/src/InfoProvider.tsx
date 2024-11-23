import React, { createContext, useContext, useState, ReactNode } from 'react';
import InfoPopup from './InfoPopup.js';
import type { IconName } from '@fortawesome/fontawesome-svg-core';

interface InfoContextType {
    isInfoVisible: boolean;
    infoMessage: string;
    showInfo: (message: string, type?: 'error' | 'info', timeoutSec?: number, icon? : IconName) => void;
    hideInfo: () => void;
}

const defaultInfoContext: InfoContextType = {
    isInfoVisible: false,
    infoMessage: '',
    showInfo: () => { },
    hideInfo: () => { }
};

const InfoContext = createContext<InfoContextType>(defaultInfoContext);

interface InfoProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const InfoProvider: React.FC<InfoProviderProps> = ({ children }) => {
    const [isInfoVisible, setInfoVisible] = useState(false);
    const [infoMessage, setInfoMessage] = useState('');
    const [type, setType] = useState<'error' | 'info'>('info');
    const [icon, setIcon] = useState<IconName>('circle-info');

    const showInfo = (message: string, type: 'error' | 'info' = 'info', timeoutSec: number = 4, icon? : IconName) => {
        setInfoMessage(message);
        setType(type);
        setInfoVisible(true);
        icon && setIcon(icon);
        setTimeout(() => {
            hideInfo();
        }, 1000 * timeoutSec);
    };

    const hideInfo = () => {
        setInfoVisible(false);
        setInfoMessage('');
    };

    return (
        <InfoContext.Provider value={{ isInfoVisible, infoMessage, showInfo, hideInfo }}>
            {children}
            <InfoPopup message={infoMessage} isEnabled={isInfoVisible} type={type} icon={icon}/>
        </InfoContext.Provider>
    );
};

export const useInfo = () => useContext(InfoContext);