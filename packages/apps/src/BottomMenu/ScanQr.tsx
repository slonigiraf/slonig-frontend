import React, { useState } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QrScanner } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { Button, Modal, TransferModal } from '@polkadot/react-components';

function ScanQr(): React.ReactElement {
  const { t } = useTranslation();
  const [isQrOpen, toggleQr] = useToggle();
  const [isTransferOpen, toggleTransfer] = useToggle();
  const [recipientId, setRecipientId] = useState('');
  const navigate = useNavigate();

  const processQr = (data: string) => {
    try {
      // Attempt to parse the data as JSON
      const jsonData = JSON.parse(data);

      // Check if the JSON has the expected properties
      if (jsonData.hasOwnProperty('q') && jsonData.hasOwnProperty('d')) {
        // Process based on the 'q' value or other conditions
        switch (jsonData.q) {
          // 0 - is navigation
          case 0:
            navigate(jsonData.d);
            break;
          // Add more cases as needed
          case 1:
            setRecipientId(jsonData.d);
            toggleTransfer();
            break;
          default:
            console.warn("Unknown QR type:", jsonData.q);
            break;
        }
      } else {
        console.error("Invalid QR data structure.");
      }

    } catch (error) {
      console.error("Error parsing QR data as JSON:", error);
    }
    toggleQr();
  }

  return (
    <>
      <Button
        icon='qrcode'
        label=''
        onClick={toggleQr}
      />
      <br /><span>{t('Scan Qr')}</span>
      {isQrOpen && <>
        <Modal
          header={t('Scan a QR code')}
          onClose={toggleQr}
          size='small'
        >
          <Modal.Content>
            <QrScanner
              onResult={(result, error) => {
                if (result != undefined) {
                  processQr(result?.getText())
                }
              }}
              constraints={{ facingMode: 'environment' }}
            />
          </Modal.Content>
        </Modal>
      </>}
      {isTransferOpen && (
        <TransferModal
          key='modal-transfer'
          onClose={toggleTransfer}
          recipientId={recipientId}
        />
      )}
    </>

  );
}

export default ScanQr;