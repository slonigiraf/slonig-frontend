// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, Skill, TikzReviewResult } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../../abilities/abilities.js';
import type { TikzPreRenderResult } from '../../../Edit/TikzDisplay.js';
import type { AutoRunProgress, PipelineAction, ProcessingStatus } from '../../shared/types/processing.js';
import type { StoredAbility } from '../../book/application/abilities/abilityProcessing.js';

export type { AutoRunProgress, PipelineAction, ProcessingStatus } from '../../shared/types/processing.js';

export type SkillsView = 'conceptsSkills' | 'preExercisesExercises';

export interface SkillsProps {
  autoRunAll?: boolean;
  autoRunStartKey?: string;
  autoRunSkipRefineChapters?: boolean;
  book: Book;
  externalAutoRunBusy?: boolean;
  onBookChange: (book: Book) => void;
  onAction?: (view: SkillsView) => void;
  onContentChange?: () => void;
  onEntityCountsChange?: (counts: { abilities: number }) => void;
  externalRefreshToken?: number;
  pipelineOnly?: boolean;
  pipelineControls?: React.ReactNode;
  pipelinePrefix?: PipelineAction[];
  pipelineSuffix?: PipelineAction[];
  onAutoRunComplete?: () => void;
  onAutoRunProgressChange?: (progress?: AutoRunProgress) => void;
  onAutoRunProcessingChange?: (status?: ProcessingStatus) => void;
  onAbortAutoRun?: () => void;
  onPipelineSelectionChange?: (key: string) => void;
  showPipeline?: boolean;
  view: SkillsView;
}

export interface FixedAbilityReview {
  ability: GeneratedAbility;
  errors: string[];
  conceptTitle?: string;
  record: StoredAbility;
  recordId: string;
}

export interface DuplicateAbilityReview {
  chapterTitle: string;
  deleted: StoredAbility;
  deletedConceptId?: number;
  deletedConceptTitle?: string;
  kept: StoredAbility;
  keptConceptTitle?: string;
}

export interface FixReviewResult {
  checked: number;
  duplicatePairs: DuplicateAbilityReview[];
  items: FixedAbilityReview[];
  // AI diagnosed these problems but supplied no persistable correction.
  unresolved: Array<{ errors: string[]; record: StoredAbility }>;
}

export interface FixedImageReview {
  errors: string[];
  exerciseIndex: number;
  imageId: number;
  field: 'p' | 'i';
  fixedPreRender: TikzPreRenderResult;
  fixedTikz: string;
  finalReviewResult: TikzReviewResult;
  originalPreRender: TikzPreRenderResult;
  originalTikz: string;
  prompt: string;
  record: StoredAbility;
}

export interface UnresolvedImageReview {
  imageId: number;
  errors: string[];
  exerciseIndex: number;
  field: 'p' | 'i';
  originalTikz: string;
  originalCompiled: boolean;
  abilityTitle: string;
  exerciseTitle: string;
}

export interface ImageFixReviewResult {
  checked: number;
  renderFailures: number;
  items: FixedImageReview[];
  unresolved: UnresolvedImageReview[];
}

export interface ChapterContent {
  chapter: BookChapter;
  concepts: BookConcept[];
  abilities: StoredAbility[];
  skills: Skill[];
}

export interface SkillSource {
  chapterId: number;
  chapterTitle: string;
  description: string;
  sourceId: number;
  sourceType: 'concept';
  title: string;
}

export type AiAction = 'abilities' | 'fix' | 'fixImages' | 'images' | 'skills';
