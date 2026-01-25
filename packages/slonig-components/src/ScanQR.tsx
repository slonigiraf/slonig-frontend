import React, { useCallback } from 'react';
import { useToggle } from '@polkadot/react-hooks';
import { QrScannerComponent, scanSVG, useLog, useLoginContext } from '@slonigiraf/slonig-components';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from './translate.js';
import { Modal } from '@polkadot/react-components';
import { ButtonWithLabelBelow } from '@slonigiraf/slonig-components';
import { setSettingToTrue, SettingKey } from '@slonigiraf/db';
import { useBooleanSettingValue } from './useSettingValue.js';
interface Props {
  className?: string;
  label?: string;
}

function ScanQR({ className = '', label }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { logEvent } = useLog();
  const [isQROpen, toggleQR] = useToggle();
  const navigate = useNavigate();
  const { isLoggedIn, setLoginIsRequired } = useLoginContext();
  const isScanTutorialCompleted = useBooleanSettingValue(SettingKey.SCAN_TUTORIAL_COMPLETED);
  const isTuteeTutorialCompleted = useBooleanSettingValue(SettingKey.TUTEE_TUTORIAL_COMPLETED);
  const showHint = !isScanTutorialCompleted && isTuteeTutorialCompleted;

  const scan = useCallback(async () => {
    await setSettingToTrue(SettingKey.SCAN_TUTORIAL_COMPLETED);
    if (isLoggedIn) {
      logEvent('SCAN', 'SCAN_OPEN');
      toggleQR();
    } else {
      setLoginIsRequired(true);
    }
  }, [isLoggedIn, setLoginIsRequired, toggleQR, logEvent]);

  // Process the scanned QR data
  const processQR = useCallback(async (url: string) => {
    const allowedHosts = new Set(['localhost', 'app.slonig.org', 'dev-app.slonig.org']);

    let parsed: URL;

    try {
      // Supports absolute URLs. If someone gives "/#/badges/...", treat it as localhost (optional).
      parsed = url.startsWith('http://') || url.startsWith('https://')
        ? new URL(url)
        : new URL(url, 'http://localhost');
    } catch {
      return;
    }

    if (!allowedHosts.has(parsed.hostname)) {
      return;
    }

    const idx = url.indexOf('/#');
    if (idx === -1) {
      return;
    }

    const path = url.slice(idx + 2);
    if (!path) {
      return;
    }

    logEvent('SCAN', 'SCAN_SUCCESS');
    toggleQR();
    navigate(path);
  }, [navigate, toggleQR]);

  // Handle the QR Scanner result
  const handleQRResult = useCallback((result: string) => {
    if (result != undefined) {
      processQR(result);
    }
  }, [processQR]);

  const manuallyClose = useCallback(() => {
    logEvent('SCAN', 'SCAN_MANUAL_CLOSE');
    toggleQR();
  }, [toggleQR, logEvent]);

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
          onClose={manuallyClose}
          size='small'
        >
          <Modal.Content>
            <QrScannerComponent
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