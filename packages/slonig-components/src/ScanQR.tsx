import React, { useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QRScanner, useLoginContext, useTokenTransfer, QRField, QRAction } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { Modal } from '@polkadot/react-components';
import { ButtonWithLabelBelow } from '@slonigiraf/app-slonig-components';
import { storePseudonym } from '@slonigiraf/db';
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a } from '@polkadot/util';
interface QRCodeResult {
  getText: () => string;
}
interface Props {
  className?: string;
  label?: string;
}

function ScanQR({ className = '', label }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const [isQROpen, toggleQR] = useToggle();
  const { setIsTransferOpen, setRecipientId } = useTokenTransfer();
  const navigate = useNavigate();
  const { isLoggedIn, setLoginIsRequired } = useLoginContext();

  const scan = useCallback(() => {
    if (isLoggedIn) {
      toggleQR();
    } else {
      setLoginIsRequired(true);
    }
  }, [isLoggedIn, setLoginIsRequired, toggleQR]);

  // Process the scanned QR data
  const processQR = useCallback(async (data: string) => {
    toggleQR();
    try {
      const qrJSON = JSON.parse(data);
      // Validate JSON properties
      if (qrJSON.hasOwnProperty(QRField.QR_ACTION)) {
        switch (qrJSON[QRField.QR_ACTION]) {
          case QRAction.NAVIGATION:
            navigate(qrJSON[QRField.DATA]);
            break;
          case QRAction.TRANSFER:
            await storePseudonym(qrJSON.p, qrJSON.n);
            const recipientAddress = qrJSON.p ? encodeAddress(hexToU8a(qrJSON.p)) : "";
            setRecipientId(recipientAddress);
            setIsTransferOpen(true);
            break;
          case QRAction.ADD_DIPLOMA:
            navigate(`diplomas?${QRField.WEBRTC_PEER_ID}=${qrJSON[QRField.WEBRTC_PEER_ID]}`);
            break;
          case QRAction.BUY_DIPLOMAS:
            navigate(`diplomas/assess?${QRField.WEBRTC_PEER_ID}=${qrJSON[QRField.WEBRTC_PEER_ID]}`);
            break;
          case QRAction.LEARN_MODULE:
            navigate(`diplomas/teach?${QRField.WEBRTC_PEER_ID}=${qrJSON[QRField.WEBRTC_PEER_ID]}`);
            break;
          case QRAction.TEACHER_IDENTITY:
            navigate(`diplomas?teacher=${qrJSON.p}`);
            break;
          default:
            console.warn("Unknown QR type:", qrJSON.q);
        }

      } else {
        console.error("Invalid QR data structure.");
      }
    } catch (error) {
      console.error("Error parsing QR data as JSON:", error);
    }
  }, [navigate, toggleQR, setIsTransferOpen]);

  // Handle the QR Scanner result
  const handleQRResult = useCallback((result: QRCodeResult | undefined, _e: Error | undefined) => {
    if (result != undefined) {
      processQR(result?.getText());
    }
  }, [processQR]);

  return (
    <>
      <ButtonWithLabelBelow
        icon='qrcode'
        label={label}
        onClick={scan}
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
    </>
  );
}

export default React.memo(ScanQR);