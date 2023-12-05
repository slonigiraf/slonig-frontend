import React, { useState, useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QRScanner } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from '../../apps/src/translate.js';
import { Modal, TransferModal } from '@polkadot/react-components';
import { ButtonWithLabelBelow, useInfo } from '@slonigiraf/app-slonig-components';
import { createAndStoreLetter, storeInsurances, storePseudonym, storeSetting } from '@slonigiraf/app-recommendations';

interface Props {
  className?: string;
  label?: string;
  type?: number;
}

function ScanQR({ className = '', label, type }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [isQROpen, toggleQR] = useToggle();
  const [isTransferOpen, toggleTransfer] = useToggle();
  const [recipientId, setRecipientId] = useState<string>('');
  const navigate = useNavigate();
  const { showInfo } = useInfo();

  // Process the scanned QR data
  const processQR = useCallback(async (data: string) => {
    try {
      const jsonData = JSON.parse(data);

      // Validate JSON properties
      if (jsonData.hasOwnProperty('q')) {
        if (!type || (type === jsonData.q)) {
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
              await storeInsurances(jsonData);
              navigate(`diplomas/teacher?student=${jsonData.p}`);
              break;
            case 4: // Show tutor's identity
              // TODO: Store tutor pseudonym
              await storePseudonym(jsonData.p, jsonData.n);
              await storeSetting("currentTutor", jsonData.p);
              if(type){
                navigate(`?tutor=${jsonData.p}`);
              } else{
                navigate(`knowledge?tutor=${jsonData.p}`);
              }
              break;
            case 5: // Show skill QR
              const parts = jsonData.d.split('+');
              if (parts.length > 1) {
                await storePseudonym(parts[2], jsonData.n);
              }
              navigate(jsonData.d);
              break;
            default:
              console.warn("Unknown QR type:", jsonData.q);
          }
        } else {
          showInfo(t('Wrong QR type'))
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
        label={label}
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