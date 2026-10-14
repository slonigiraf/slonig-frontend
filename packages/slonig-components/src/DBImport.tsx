// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { InputFile } from '@polkadot/react-components';
import { useTranslation } from './translate.js';
import { useInfo } from './InfoProvider.js';
import { useLoginContext, useLog } from '@slonigiraf/slonig-components';
import { RestoreService } from './backup/RestoreService.js';
import type { OperationPhase, OperationStatus } from './backup/status.js';

// Restoring keys may navigate away from signup before IndexedDB commits.
// The service must outlive the view and must only cancel on explicit request.
const restoreService = new RestoreService();

// Keep the backup reminder hidden while an import is active. A restored key
// can cause login to activate before the database transaction has committed.
const subscribeRestore = (notify: () => void): (() => void) => restoreService.subscribe(() => notify());
const getRestorePhase = (): OperationPhase => restoreService.status.phase;

export function useRestorePhase(): OperationPhase {
  return useSyncExternalStore(subscribeRestore, getRestorePhase, getRestorePhase);
}

interface Props {
  className?: string;
  onFileSelect: (cancel: () => void) => void;
  onRestoreResult: () => void;
  onProgress?: (status: OperationStatus) => void;
}

function DBImport({ className = '', onFileSelect, onRestoreResult, onProgress }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { showInfo } = useInfo();
  const { setDefaultAccount } = useLoginContext();
  const { logEvent } = useLog();
  const service = restoreService;
  const explicitlyCancelled = useRef(false);
  const [status, setStatus] = useState<OperationStatus>(service.status);

  useEffect(() => service.subscribe((next) => {
    setStatus(next);
    onProgress?.(next);
  }), [service, onProgress]);

  const cancel = useCallback(() => {
    explicitlyCancelled.current = true;
    service.cancel();
  }, [service]);

  const onFile = useCallback((file: File) => {
    explicitlyCancelled.current = false;
    // The fullscreen loading view is managed by CreateAccount, as in the
    // original UI. Provide an explicit cancel action without tying it to unmount.
    onFileSelect(cancel);
    void service.restore(file, setDefaultAccount).then(() => {
      logEvent('AUTHENTICATION', 'RESTORE_SUCCESS', 'restore_success_kb', Math.round(file.size / 1024));
      showInfo(service.status.warnings.length ? t('Restore completed with warnings') : t('Restored'));
    }).catch((error: Error) => {
      if (explicitlyCancelled.current && service.status.phase === 'cancelled') {
        showInfo(t('Restore cancelled'));
      } else {
        logEvent('AUTHENTICATION', 'RESTORE_ERROR', 'restore_error_kb', Math.round(file.size / 1024));
        console.error('Restore failed:', error);
        showInfo(t('Restore failed. Check the backup file and try again.'), 'error');
      }
    }).finally(onRestoreResult);
  }, [cancel, service, onFileSelect, onRestoreResult, setDefaultAccount, logEvent, showInfo, t]);

  const running = ['validating', 'staging', 'committing'].includes(status.phase);
  return (
    <div className={`${className} full`}>
      <InputFile
        accept={['.slonig']}
        className='full'
        isDisabled={running}
        label={t('Upload your backup file')}
        placeholder={t('click to select *.slonig file')}
        onFile={onFile}
        withLabel
      />
      {!running && status.error && <p role='alert'>{/unsupported|invalid|malformed|checksum|truncated|incomplete|extension|metadata|footer/i.test(status.error)
        ? t('This backup file is invalid or unsupported.')
        : t('Restore failed. Check the backup file and try again.')}</p>}
      {!running && status.warnings.length > 0 && <p role='status'>{t('Restore warnings')}</p>}
    </div>
  );
}

export default React.memo(DBImport);
