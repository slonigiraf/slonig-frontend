import React, { useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QRScanner, useLoginContext, useTokenTransfer } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { CustomSVGIcon, Modal } from '@polkadot/react-components';
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

  const slonSvg = (
    <svg viewBox="0 0 1040 1024" version="1.1" xmlns="http://www.w3.org/2000/svg"><path d="M331.312778 27.631314l0-0.002047L200.124923 27.629267c-93.889367 0-170.006975 76.115562-170.006975 170.006975l0 131.107013c0 0.024559 0 0.053212 0 0.080841 0 33.271778 26.970258 60.239989 60.238966 60.239989 33.269731 0 60.239989-26.968212 60.239989-60.239989l0-0.002047 0 0L150.596903 211.858152c0-35.208896 28.54308-63.751976 63.752999-63.751976l116.879987 0c0.024559 0 0.053212 0.002047 0.080841 0.002047 33.268708 0 60.239989-26.968212 60.239989-60.238966C391.549697 54.601572 364.579439 27.631314 331.312778 27.631314z"  /><path d="M993.938334 690.254823c0-33.267685-26.969235-60.236919-60.238966-60.236919s-60.238966 26.969235-60.238966 60.236919l0 0.002047 0 0 0 116.962875c0 35.20992-28.544103 63.752999-63.754023 63.752999L692.743504 870.972744c-33.268708 0-60.241013 26.970258-60.241013 60.237943 0 33.270754 26.972305 60.238966 60.241013 60.238966 0.026606 0 0.054235-0.002047 0.082888-0.002047l131.104967 0c93.892437 0 170.006975-76.116585 170.006975-170.007999L993.938334 690.25687l0 0L993.938334 690.254823z"  /><path d="M331.312778 870.972744 214.349903 870.972744c-35.20992 0-63.752999-28.54308-63.752999-63.752999L150.596903 690.25687l0 0 0-0.002047c0-33.267685-26.970258-60.236919-60.239989-60.236919-33.268708 0-60.238966 26.969235-60.238966 60.236919 0 0.026606 0 0.056282 0 0.080841l0 131.103944c0 93.891414 76.117608 170.007999 170.006975 170.007999l131.104967 0c0.028653 0 0.056282 0.002047 0.082888 0.002047 33.269731 0 60.239989-26.968212 60.239989-60.238966C391.551744 897.943003 364.581486 870.972744 331.312778 870.972744z"  /><path d="M823.931359 27.629267l-131.187855 0 0 0.002047c-33.268708 0-60.241013 26.970258-60.241013 60.237943 0 33.270754 26.972305 60.238966 60.241013 60.238966 0.026606 0 0.054235-0.002047 0.082888-0.002047l116.879987 0c35.20992 0 63.754023 28.54308 63.754023 63.751976l0 116.966968 0 0c0 33.271778 26.969235 60.237943 60.238966 60.237943s60.238966-26.966165 60.238966-60.237943l0 0L993.938334 197.636243C993.938334 103.744829 917.823795 27.629267 823.931359 27.629267z"  /><path d="M963.820386 449.299983c-0.026606 0-0.056282 0.002047-0.080841 0.002047L60.321854 449.302029c-0.028653 0-0.056282-0.002047-0.082888-0.002047-33.270754 0-60.238966 26.970258-60.238966 60.241013 0 33.266661 26.968212 60.237943 60.238966 60.237943l903.579373 0 0 0 0.002047 0c33.267685 0 60.234873-26.970258 60.234873-60.237943C1024.055259 476.270241 997.087047 449.299983 963.820386 449.299983z"  /></svg>
  );

  return (
    <>
      <ButtonWithLabelBelow
        svg={<CustomSVGIcon svg={slonSvg} />}
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