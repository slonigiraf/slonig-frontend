import React, { useEffect, useRef, useState } from 'react';
import { createPeer, getBaseUrl, QRWithShareAndCopy } from '@slonigiraf/app-slonig-components';

interface SenderComponentProps {
    data: string;    // The data to send over the WebRTC data channel
    route: string;     // A route that will be used to create a clickable link and used in the QR code share
    action: object;
    textShare: string;
    isDisabled?: boolean;
    onDataSent?: () => void;
}

const SenderComponent: React.FC<SenderComponentProps> = ({ data, route, action, textShare, isDisabled = false, onDataSent }) => {
    const [qrCodeText, setQrCodeText] = useState<string>('');
    const [url, setUrl] = useState<string>('');
    const peerRef = useRef<any>(null); // Replace `any` with the appropriate type if available
    const connectionRef = useRef<any>(null); // To store the connection
    const dataRef = useRef<string>(data); // To store the latest data

    // Update dataRef whenever `data` prop changes
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    useEffect(() => {
        // Initialize the peer only once
        peerRef.current = createPeer();

        const peer = peerRef.current;

        const handleOpen = (id: string) => {
            const routeWithConnectionId = route.includes('?')
                ? `${route}&c=${id}`
                : `${route}?c=${id}`;

            console.log("PeerId:", id);
            setUrl(`${getBaseUrl()}/#/${routeWithConnectionId}`);

            const qrCodeData = JSON.stringify({
                c: id,
                ...action
            });
            setQrCodeText(qrCodeData);
        };

        const handleConnection = (conn: any) => { // Replace `any` with the appropriate type
            connectionRef.current = conn;

            conn.on('open', async () => {
                if (conn.open) {
                    await conn.send(dataRef.current);
                    if (typeof onDataSent === 'function') {
                        onDataSent();
                    }
                }
            });

            conn.on('close', () => {
                connectionRef.current = null;
            });
        };

        peer.on('open', handleOpen);
        peer.on('connection', handleConnection);

        return () => {
            // Cleanup on unmount
            if (connectionRef.current) {
                connectionRef.current.close();
            }
            if (peerRef.current) {
                peerRef.current.disconnect();
            }
        };
    }, [route, action]); // Initialize peer when `route` or `action` changes

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