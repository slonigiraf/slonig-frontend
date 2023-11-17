import React from 'react';
import { Button } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useToggle } from '@polkadot/react-hooks';
import InfoPopup from './InfoPopup.js';

interface ShareButtonProps {
    title: string;
    text: string;
    url: string;
}

function ShareButton({ title, text, url }: ShareButtonProps): React.ReactElement<ShareButtonProps> {
    const { t } = useTranslation();
    const [infoEnabled, toggleInfoEnabled] = useToggle(false);

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
            <InfoPopup
                isEnabled={infoEnabled}
                message='Press Copy Button'
                onTimeout={toggleInfoEnabled}
            />
        </>
    );
}

export default React.memo(ShareButton);