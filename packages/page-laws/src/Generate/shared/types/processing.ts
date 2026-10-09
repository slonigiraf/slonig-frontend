// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

export interface PipelineAction {
  key: string;
  label: string;
  isDone: boolean;
  isDisabled: boolean;
  isResultComplete?: boolean;
  onClick: () => void;
  onSkip?: () => Promise<void>;
  onRetryMissing?: () => void;
}

export interface AutoRunProgress {
  completed: number;
  percent: number;
  total: number;
}

export interface ProcessingStatus {
  label: string;
  progressTotal: number;
  progressValue: number;
  spent: number;
}
