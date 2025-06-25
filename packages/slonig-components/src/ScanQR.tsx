import React, { useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QRScanner, useLoginContext, useTokenTransfer } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { Modal } from '@polkadot/react-components';
import { ButtonWithLabelBelow } from '@slonigiraf/app-slonig-components';
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
  const processQR = useCallback(async (url: string) => {
    toggleQR();
    // example of url: http://localhost:3000/#/badges/teach?c=39b5fd47-a425-4a8d-a32b-81635bba09a6
    const [_domain, path] = url.split('/#')
    path && navigate(path);
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