import React from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';

interface ShareButtonProps {
    title: string;
    text: string;
    url: string;
    isDisabled?: boolean;
}

function ShareButton({ title, text, url, isDisabled = false }: ShareButtonProps): React.ReactElement<ShareButtonProps> {
    const { t } = useTranslation();

    const handleShare = async () => {
        const shareData = { title, text, url };
        if (navigator.share) {
            try {
                await navigator.share(shareData);
            } catch (err) {
                console.error('Error sharing content: ', err);
            }
        }
    };
    return (
        <Button
            icon='paper-plane'
            label={t('Send QR')}
            onClick={handleShare}
            isDisabled={!navigator.share || isDisabled}
        />
    );
}

export default React.memo(ShareButton);