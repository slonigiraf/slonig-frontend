import React, { useEffect } from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { BaseOverlay } from '@polkadot/apps';

interface Props {
    className?: string;
    text: string;
}

function ClipboardCopyButton({ className, text }: Props): React.ReactElement<Props> {
    const { t } = useTranslation();
    const [infoEnabled, toggleInfoEnabled] = useToggle(false);

    // Set infoEnabled to false after 1 second
    useEffect(() => {
        let timer: any;
        if (infoEnabled) {
            timer = setTimeout(() => {
                toggleInfoEnabled();
            }, 1000);
        }
        return () => clearTimeout(timer); // Cleanup the timer
    }, [infoEnabled, toggleInfoEnabled]);

    const copyToClipboard = () => {
        // Create a temporary textarea element to hold the text to copy
        const tempElem = document.createElement('textarea');
        tempElem.value = text;
        document.body.appendChild(tempElem);
        tempElem.select();
        document.execCommand('copy');
        document.body.removeChild(tempElem);
        toggleInfoEnabled();
    }

    return (
        <>
            <Button icon='copy' label={t('Copy')} onClick={copyToClipboard} />
            <BaseOverlay
                icon='circle-info'
                type='info'
                isEnabled={infoEnabled}
            >
                <div>{t('Copied')}</div>
            </BaseOverlay>
        </>
    );
}

export default React.memo(ClipboardCopyButton);