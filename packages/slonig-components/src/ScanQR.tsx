import React, { useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QRScanner, scanSVG, useLoginContext } from '@slonigiraf/app-slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { Modal } from '@polkadot/react-components';
import { ButtonWithLabelBelow } from '@slonigiraf/app-slonig-components';
import { setSettingToTrue, SettingKey } from '@slonigiraf/db';
import { useBooleanSettingValue } from './useSettingValue.js';
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
  const navigate = useNavigate();
  const { isLoggedIn, setLoginIsRequired } = useLoginContext();
  const isScanTutorialCompleted = useBooleanSettingValue(SettingKey.SCAN_TUTORIAL_COMPLETED);
  const isTuteeTutorialCompleted = useBooleanSettingValue(SettingKey.TUTEE_TUTORIAL_COMPLETED);
  const showHint = !isScanTutorialCompleted && isTuteeTutorialCompleted;

  const scan = useCallback(async () => {
    await setSettingToTrue(SettingKey.SCAN_TUTORIAL_COMPLETED);
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
  }, [navigate, toggleQR]);

  // Handle the QR Scanner result
  const handleQRResult = useCallback((result: QRCodeResult | undefined, _e: Error | undefined) => {
    if (result != undefined) {
      processQR(result?.getText());
    }
  }, [processQR]);

  return (
    <>
      <ButtonWithLabelBelow
        svg={scanSVG}
        label={label}
        onClick={scan}
        hint={t('Next time, use this button to scan.')}
        showHint={showHint}
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