import React, { createContext, useContext, useState, ReactNode } from 'react';
import InfoPopup from './InfoPopup.js';

interface InfoContextType {
    isInfoVisible: boolean;
    infoMessage: string;
    showInfo: (message: string) => void;
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

    const showInfo = (message: string, timeoutSec: number = 2) => {
        setInfoMessage(message);
        setInfoVisible(true);
        setTimeout(() => {
            hideInfo();
        }, 1000 * timeoutSec); // Hide the info after 1 second
    };

    const hideInfo = () => {
        setInfoVisible(false);
        setInfoMessage('');
    };

    return (
        <InfoContext.Provider value={{ isInfoVisible, infoMessage, showInfo, hideInfo }}>
            {children}
            <InfoPopup message={infoMessage} isEnabled={isInfoVisible} />
        </InfoContext.Provider>
    );
};

export const useInfo = () => useContext(InfoContext);