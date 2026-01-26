import React, { createContext, useContext, useState, ReactNode } from 'react';
import InfoPopup from './InfoPopup.js';
import type { IconName } from '@fortawesome/fontawesome-svg-core';
import OKBox from './OKBox.js';

interface InfoContextType {
    isInfoVisible: boolean;
    infoMessage: string;
    showInfo: (message: string, type?: 'error' | 'info', timeoutSec?: number, icon?: IconName) => void;
    showOKBox: (message: string, type?: 'error' | 'info', timeoutSec?: number, icon?: IconName) => void;
    hideInfo: () => void;
}

const defaultInfoContext: InfoContextType = {
    isInfoVisible: false,
    infoMessage: '',
    showInfo: () => { },
    showOKBox: () => { },
    hideInfo: () => { }
};

const InfoContext = createContext<InfoContextType>(defaultInfoContext);

interface InfoProviderProps {
    children: ReactNode; // Define the type for 'children' here
}

export const InfoProvider: React.FC<InfoProviderProps> = ({ children }) => {
    const defaultIcon: IconName = 'circle-info';
    const [isInfoVisible, setInfoVisible] = useState(false);
    const [isBoxVisible, setBoxVisible] = useState(false);
    const [infoMessage, setInfoMessage] = useState('');
    const [boxMessage, setBoxMessage] = useState('');
    const [type, setType] = useState<'error' | 'info'>('info');
    const [icon, setIcon] = useState<IconName>(defaultIcon);

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

    return (
        <InfoContext.Provider value={{ isInfoVisible, infoMessage, showInfo, showOKBox, hideInfo }}>
            {children}
            <InfoPopup message={infoMessage} isEnabled={isInfoVisible} type={type} icon={icon} />
            {isBoxVisible && (
                <OKBox info={boxMessage} onClose={() => { }} />
            )}
        </InfoContext.Provider>
    );
};

export const useInfo = () => useContext(InfoContext);