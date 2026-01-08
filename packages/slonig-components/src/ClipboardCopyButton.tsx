import React from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useInfo, useLog } from '@slonigiraf/slonig-components';

interface Props {
    className?: string;
    text: string;
    isDisabled?: boolean;
}

function ClipboardCopyButton({ className, text, isDisabled = false }: Props): React.ReactElement<Props> {
    const { t } = useTranslation();
    const { showInfo } = useInfo();
    const { logEvent } = useLog();

    const copyToClipboard = () => {
        logEvent('QR', 'CLICK_COPY');
        // Create a temporary textarea element to hold the text to copy
        const tempElem = document.createElement('textarea');
        tempElem.value = text;
        document.body.appendChild(tempElem);
        tempElem.select();
        document.execCommand('copy');
        document.body.removeChild(tempElem);
        showInfo(t('Copied'));
    }

    return (
        <>
            <Button icon='copy' label={t('Copy')} onClick={copyToClipboard} isDisabled={isDisabled} />
        </>
    );
}

export default React.memo(ClipboardCopyButton);