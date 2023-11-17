import React from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

// Define the props interface
interface ClipboardCopyButtonProps {
    text: string;
}

function ClipboardCopyButton({ text }: ClipboardCopyButtonProps): React.ReactElement<ClipboardCopyButtonProps> {
    const { t } = useTranslation();
    const copyToClipboard = () => {
        // Create a temporary textarea element to hold the text to copy
        const tempElem = document.createElement('textarea');
        tempElem.value = text;
        document.body.appendChild(tempElem);
        tempElem.select();
        document.execCommand('copy');
        document.body.removeChild(tempElem);
    }

    return (
        <Button icon='copy' label={t('Copy')} onClick={copyToClipboard} />
    );
}

export default ClipboardCopyButton;