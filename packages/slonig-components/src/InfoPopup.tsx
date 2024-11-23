import React from 'react';
import { useTranslation } from './translate.js';
import { BaseOverlay } from '@polkadot/apps';
import type { IconName } from '@fortawesome/fontawesome-svg-core';
interface Props {
    isEnabled: boolean;
    message: string;
    icon: IconName;
    type?: 'error' | 'info';
}

function InfoPopup({ isEnabled, message, icon, type = 'info' }: Props): React.ReactElement<Props> | null {
    const { t } = useTranslation();
    if (!isEnabled) {
        return null;
    }

    return (
        <BaseOverlay
            icon={icon ? icon : 'circle-info'}
            type={type}
            isEnabled={isEnabled}
        >
            <div>{t(message)}</div>
        </BaseOverlay>
    );
}

export default React.memo(InfoPopup);