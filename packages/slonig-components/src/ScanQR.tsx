import React, { useCallback, useState } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { parseJson, QRScanner, receiveWebRTCData, useIpfsContext, useLoginContext, useTokenTransfer } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { Modal } from '@polkadot/react-components';
import { ButtonWithLabelBelow, useInfo } from '@slonigiraf/app-slonig-components';
import { storeLesson, storeInsurances, storePseudonym, storeSetting, QRField, SettingKey, QRAction } from '@slonigiraf/db';
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a, u8aToHex } from '@polkadot/util';
interface QRCodeResult {
  getText: () => string;
}
interface Props {
  className?: string;
  label?: string;
  type?: number;
}

function ScanQR({ className = '', label, type }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const [isQROpen, toggleQR] = useToggle();
  const { setIsTransferOpen, setRecipientId } = useTokenTransfer();
  const navigate = useNavigate();
  const { isLoggedIn } = useLoginContext();

  const scan = useCallback(() => {
    if (isLoggedIn) {
      toggleQR();
    } else {
      showInfo(t('Please log in first'), 'error');
    }
  }, [isLoggedIn, toggleQR]);

  // Process the scanned QR data
  const processQR = useCallback(async (data: string) => {
    toggleQR();
    try {
      const qrJSON = JSON.parse(data);
      // Validate JSON properties
      if (qrJSON.hasOwnProperty(QRField.QR_ACTION)) {
        if (!type || (type === qrJSON[QRField.QR_ACTION])) {
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
              navigate(`diplomas/teacher?${QRField.WEBRTC_PEER_ID}=${qrJSON[QRField.WEBRTC_PEER_ID]}`);
              break;
            case QRAction.LEARN_MODULE:
              navigate(`diplomas/tutor?${QRField.WEBRTC_PEER_ID}=${qrJSON[QRField.WEBRTC_PEER_ID]}`);
              break;
            case QRAction.TUTOR_IDENTITY:
              await storePseudonym(qrJSON.p, qrJSON.n);
              await storeSetting(SettingKey.TUTOR, qrJSON.p);
              if (type) {
                navigate(`?tutor=${qrJSON.p}`);
              } else {
                navigate(`knowledge?tutor=${qrJSON.p}`);
              }
              break;
            case QRAction.TEACHER_IDENTITY:
              await storePseudonym(qrJSON.p, qrJSON.n);
              await storeSetting(SettingKey.TEACHER, qrJSON.p);
              if (type) {
                navigate(`?teacher=${qrJSON.p}`);
              } else {
                navigate(`diplomas?teacher=${qrJSON.p}`);
              }
              break;
            default:
              console.warn("Unknown QR type:", qrJSON.q);
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