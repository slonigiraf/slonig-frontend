// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookProcessingStageKey } from '@slonigiraf/db';
import { wouldResetBookGeneratedData } from '@slonigiraf/db';
import React, { useEffect, useState } from 'react';

import { Button, Modal } from '@polkadot/react-components';

import { useTranslation } from '../../../common/translate.js';

interface StageRunPricePopupProps {
  children: React.ReactNode;
  /** The database reset performed by Run, if any. No acknowledgement is
   * required unless that reset would affect existing generated data. */
  dataLoss?: { bookId: number; stage: BookProcessingStageKey; onlyMissing?: boolean; hasAdditionalDataToReplace?: boolean };
  header: string;
  isRunDisabled?: boolean;
  onClose: () => void;
  onRun: () => void;
  onSkip?: () => void;
  runLabel?: string;
}

export default function StageRunPricePopup ({ children, dataLoss, header, isRunDisabled = false, onClose, onRun, onSkip, runLabel = 'Run' }: StageRunPricePopupProps): React.ReactElement {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const [check, setCheck] = useState<{ key: string; destructive: boolean; error?: string }>();
  const checkKey = dataLoss ? `${dataLoss.bookId}:${dataLoss.stage}:${Boolean(dataLoss.onlyMissing)}:${Boolean(dataLoss.hasAdditionalDataToReplace)}` : undefined;
  const checking = Boolean(checkKey && check?.key !== checkKey);
  const destructive = Boolean(checkKey && check?.key === checkKey && check.destructive);
  const checkError = checkKey && check?.key === checkKey ? check.error : undefined;

  useEffect(() => {
    setAcknowledged(false);
    if (!dataLoss || !checkKey) return;
    let active = true;

    void wouldResetBookGeneratedData(dataLoss.bookId, dataLoss.stage, { onlyMissing: dataLoss.onlyMissing })
      .then((destructive) => { if (active) setCheck({ key: checkKey, destructive: destructive || Boolean(dataLoss.hasAdditionalDataToReplace) }); })
      .catch((error: unknown) => { if (active) setCheck({ key: checkKey, destructive: true, error: error instanceof Error ? error.message : 'Unable to inspect existing book data.' }); });
    return () => { active = false; };
  }, [checkKey]);

  const run = (): void => {
    if (isRunDisabled || checking || checkError || (destructive && !acknowledged)) return;
    onRun();
  };

  return <Modal
    header={header}
    onClose={onClose}
    size='small'
  >
    <Modal.Content>
      {children}
      {destructive && <label style={{ display: 'block', margin: '1rem 0' }}>
        <input
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.target.checked)}
          type='checkbox'
        />{' '}I understand that running this stage will remove existing generated data for this stage and subsequent stages.
      </label>}
      {checkError && <p role='alert'>Cannot check existing data: {checkError}</p>}
      <Button.Group>
        {onSkip && <Button
          icon='step-forward'
          label={t('Skip')}
          onClick={onSkip}
        />}
        <Button
          icon='play'
          isDisabled={isRunDisabled || checking || Boolean(checkError) || (destructive && !acknowledged)}
          label={runLabel}
          onClick={run}
        />
      </Button.Group>
    </Modal.Content>
  </Modal>;
}
