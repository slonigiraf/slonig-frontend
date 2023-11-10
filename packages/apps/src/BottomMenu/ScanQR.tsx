import React, { useState, useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QRScanner } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../translate.js';
import { Modal, TransferModal } from '@polkadot/react-components';
import { ButtonWithLabelBelow } from './ButtonWithLabelBelow';
import { createAndStoreLetter } from '@slonigiraf/app-recommendations';

function ScanQR(): React.ReactElement {
  const { t } = useTranslation();
  const [isQROpen, toggleQR] = useToggle();
  const [isTransferOpen, toggleTransfer] = useToggle();
  const [recipientId, setRecipientId] = useState<string>('');
  const navigate = useNavigate();

  // Process the scanned QR data
  const processQR = useCallback(async (data: string) => {
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
          case 2: // Add a diploma
            const dataArray = jsonData.d.split(",");
            await createAndStoreLetter(dataArray);
            navigate('diplomas');
            break;
          case 3: // See a list of student's diplomas
            // await storeInsurances(jsonData);
            navigate(`diplomas/teacher?student=${jsonData.s}`);
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
    toggleQR();
  }, [navigate, toggleQR, toggleTransfer]);

  // Handle the QR Scanner result
  const handleQRResult = useCallback((result, error) => {
    if (result != undefined) {
      processQR(result?.getText());
    }
  }, [processQR]);

  return (
    <>
      <ButtonWithLabelBelow
        icon='qrcode'
        label={t('Scan QR')}
        onClick={toggleQR}
      />
      {isQROpen && (
        <Modal
          header={t('Scan a QR code')}
          onClose={toggleQR}
          size='small'
        >
          <Modal.Content>
            <QRScanner
              onResult={handleQRResult}
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

export default React.memo(ScanQR);