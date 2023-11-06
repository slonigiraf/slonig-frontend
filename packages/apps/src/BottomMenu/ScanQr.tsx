import React, { useState, useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QrScanner } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { Modal, TransferModal } from '@polkadot/react-components';
import { ButtonWithLabelBelow } from './ButtonWithLabelBelow';
import { createAndStoreLetter } from '@slonigiraf/app-recommendations';

function ScanQr(): React.ReactElement {
  const { t } = useTranslation();
  const [isQrOpen, toggleQr] = useToggle();
  const [isTransferOpen, toggleTransfer] = useToggle();
  const [recipientId, setRecipientId] = useState<string>('');
  const navigate = useNavigate();

  // Process the scanned QR data
  const processQr = useCallback(async (data: string) => {
    try {
      const jsonData = JSON.parse(data);

      // Validate JSON properties
      if (jsonData.hasOwnProperty('q') && jsonData.hasOwnProperty('d')) {
        switch (jsonData.q) {
          case 0: // Navigation
            navigate(jsonData.d);
            break;
          case 1: // Transfer
            setRecipientId(jsonData.d);
            toggleTransfer();
            break;
          case 2: // Add a letter
            const dataArray = jsonData.d.split(",");
            await createAndStoreLetter(dataArray);
            navigate('recommendations');
            break;
          default:
            console.warn("Unknown QR type:", jsonData.q);
        }
      } else {
        console.error("Invalid QR data structure.");
      }
    } catch (error) {
      console.error("Error parsing QR data as JSON:", error);
    }
    toggleQr();
  }, [navigate, toggleQr, toggleTransfer]);

  // Handle the QR Scanner result
  const handleQrResult = useCallback((result, error) => {
    if (result != undefined) {
      processQr(result?.getText());
    }
  }, [processQr]);

  return (
    <>
      <ButtonWithLabelBelow
        icon='qrcode'
        label={t('Scan Qr')}
        onClick={toggleQr}
      />
      {isQrOpen && (
        <Modal
          header={t('Scan a QR code')}
          onClose={toggleQr}
          size='small'
        >
          <Modal.Content>
            <QrScanner
              onResult={handleQrResult}
              constraints={{ facingMode: 'environment' }}
            />
          </Modal.Content>
        </Modal>
      )}
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

export default React.memo(ScanQr);