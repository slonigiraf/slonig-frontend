// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
import React from 'react';
import { Button, Modal, styled } from '@polkadot/react-components';
import { VerticallyCenteredModal } from './index.js';
import { useTranslation } from './translate.js';

interface Props {
  warnings: string[];
  onClose: () => void;
}

// Browser/OS error messages are not under our control. Translate the known
// PDF errors, and show any other technical reason beneath a localized label.
function BackupWarningsPopup({ warnings, onClose }: Props): React.ReactElement<Props> {
  const { t } = useTranslation();
  const localizedReason = (reason: string): string => {
    switch (reason) {
      case 'Invalid PDF filename': return t('Invalid PDF filename');
      case 'Invalid or truncated PDF': return t('Invalid or truncated PDF');
      case 'OPFS is unavailable': return t('OPFS is unavailable');
      default: return reason;
    }
  };

  const entries = warnings.map((warning) => {
    if (warning.startsWith('PDF storage unavailable: ')) {
      return {
        title: t('PDF storage is unavailable. PDF files may be missing from this backup.'),
        detail: localizedReason(warning.slice('PDF storage unavailable: '.length))
      };
    }
    const skippedPdf = /^PDF '(.+)' skipped: (.+)$/.exec(warning);
    if (skippedPdf) {
      return {
        title: t('PDF "{{name}}" was skipped.', { replace: { name: skippedPdf[1] } }),
        detail: localizedReason(skippedPdf[2])
      };
    }
    return { title: t('Other backup warning'), detail: warning };
  });

  return (
    <VerticallyCenteredModal header={t('Backup warnings')} onClose={onClose} size='small'>
      <Modal.Content>
        <WarningDetails>
          <h2>{t('Backup completed with warnings')}</h2>
          <p>{t('Some files may be missing from this backup.')}</p>
          <ul>
            {entries.map(({ title, detail }, index) => (
              <li key={index}>
                <strong>{title}</strong>
                {detail && <p>{t('Reason: {{reason}}', { replace: { reason: detail } })}</p>}
              </li>
            ))}
          </ul>
          <Button className='highlighted--button' label={t('OK')} onClick={onClose} />
        </WarningDetails>
      </Modal.Content>
    </VerticallyCenteredModal>
  );
}

const WarningDetails = styled.div`
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  max-height: min(70vh, 550px);
  overflow-y: auto;
  overflow-wrap: anywhere;
  h2, p { margin: 0; }
  ul { margin: 0; padding-left: 1.5rem; width: 100%; }
  li + li { margin-top: 12px; }
  li p { margin-top: 4px; }
  > .ui--Button { align-self: center; }
`;

export default React.memo(BackupWarningsPopup);
