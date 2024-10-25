import React, { useState, useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { getIPFSDataFromContentID, parseJson, QRField, QRScanner, receiveWebRTCData, useIpfsContext, useLoginContext } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { Modal, TransferModal } from '@polkadot/react-components';
import { ButtonWithLabelBelow, useInfo, QRAction } from '@slonigiraf/app-slonig-components';
import { storeLesson, createAndStoreLetter, storeInsurances, storePseudonym, storeSetting, Session as Lesson } from '@slonigiraf/app-recommendations';
import { encodeAddress } from '@polkadot/keyring';
import { hexToU8a, u8aToHex } from '@polkadot/util';
interface Props {
  className?: string;
  label?: string;
  type?: number;
}

function ScanQR({ className = '', label, type }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo, hideInfo } = useInfo();
  const [isQROpen, toggleQR] = useToggle();
  const [isTransferOpen, toggleTransfer] = useToggle();
  const [recipientId, setRecipientId] = useState<string>('');
  const navigate = useNavigate();
  const { currentPair, isLoggedIn } = useLoginContext();
  const { ipfs, isIpfsReady } = useIpfsContext();

  // Process the scanned QR data
  const processQR = useCallback(async (data: string) => {
    toggleQR();
    try {
      const qrJSON = JSON.parse(data);
      // Validate JSON properties
      if (qrJSON.hasOwnProperty('q')) {
        if (!type || (type === qrJSON.q)) {
          switch (qrJSON.q) {
            case QRAction.NAVIGATION:
              console.log(qrJSON)
              navigate(qrJSON.d);
              break;
            case QRAction.TRANSFER:
              await storePseudonym(qrJSON.p, qrJSON.n);
              const recipientAddress = qrJSON.p ? encodeAddress(hexToU8a(qrJSON.p)) : "";
              setRecipientId(recipientAddress);
              toggleTransfer();
              break;
            case QRAction.ADD_DIPLOMA:
              const dataArray = qrJSON.d.split(",");
              try {
                const content = await getIPFSDataFromContentID(ipfs, dataArray[0]);
                const json = parseJson(content);
                const knowledgeId: string = json.i;
                await createAndStoreLetter([...dataArray,knowledgeId]);
                navigate('diplomas');
              } catch (e) {
                console.log(e);
              }
              break;
            case QRAction.BUY_DIPLOMAS:
              await storePseudonym(qrJSON.p, qrJSON.n);
              const maxLoadingSec = 60;
              showInfo(t('Loading'), 'info', maxLoadingSec)
              const diplomasFromUrl = await receiveWebRTCData(qrJSON.c, maxLoadingSec * 1000);
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
              navigate(`diplomas/teacher?t=${qrJSON.t}&student=${qrJSON.p}`);
              break;
            case QRAction.LEARN_MODULE:
              if (!isLoggedIn) {
                showInfo(t('Please log in first'), 'error');
              } else {
                await storePseudonym(qrJSON[QRField.PERSON_IDENTITY], qrJSON[QRField.PERSON_NAME]);
                const maxLoadingSec = 60;
                showInfo(t('Loading'), 'info', maxLoadingSec);
                try {
                  const webRTCData = await receiveWebRTCData(qrJSON.c, maxLoadingSec * 1000);
                  hideInfo();
                  const webRTCJSON = parseJson(webRTCData);
                  console.log("Data received: " + JSON.stringify(webRTCJSON, null, 2));
                  const tutorPublicKeyHex = u8aToHex(currentPair?.publicKey);
                  await storeLesson(tutorPublicKeyHex, qrJSON, webRTCJSON);
                } catch (error) {
                  showInfo(t('Ask to regenerate the QR'), 'error');
                  console.error("Failed to save lesson:", error);
                }
                navigate(`diplomas/tutor?s=${qrJSON.s}`);
              }
              break;
            case QRAction.TUTOR_IDENTITY:
              await storePseudonym(qrJSON.p, qrJSON.n);
              await storeSetting("tutor", qrJSON.p);
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
              await storeSetting("teacher", qrJSON.p);
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