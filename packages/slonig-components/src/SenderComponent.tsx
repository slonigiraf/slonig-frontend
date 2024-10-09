import React, { useEffect, useState } from 'react';
import Peer from 'peerjs';
import { getBaseUrl, QRWithShareAndCopy } from '@slonigiraf/app-slonig-components';

interface SenderComponentProps {
    data: string;    // The data to send over the WebRTC data channel
    route: string;     // A URL that will be displayed as a clickable link and used in the QR code share
    action: any;     // The QRAction passed as a prop (e.g., QRAction.ADD_INSURANCES)
}

const SenderComponent: React.FC<SenderComponentProps> = ({ data, route, action }) => {
    const [qrCodeText, setQrCodeText] = useState<string>('');
    const [url, setUrl] = useState<string>('');
    const [dataConnection, setDataConnection] = useState<any>(null);

    useEffect(() => {
        // Initialize PeerJS
        const peer = new Peer();

        // Once the peer ID is available, set up the QR code text
        peer.on('open', (id) => {
            // Log the PeerJS ID for debugging purposes
            console.log('PeerJS ID:', id);
            const routeWithConnectionId = route + "&c=" + id;
            setUrl(getBaseUrl() + '/#/' + routeWithConnectionId);
            const qrCodeData = JSON.stringify({
                d: routeWithConnectionId,
                q: action
            });
            setQrCodeText(qrCodeData);
            console.log("qrCodeData: "+qrCodeData)
        });

        // Wait for a connection from a remote peer
        peer.on('connection', (conn) => {
            setDataConnection(conn);

            conn.on('open', () => {
                console.log('Data connection opened.');
                // Automatically send the provided data when the connection opens
                if (conn.open) {
                    conn.send(data);
                    console.log('Data sent:', data);
                }
            });

            // conn.on('data', (receivedData) => {
            //     console.log('Data received from peer:', receivedData);
            // });

            conn.on('close', () => {
                console.log('Data connection closed.');
            });
        });

        return () => {
            peer.disconnect();
        };
    }, [data, action]); // Add `data` and `action` as dependencies to ensure they use the latest values

    return (
        <div>
            {qrCodeText && (
                <QRWithShareAndCopy
                    dataQR={qrCodeText}
                    titleShare="QR Code"
                    textShare="Press the link to show diplomas"
                    urlShare={url}
                    dataCopy={url}
                />
            )}
        </div>
    );
};

export default SenderComponent;