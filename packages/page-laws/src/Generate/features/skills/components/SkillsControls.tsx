// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import type { AiAction, PipelineAction } from '../SkillsTypes.js';

import { Button, Dropdown, Toggle } from '@polkadot/react-components';

import OpenRouterModelSelector from '../../../../openrouter/components/ModelSelector.js';
import { AiPriceEstimate } from '../../../shared/ui/PriceEstimate.js';
import ProcessingPopup from '../../../shared/ui/ProcessingPopup.js';
import StageRunPricePopup from '../../../shared/ui/StageRunPricePopup.js';

interface SkillsControlsProps {
  abilitiesMissingImagesCount: number;
  abortProcessing: () => void;
  aiAction?: AiAction;
  autoRunAll: boolean;
  autoRunCompletedCount: number;
  autoRunStageCount: number;
  closeConfirmation: () => void;
  confirm: () => void;
  error: string;
  estimate: React.ComponentProps<typeof AiPriceEstimate>['estimate'];
  exercisesMissingAbilitiesCount: number;
  generateOnlyMissingAbilities: boolean;
  generateOnlyMissingImages: boolean;
  isBusy: boolean;
  notice: string;
  openRouterSpent: number;
  pipelineControls?: React.ReactNode;
  progress: number;
  progressLabel: string;
  progressTotal: number;
  runSelectedPipelineAction: () => void;
  selectedModel: string;
  selectedPipelineAction?: PipelineAction;
  selectedPipelineKey: string;
  setGenerateOnlyMissingAbilities: (value: boolean) => void;
  setGenerateOnlyMissingImages: (value: boolean) => void;
  setSelectedModel: (value: string) => void;
  setSelectedPipelineKey: (value: string) => void;
  showPipeline: boolean;
  visiblePipelineActions: PipelineAction[];
}

export default function SkillsControls ({ abilitiesMissingImagesCount, abortProcessing, aiAction, autoRunAll, autoRunCompletedCount, autoRunStageCount, closeConfirmation, confirm, error, estimate, exercisesMissingAbilitiesCount, generateOnlyMissingAbilities, generateOnlyMissingImages, isBusy, notice, openRouterSpent, pipelineControls, progress, progressLabel, progressTotal, runSelectedPipelineAction, selectedModel, selectedPipelineAction, selectedPipelineKey, setGenerateOnlyMissingAbilities, setGenerateOnlyMissingImages, setSelectedModel, setSelectedPipelineKey, showPipeline, visiblePipelineActions }: SkillsControlsProps): React.ReactElement {
  return <>
  {aiAction && !autoRunAll && (
    <StageRunPricePopup
      header='Confirm AI processing'
      onClose={closeConfirmation}
      onRun={confirm}
    >
      <AiPriceEstimate estimate={estimate} />
      {aiAction === 'exercises' && <Toggle
        isDisabled={!exercisesMissingAbilitiesCount}
        label='Only for Concepts missing an Ability'
        onChange={setGenerateOnlyMissingAbilities}
        value={generateOnlyMissingAbilities}
      />}
      {aiAction === 'images' && <Toggle
        isDisabled={!abilitiesMissingImagesCount}
        label='Only for Abilities missing Images'
        onChange={setGenerateOnlyMissingImages}
        value={generateOnlyMissingImages}
      />}
      <OpenRouterModelSelector
        className='modelSelect'
        isDisabled={isBusy}
        onChange={setSelectedModel}
        value={selectedModel}
      />
    </StageRunPricePopup>
  )}
  {isBusy && !autoRunAll && (
    <ProcessingPopup
      label={progressLabel}
      onAbort={abortProcessing}
      overallProgress={autoRunAll ? { completed: autoRunCompletedCount, total: autoRunStageCount } : undefined}
      progressTotal={progressTotal}
      progressValue={progress}
      spent={openRouterSpent}
    />
  )}
  {showPipeline && <div className='pipeline'>
    <div className='pipelineStageColumn'>
    <div className='pipelineRunGroup'>
      <button
        aria-label='Run selected stage'
        className='pipelineRunButton'
        disabled={autoRunAll || !selectedPipelineAction || selectedPipelineAction.isDisabled}
        onClick={runSelectedPipelineAction}
        type='button'
      >
        <span aria-hidden='true'>▶</span>
      </button>
      <Dropdown
        className='pipelineStageDropdown'
        isDisabled={autoRunAll || isBusy || !visiblePipelineActions.length}
        isFull
        withLabel={false}
        onChange={setSelectedPipelineKey}
        options={visiblePipelineActions.map(({ isDone, key, label }) => ({
          key,
          text: `${isDone ? '✓ ' : ''}${label}`,
          value: key
        }))}
        value={selectedPipelineKey}
      />
    </div>
    {selectedPipelineAction?.onSkip && !selectedPipelineAction.isDone && !autoRunAll && <Button
      className='pipelineSkipButton'
      icon='step-forward'
      isDisabled={isBusy || selectedPipelineAction.isDisabled}
      label='Skip Refine chapters (mark done)'
      onClick={() => { void selectedPipelineAction.onSkip?.().catch(() => undefined); }}
    />}
    </div>
    {pipelineControls && <div className='pipelineControls'>{pipelineControls}</div>}
  </div>}
  {error && <p
    className='errorMessage'
    role='alert'
            >{error}</p>}
  {notice && <p
    className='noticeMessage'
    role='status'
             >{notice}</p>}
  </>;
}
