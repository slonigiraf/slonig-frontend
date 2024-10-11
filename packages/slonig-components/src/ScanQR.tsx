import React, { useState, useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QRScanner } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { Modal, TransferModal } from '@polkadot/react-components';
import { ButtonWithLabelBelow, useInfo, QRAction } from '@slonigiraf/app-slonig-components';
import { createAndStoreLetter, storeInsurances, storePseudonym, storeSetting } from '@slonigiraf/app-recommendations';
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a } from '@polkadot/util';

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
            case QRAction.PEER:
              window.alert('wow')
              navigate(jsonData.d);
              break;
            case QRAction.NAVIGATION:
              console.log(jsonData)
              navigate(jsonData.d);
              break;
            case QRAction.TRANSFER:
              await storePseudonym(jsonData.p, jsonData.n);
              const recipientAddress = jsonData.p ? encodeAddress(hexToU8a(jsonData.p)) : "";
              setRecipientId(recipientAddress);
              toggleTransfer();
              break;
            case QRAction.ADD_DIPLOMA:
              const dataArray = jsonData.d.split(",");
              await createAndStoreLetter(dataArray);
              navigate('diplomas');
              break;
            case QRAction.SELL_DIPLOMAS:
              await storePseudonym(jsonData.p, jsonData.n);
              await storeInsurances(jsonData);
              navigate(`diplomas/teacher?t=${jsonData.t}&student=${jsonData.p}`);
              break;
            case QRAction.TUTOR_IDENTITY:
              await storePseudonym(jsonData.p, jsonData.n);
              await storeSetting("tutor", jsonData.p);
              if (type) {
                navigate(`?tutor=${jsonData.p}`);
              } else {
                navigate(`knowledge?tutor=${jsonData.p}`);
              }
              break;
            case QRAction.SKILL:
              const parts = jsonData.d.split('+');
              if (parts.length > 1) {
                await storePseudonym(parts[2], jsonData.n);
              }
              navigate(jsonData.d);
              break;
            case QRAction.TEACHER_IDENTITY:
              await storePseudonym(jsonData.p, jsonData.n);
              await storeSetting("teacher", jsonData.p);
              if (type) {
                navigate(`?teacher=${jsonData.p}`);
              } else {
                navigate(`diplomas?teacher=${jsonData.p}`);
              }
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