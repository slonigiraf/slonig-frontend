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
  dataLoss?: { bookId: number; stage: BookProcessingStageKey; onlyMissing?: boolean; hasAdditionalDataToReplace?: boolean; warningText?: string };
  header: string;
  isRunDisabled?: boolean;
  onClose: () => void;
  onRun: () => void;
  onSkip?: () => void;
  runLabel?: string;
}

/** Describe only the artifacts that this stage can actually invalidate. */
function dataChangeWarning(stage: BookProcessingStageKey): string {
  switch (stage) {
    case 'fixConcepts':
      return 'I understand that applying Concept changes may invalidate embeddings and Abilities/images for modified Concepts. Unchanged records will be preserved.';
    case 'refineChapters':
      return 'I understand that changing the chapter structure can remove existing chapter Standards. Concepts, Abilities and images will be preserved.';
    case 'abilities':
      return 'I understand that replacing Abilities will also replace their question and answer images and image reviews. Existing Standards will be preserved.';
    case 'fixAbilities':
      return 'I understand that approved Ability changes will invalidate images belonging to those Abilities. Unchanged Abilities and Standards will be preserved.';
    case 'images':
      return 'I understand that regenerating question images will invalidate their QA and corresponding answer images and answer QA.';
    case 'fixImages':
      return 'I understand that changing a question figure can invalidate its corresponding answer image and QA. A QA-only rerun will not delete images.';
    case 'answerImages':
      return 'I understand that regenerating answer images will invalidate only those answer images and their QA. Question images will be preserved.';
    default:
      return 'I understand that rerunning this stage can remove previously generated data in this stage and subsequent stages.';
  }
}

export default function StageRunPricePopup ({ children, dataLoss, header, isRunDisabled = false, onClose, onRun, onSkip, runLabel = 'Run' }: StageRunPricePopupProps): React.ReactElement {
  const { t } = useTranslation();
  const [acknowledged, setAcknowledged] = useState(false);
  const [check, setCheck] = useState<{ key: string; destructive: boolean; error?: string }>();
  const checkKey = dataLoss ? `${dataLoss.bookId}:${dataLoss.stage}:${Boolean(dataLoss.onlyMissing)}:${Boolean(dataLoss.hasAdditionalDataToReplace)}:${dataLoss.warningText ?? ''}` : undefined;
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
        />{' '}{dataLoss?.warningText ?? (dataLoss ? dataChangeWarning(dataLoss.stage) : '')}
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
