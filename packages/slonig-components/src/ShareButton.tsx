import React, { useEffect } from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useToggle } from '@polkadot/react-hooks';
import { BaseOverlay } from '@polkadot/apps';

interface ShareButtonProps {
    title: string;
    text: string;
    url: string;
}

function ShareButton({ title, text, url }: ShareButtonProps): React.ReactElement<ShareButtonProps> {
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
            toggleInfoEnabled();
        }
    };

    return (
        <>
            <Button icon='paper-plane' label={t('Send')} onClick={handleShare} />
            <BaseOverlay
                icon='circle-info'
                type='info'
                isEnabled={infoEnabled}
            >
                <div>{t('Press Copy Button')}</div>
            </BaseOverlay>
        </>

    );
}

export default React.memo(ShareButton);