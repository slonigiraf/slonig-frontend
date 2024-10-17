import React, { useEffect, useState } from 'react';
import { createPeer, getBaseUrl, QRWithShareAndCopy } from '@slonigiraf/app-slonig-components';

interface SenderComponentProps {
    data: string;    // The data to send over the WebRTC data channel
    route: string;     // A route that will be use to create a clickable link and used in the QR code share
    action: object;
    textShare: string;
    isDisabled?: boolean;
}

const SenderComponent: React.FC<SenderComponentProps> = ({ data, route, action, textShare, isDisabled = false }) => {
    const [qrCodeText, setQrCodeText] = useState<string>('');
    const [url, setUrl] = useState<string>('');

    useEffect(() => {
        const peer = createPeer();
        peer.on('open', (id) => {
            const routeWithConnectionId = route.includes('?')
                ? route + "&c=" + id
                : route + "?c=" + id;

            console.log("PeerId: " + id)
            setUrl(getBaseUrl() + '/#/' + routeWithConnectionId);
            const qrCodeData = JSON.stringify({
                c: id,
                ...action
            });
            setQrCodeText(qrCodeData);
        });
        peer.on('connection', (conn) => {
            conn.on('open', () => {
                if (conn.open) {
                    conn.send(data);
                }
            });
            conn.on('close', () => {
                //
            });
        });

        return () => {
            peer.disconnect();
        };
    }, [data, action]);

    return (
        <div>
            {qrCodeText && (
                <QRWithShareAndCopy
                    dataQR={qrCodeText}
                    titleShare="QR Code"
                    textShare={textShare}
                    urlShare={url}
                    dataCopy={url}
                    isDisabled={isDisabled}
                />
            )}
        </div>
    );
};

export default React.memo(SenderComponent);