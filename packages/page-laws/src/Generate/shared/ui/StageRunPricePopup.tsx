// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';

import { Button, Modal } from '@polkadot/react-components';

interface StageRunPricePopupProps {
  children: React.ReactNode;
  header: string;
  isRunDisabled?: boolean;
  onClose: () => void;
  onRun: () => void;
  onSkip?: () => void;
  runLabel?: string;
}

export default function StageRunPricePopup ({ children, header, isRunDisabled = false, onClose, onRun, onSkip, runLabel = 'Run' }: StageRunPricePopupProps): React.ReactElement {
  return <Modal
    header={header}
    onClose={onClose}
    size='small'
  >
    <Modal.Content>
      {children}
      <Button.Group>
        {onSkip && <Button
          icon='step-forward'
          label='Skip (mark done)'
          onClick={onSkip}
        />}
        <Button
          icon='play'
          isDisabled={isRunDisabled}
          label={runLabel}
          onClick={onRun}
        />
      </Button.Group>
    </Modal.Content>
  </Modal>;
}
