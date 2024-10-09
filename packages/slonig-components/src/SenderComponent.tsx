import React, { useEffect, useState } from 'react';
import Peer from 'peerjs';
import { getBaseUrl, QRWithShareAndCopy } from '@slonigiraf/app-slonig-components';

interface SenderComponentProps {
    data: string;    // The data to send over the WebRTC data channel
    route: string;     // A route that will be use to create a clickable link and used in the QR code share
    action: any;     // The QRAction passed as a prop (e.g., QRAction.ADD_LETTER)
    textShare:  string;
    isDisabled?: boolean;
}

const SenderComponent: React.FC<SenderComponentProps> = ({ data, route, action, textShare, isDisabled = false }) => {
    const [qrCodeText, setQrCodeText] = useState<string>('');
    const [url, setUrl] = useState<string>('');

    useEffect(() => {
        const peer = new Peer();
        peer.on('open', (id) => {
            const routeWithConnectionId = route + "&c=" + id;
            setUrl(getBaseUrl() + '/#/' + routeWithConnectionId);
            const qrCodeData = JSON.stringify({
                d: routeWithConnectionId,
                q: action
            });
            setQrCodeText(qrCodeData);
        });
        peer.on('connection', (conn) => {
            conn.on('open', () => {
                console.log('Data connection opened.');
                if (conn.open) {
                    conn.send(data);
                    console.log('Data sent:', data);
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

export default SenderComponent;