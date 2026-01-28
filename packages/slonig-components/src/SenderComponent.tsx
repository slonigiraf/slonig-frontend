import React, { useEffect, useRef, useState } from 'react';
import { createPeer, getBaseUrl, QRWithShareAndCopy, useInfo } from '@slonigiraf/slonig-components';
import { useTranslation } from './translate.js';
import { Spinner } from '@polkadot/react-components';

interface SenderComponentProps {
    data: string;    // The data to send over the WebRTC data channel
    route: string;     // A route that will be used to create a clickable link and used in the QR code share
    textShare: string;
    isDisabled?: boolean;
    onDataSent?: () => void;
    onReady?: () => void;
    caption?: string;
}

const SenderComponent: React.FC<SenderComponentProps> = ({ data, route, textShare, isDisabled = false, onDataSent, onReady, caption }) => {
    const { t } = useTranslation();
    const { showInfo } = useInfo();
    const [url, setUrl] = useState<string>('');
    const peerRef = useRef<any>(null); // Replace `any` with the appropriate type if available
    const connectionRef = useRef<any>(null); // To store the connection
    const dataRef = useRef<string>(data); // To store the latest data


    // Update dataRef whenever `data` prop changes
    useEffect(() => {
        dataRef.current = data;
    }, [data]);

    useEffect(() => {
        if (url && typeof onReady === 'function') {
            onReady();
        }
    }, [url, onReady]);

    useEffect(() => {
        // Initialize the peer only once
        peerRef.current = createPeer();

        const peer = peerRef.current;

        const handleOpen = (id: string) => {
            const routeWithConnectionId = route.includes('?')
                ? `${route}&c=${id}`
                : `${route}?c=${id}`;
            setUrl(`${getBaseUrl()}/#/${routeWithConnectionId}`);
        };

        const handleConnection = (conn: any) => { // Replace `any` with the appropriate type
            connectionRef.current = conn;

            conn.on('open', async () => {
                if (conn.open) {
                    await conn.send(dataRef.current);
                }
            });

            conn.on('data', (msg: any) => {
                if (msg?.type === 'ack') {
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
        peer.on('error', (_e: Error) => {
            showInfo(t('No internet connection. Check your connection and try again.'), 'error');
        });

        return () => {
            // Cleanup on unmount
            if (connectionRef.current) {
                connectionRef.current.close();
            }
            if (peerRef.current) {
                peerRef.current.disconnect();
            }
        };
    }, [route]); // Initialize peer when `route` or changes

    return url ?
        <>
            {caption && <h2 className='prompt'>{caption}</h2>}
            <QRWithShareAndCopy
                titleShare="QR Code"
                textShare={textShare}
                urlShare={url}
                dataCopy={url}
                isDisabled={isDisabled}
            />
            <div style={{ display: 'flex', justifyContent: 'center', width: '100%' }}>
                <img src="./scan_qr.png" style={{ width: '50%' }} alt="Signup" />
            </div>
        </> : <div className='connecting'>
            <Spinner label={t('Loading')} />
        </div>;
};

export default React.memo(SenderComponent);