// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React, { useCallback, useEffect, useState } from 'react';
import { styled } from '@polkadot/react-components';
import { ButtonWithLabelBelow, RoundProgress, useLog } from '@slonigiraf/slonig-components';
import { useLoginContext } from './LoginContext.js';
import { useInfo } from './InfoProvider.js';
import { useTranslation } from './translate.js';
import { BackupService } from './backup/BackupService.js';
import { nameFromKeyringPair } from './utils.js';
import type { OperationStatus } from './backup/status.js';

interface Props {
  className?: string;
  caption?: string;
  onSuccess: () => void;
}

function DBExport({ className = '', caption, onSuccess }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const { currentPair } = useLoginContext();
  const { logEvent } = useLog();
  const { showInfo, showBackupWarnings } = useInfo();
  const [service] = useState(() => new BackupService());
  const [status, setStatus] = useState<OperationStatus>(service.status);
  useEffect(() => service.subscribe(setStatus), [service]);
  useEffect(() => () => service.cancel(), [service]);
  const [showCompleted, setShowCompleted] = useState(false);
  useEffect(() => {
    if (!['saved', 'download-initiated'].includes(status.phase)) {
      setShowCompleted(false);
      return;
    }
    // Display a real 100% briefly before returning to the download button.
    setShowCompleted(true);
    const timer = setTimeout(() => setShowCompleted(false), 1200);
    return () => clearTimeout(timer);
  }, [status.phase]);

  const start = useCallback(() => {
    // File System Access permissions need the original click event.
    void service.start(currentPair?.address, nameFromKeyringPair(currentPair) || currentPair?.meta.name || currentPair?.address, t('Slonig backup archive')).then(() => {
      if (service.status.phase === 'saved' || service.status.phase === 'download-initiated') {
        logEvent('AUTHENTICATION', 'BACKUP_SUCCESS');
        // Incomplete backups need details, while clean native and browser
        // downloads retain the usual localized success notification.
        if (service.status.warnings.length) {
          showBackupWarnings(service.status.warnings);
        } else {
          showInfo(t('Backup completed'));
        }
        // Browser downloads count as completed for the deletion safeguard once
        // the download has been launched, even without native file confirmation.
        onSuccess();
      }
    }).catch((error: Error) => {
      if (error.name !== 'AbortError') logEvent('AUTHENTICATION', 'BACKUP_ERROR');
    });
  }, [service, currentPair, onSuccess, logEvent, showInfo, showBackupWarnings, t]);

  const running = ['generating', 'generated'].includes(status.phase) ||
    (showCompleted && ['saved', 'download-initiated'].includes(status.phase));
  // All phases use one monotone percentage; 100% means the native save
  // completed or the browser download was launched.
  const hasKnownTotal = status.total > 0;
  const percent = hasKnownTotal
    ? Math.max(0, Math.min(100, Math.floor(status.completed * 100 / status.total)))
    : undefined;
  const hasFeedback = status.phase === 'error';
  const backupCompleted = status.phase === 'saved' || status.phase === 'download-initiated';

  return (
    <StyledDiv className={`shrink${hasFeedback ? ' backup-has-message' : ''}${backupCompleted && !running ? ' backup-completed' : ''}`}>
      <div className='backup-control'>
        {running ? (
          <div
            aria-label={t('Backup')}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            aria-valuetext={hasKnownTotal ? undefined : t('Loading')}
            role='progressbar'
          >
            <RoundProgress value={hasKnownTotal ? status.completed : 0} total={hasKnownTotal ? status.total : 1} />
          </div>
        ) : (
          <ButtonWithLabelBelow
            className={className}
            icon={backupCompleted ? 'arrows-rotate' : 'download'}
            label={backupCompleted ? t('Backup again') : (caption ?? t('Download'))}
            onClick={start}
            isDisabled={!currentPair}
          />
        )}
      </div>
      {/* Keep errors visible after failure. Warning details are presented in
          a persistent app-level modal, even if this control unmounts. */}
      {status.phase === 'error' && status.error && <p role='alert'>{/too large|memory limit|safe per-frame limit/i.test(status.error)
        ? t('The backup is too large for this browser.')
        : t('Backup failed. Please try again.')}</p>}
    </StyledDiv>
  );
}

const StyledDiv = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  width: 75px;
  height: 75px;
  min-width: 75px;
  max-width: 75px;
  overflow: hidden;

  /* The settings page's .ui--row normally stretches direct children to
     100% width. The 'shrink' class above preserves the original left edge. */
  .backup-control {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 75px;
  }
  /* Localized 'Backup again' text can be longer than the initial 'Download'. */
  &.backup-completed {
    width: fit-content;
    min-width: 75px;
    max-width: 180px;
    height: auto;
    min-height: 75px;
    overflow: visible;
  }
  &.backup-has-message {
    align-items: flex-start;
    width: min(400px, 100%);
    height: auto;
    max-width: 400px;
    overflow: visible;
  }
  p {
    overflow-wrap: anywhere;
    text-align: left;
    margin: 2px 0;
  }
`;
export default React.memo(DBExport);
