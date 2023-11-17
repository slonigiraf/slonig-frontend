import React from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useToggle } from '@polkadot/react-hooks';
import InfoPopup from './InfoPopup.js';

interface Props {
    className?: string;
    text: string;
}

function ClipboardCopyButton({ className, text }: Props): React.ReactElement<Props> {
    const { t } = useTranslation();
    const [infoEnabled, toggleInfoEnabled] = useToggle(false);

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
            <InfoPopup
                isEnabled={infoEnabled}
                message='Copied'
                onTimeout={toggleInfoEnabled}
            />
        </>
    );
}

export default React.memo(ClipboardCopyButton);