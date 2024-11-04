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
  const { showInfo, hideInfo } = useInfo();
  const [isQROpen, toggleQR] = useToggle();
  const {setIsTransferOpen, setRecipientId} = useTokenTransfer();
  const navigate = useNavigate();
  const { currentPair, isLoggedIn } = useLoginContext();
  const { isIpfsReady } = useIpfsContext();

  // Process the scanned QR data
  const processQR = useCallback(async (data: string) => {
    toggleQR();
    try {
      const qrJSON = JSON.parse(data);
      // Validate JSON properties
      if (qrJSON.hasOwnProperty('q')) {
        if (!type || (type === qrJSON.q)) {
          const maxLoadingSec = 60;
          switch (qrJSON.q) {
            case QRAction.NAVIGATION:
              console.log(qrJSON)
              navigate(qrJSON.d);
              break;
            case QRAction.TRANSFER:
              await storePseudonym(qrJSON.p, qrJSON.n);
              const recipientAddress = qrJSON.p ? encodeAddress(hexToU8a(qrJSON.p)) : "";
              setRecipientId(recipientAddress);
              setIsTransferOpen(true);
              break;
            case QRAction.ADD_DIPLOMA:
              if (!isLoggedIn) {
                showInfo(t('Please log in first'), 'error');
              } else {
                navigate(`diplomas?${QRField.WEBRTC_PEER_ID}=${qrJSON[QRField.WEBRTC_PEER_ID]}`);
              }
              break;
            case QRAction.BUY_DIPLOMAS:
              await storePseudonym(qrJSON.p, qrJSON.n);
              showInfo(t('Loading'), 'info', maxLoadingSec)
              const diplomasFromUrl = await receiveWebRTCData(qrJSON[QRField.WEBRTC_PEER_ID], maxLoadingSec * 1000);
              hideInfo();
              const dimplomasJson = parseJson(diplomasFromUrl);
              try {
                const dimplomasJsonWithMeta = {
                  q: QRAction.BUY_DIPLOMAS,
                  p: qrJSON.p,
                  n: qrJSON.n,
                  t: qrJSON.t,
                  d: dimplomasJson
                };
                await storeInsurances(dimplomasJsonWithMeta);
              } catch (error) {
                console.error("Failed to save diplomas:", error);
              }
              navigate(`diplomas/teacher?t=${qrJSON.t}&student=${qrJSON.p}`);//TODO remove 't=${qrJSON.t}&'
              break;
            case QRAction.LEARN_MODULE:
              if (!isLoggedIn) {
                showInfo(t('Please log in first'), 'error');
              } else {
                navigate(`diplomas/tutor?${QRField.WEBRTC_PEER_ID}=${qrJSON[QRField.WEBRTC_PEER_ID]}`);
              }
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
            case QRAction.SKILL:
              const parts = qrJSON.d.split('+');
              if (parts.length > 1) {
                await storePseudonym(parts[2], qrJSON.n);
              }
              navigate(qrJSON.d);
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
        onClick={toggleQR}
        isDisabled={!isIpfsReady}
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