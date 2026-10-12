// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React from 'react';
import type { AiAction, PipelineAction } from '../SkillsTypes.js';

import { Dropdown, Toggle } from '@polkadot/react-components';

import OpenRouterModelSelector from '../../../../openrouter/components/ModelSelector.js';
import { AiPriceEstimate } from '../../../shared/ui/PriceEstimate.js';
import ProcessingPopup from '../../../shared/ui/ProcessingPopup.js';
import StageRunPricePopup from '../../../shared/ui/StageRunPricePopup.js';

interface SkillsControlsProps {
  abilitiesMissingImagesCount: number;
  failedTikzCount: number;
  fixOnlyFailedTikz: boolean;
  abortProcessing: () => void;
  aiAction?: AiAction;
  autoRunAll: boolean;
  autoRunCompletedCount: number;
  autoRunStageCount: number;
  closeConfirmation: () => void;
  confirm: () => void;
  skipStage: () => void;
  error: string;
  estimate: React.ComponentProps<typeof AiPriceEstimate>['estimate'];
  conceptsMissingAbilitiesCount: number;
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
  setFixOnlyFailedTikz: (value: boolean) => void;
  setSelectedModel: (value: string) => void;
  setSelectedPipelineKey: (value: string) => void;
  showPipeline: boolean;
  visiblePipelineActions: PipelineAction[];
  bypassedStageKeys: readonly string[];
  failedStageKeys: readonly string[];
}

export default function SkillsControls ({ abilitiesMissingImagesCount, failedTikzCount, fixOnlyFailedTikz, abortProcessing, aiAction, autoRunAll, autoRunCompletedCount, autoRunStageCount, closeConfirmation, confirm, skipStage, error, estimate, conceptsMissingAbilitiesCount, generateOnlyMissingAbilities, generateOnlyMissingImages, isBusy, notice, openRouterSpent, pipelineControls, progress, progressLabel, progressTotal, runSelectedPipelineAction, selectedModel, selectedPipelineAction, selectedPipelineKey, setGenerateOnlyMissingAbilities, setGenerateOnlyMissingImages, setFixOnlyFailedTikz, setSelectedModel, setSelectedPipelineKey, showPipeline, visiblePipelineActions, bypassedStageKeys, failedStageKeys }: SkillsControlsProps): React.ReactElement {
  return <>
  {aiAction && !autoRunAll && (
    <StageRunPricePopup
      header='Confirm AI processing'
      onClose={closeConfirmation}
      onRun={confirm}
      onSkip={aiAction === 'skills' ? undefined : skipStage}
    >
      <AiPriceEstimate estimate={estimate} />
      {aiAction === 'abilities' && <Toggle
        isDisabled={!conceptsMissingAbilitiesCount}
        label='Only for Concepts missing an Ability'
        onChange={setGenerateOnlyMissingAbilities}
        value={generateOnlyMissingAbilities}
      />}
      {(aiAction === 'images' || aiAction === 'answerImages') && <Toggle
        isDisabled={!abilitiesMissingImagesCount}
        label={`Only for Abilities missing ${aiAction === 'images' ? 'question' : 'answer'} images`}
        onChange={setGenerateOnlyMissingImages}
        value={generateOnlyMissingImages}
      />}
      {(aiAction === 'fixImages' || aiAction === 'fixAnswerImages') && <Toggle
        isDisabled={!failedTikzCount}
        label={`Only retry Abilities with failed images (${failedTikzCount})`}
        onChange={setFixOnlyFailedTikz}
        value={fixOnlyFailedTikz}
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
            text: `${isDone ? '✓ ' : bypassedStageKeys.includes(key) ? '↷ ' : failedStageKeys.includes(key) ? '⚠ ' : ''}${label}`,
            value: key
          }))}
          value={selectedPipelineKey}
        />
      </div>
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
