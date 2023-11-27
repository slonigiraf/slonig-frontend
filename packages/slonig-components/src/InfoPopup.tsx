import React from 'react';
import { useTranslation } from './translate.js';
import { BaseOverlay } from '@polkadot/apps';

interface Props {
    isEnabled: boolean;
    message: string;
    type?: 'error' | 'info';
}

function InfoPopup({ isEnabled, message, type = 'info' }: Props): React.ReactElement<Props> | null {
    const { t } = useTranslation();
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