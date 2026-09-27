// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';

import { Button, Modal } from '@polkadot/react-components';

interface StageRunPricePopupProps {
  children: React.ReactNode;
  header: string;
  onClose: () => void;
  onRun: () => void;
  runLabel?: string;
}

export default function StageRunPricePopup ({ children, header, onClose, onRun, runLabel = 'Run' }: StageRunPricePopupProps): React.ReactElement {
  return <Modal
    header={header}
    onClose={onClose}
    size='small'
  >
    <Modal.Content>
      {children}
      <Button.Group>
        <Button
          icon='play'
          label={runLabel}
          onClick={onRun}
        />
      </Button.Group>
    </Modal.Content>
  </Modal>;
}
