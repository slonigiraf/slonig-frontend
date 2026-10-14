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
  const { showInfo } = useInfo();
  const [service] = useState(() => new BackupService());
  const [status, setStatus] = useState<OperationStatus>(service.status);
  useEffect(() => service.subscribe(setStatus), [service]);
  useEffect(() => () => service.cancel(), [service]);
  const [showCompleted, setShowCompleted] = useState(false);
  useEffect(() => {
    if (status.phase !== 'saved' && status.phase !== 'confirmed') {
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
    void service.start(currentPair?.address, nameFromKeyringPair(currentPair) || currentPair?.meta.name || currentPair?.address).then(() => {
      if (service.status.phase === 'saved') {
        logEvent('AUTHENTICATION', 'BACKUP_SUCCESS');
        showInfo(t(service.status.warnings.length ? 'Backup completed with warnings' : 'Backup completed'));
        onSuccess();
      } else if (service.status.phase === 'download-initiated') {
        showInfo(t('Backup download started'));
      }
    }).catch((error: Error) => {
      if (error.name !== 'AbortError') logEvent('AUTHENTICATION', 'BACKUP_ERROR');
    });
  }, [service, currentPair, onSuccess, logEvent, showInfo, t]);

  const confirm = useCallback(() => {
    void service.confirmFallbackDownload().then(() => {
      logEvent('AUTHENTICATION', 'BACKUP_SUCCESS');
      showInfo(t(service.status.warnings.length ? 'Backup completed with warnings' : 'Backup completed'));
      onSuccess();
    }).catch((error: Error) => console.error('Backup confirmation failed:', error));
  }, [service, logEvent, onSuccess, showInfo, t]);

  const running = ['generating', 'generated'].includes(status.phase) ||
    (showCompleted && ['saved', 'confirmed'].includes(status.phase));
  // All phases use one monotone percentage; 100% is reserved for a completed
  // native save or user-confirmed browser download.
  const hasKnownTotal = status.total > 0;
  const percent = hasKnownTotal
    ? Math.max(0, Math.min(100, Math.floor(status.completed * 100 / status.total)))
    : undefined;
  const hasFeedback = status.phase === 'error' || (!running && status.warnings.length > 0);

  return (
    <StyledDiv className={`shrink${hasFeedback || status.phase === 'download-initiated' ? ' backup-has-message' : ''}`}>
      <div className='backup-control'>
        {running ? (
          <div
            aria-label={`${t('Backup')}: ${status.message}`}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={percent}
            aria-valuetext={hasKnownTotal ? undefined : t('Loading')}
            role='progressbar'
          >
            <RoundProgress value={hasKnownTotal ? status.completed : 0} total={hasKnownTotal ? status.total : 1} />
          </div>
        ) : status.phase === 'download-initiated' ? (
          <button type='button' onClick={confirm}>{t('I saved the downloaded backup')}</button>
        ) : (
          <ButtonWithLabelBelow
            className={className}
            icon='download'
            label={caption ?? t('Download')}
            onClick={start}
            isDisabled={!currentPair}
          />
        )}
      </div>
      {/* Keep errors visible after failure and PDF warnings after completion.
          During a backup, display only the original circular progress control. */}
      {status.phase === 'error' && status.error && <p role='alert'>{status.error}</p>}
      {!running && status.warnings.length > 0 && <p role='status'>{status.warnings.join('; ')}</p>}
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
