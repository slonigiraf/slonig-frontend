import React, { useEffect } from 'react';
import { useTranslation } from './translate.js';
import { BaseOverlay } from '@polkadot/apps';

interface Props {
    isEnabled: boolean;
    message: string;
    type?: 'error' | 'info';
    onTimeout?: () => void;
}

function InfoPopup({ isEnabled, message, type = 'info', onTimeout }: Props): React.ReactElement<Props> | null {
    const { t } = useTranslation();

    useEffect(() => {
        let timer: any;
        if (isEnabled && onTimeout) {
            timer = setTimeout(() => {
                onTimeout();
            }, 1000);
        }
        return () => clearTimeout(timer);
    }, [isEnabled, onTimeout]);

    if (!isEnabled) {
        return null;
    }

    return (
        <BaseOverlay
            icon='circle-info'
            type={type}
            isEnabled={isEnabled}
        >
            <div>{t(message)}</div>
        </BaseOverlay>
    );
}

export default React.memo(InfoPopup);