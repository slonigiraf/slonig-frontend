import React, { useEffect, useState } from 'react';
import Peer from 'peerjs';
import { QRWithShareAndCopy } from '@slonigiraf/app-slonig-components';

interface SenderComponentProps {
    data: string;    // The data to send over the WebRTC data channel
    url: string;     // A URL that will be displayed as a clickable link and used in the QR code share
    action: any;     // The QRAction passed as a prop (e.g., QRAction.ADD_INSURANCES)
}

const SenderComponent: React.FC<SenderComponentProps> = ({ data, url, action }) => {
    const [qrCodeText, setQrCodeText] = useState<string>('');
    const [urlWithConnectionInfo, setUrlWithConnectionInfo] = useState<string>(url);
    const [dataConnection, setDataConnection] = useState<any>(null);

    useEffect(() => {
        // Initialize PeerJS
        const peer = new Peer();

        // Once the peer ID is available, set up the QR code text
        peer.on('open', (id) => {
            // Log the PeerJS ID for debugging purposes
            console.log('PeerJS ID:', id);

            // Prepare the QR code data containing the Peer ID as "c"
            const offerWithC = {
                c: id,    // The Peer ID is assigned to "c" in the QR code
                q: action // Use the action parameter passed into the component
            };
            const qrCodeData = JSON.stringify(offerWithC);
            setQrCodeText(qrCodeData);
            setUrlWithConnectionInfo(url + "&c=" + id);
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
                    urlShare={urlWithConnectionInfo}
                    dataCopy={urlWithConnectionInfo}
                />
            )}
        </div>
    );
};

export default SenderComponent;