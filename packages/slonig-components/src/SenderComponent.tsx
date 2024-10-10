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
        // const peer = new Peer();
        const peer = new Peer({
            host: 'peerjs.slonig.org',
            port: 443,
            secure: true,
            path: '/'
            // ,
            // config: {
            //     'iceServers': [
            //         { urls: 'stun:coturn.slonig.org:3478' },
            //         { urls: 'turn:coturn.slonig.org:3478', username: 'user', credential: 'S4xEgicLEBaJML9g88UUypHQy1YZ' }
            //     ]
            // }
        });
        peer.on('open', (id) => {
            const routeWithConnectionId = route + "&c=" + id;
            console.log("PeerId: "+id)
            setUrl(getBaseUrl() + '/#/' + routeWithConnectionId);
            const qrCodeData = JSON.stringify({
                d: routeWithConnectionId,
                q: action
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