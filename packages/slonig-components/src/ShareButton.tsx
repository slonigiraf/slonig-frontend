import React from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

// Define the props interface
interface ShareButtonProps {
    title: string;
    text: string;
    url: string;
}


// Modify the function to accept props based on the interface
function ShareButton({ title, text, url }: ShareButtonProps): React.ReactElement<ShareButtonProps> {
    const { t } = useTranslation();
    const handleShare = async () => {
        const shareData = { title, text, url };

        if (navigator.share) {
            try {
                await navigator.share(shareData);
                console.log('Content shared successfully');
            } catch (err) {
                console.error('Error sharing content: ', err);
            }
        } else {
            console.log('Web Share API is not supported in your browser.');
        }
    };

    return (
        <Button label={t('Send')} onClick={handleShare} />
    );
}

export default ShareButton;