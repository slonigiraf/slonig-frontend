// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookChapter, BookConcept, BookPage, Exercise, Skill } from '@slonigiraf/db';
import type { GeneratedAbility } from '../../abilities/abilities.js';
import type { TikzPreRenderResult } from '../../Edit/TikzDisplay.js';
import type { ProcessingStatus } from '../components/ProcessingPopup.js';
import type { StoredAbility } from './SkillsProcessing.js';

export type SkillsView = 'conceptsSkills' | 'preExercisesExercises';

export interface PipelineAction {
  key: string;
  label: string;
  isDone: boolean;
  isDisabled: boolean;
  isResultComplete?: boolean;
  onClick: () => void;
  onRetryMissing?: () => void;
}

export interface AutoRunProgress {
  completed: number;
  percent: number;
  total: number;
}

export interface SkillsProps {
  autoRunAll?: boolean;
  autoRunStartKey?: string;
  book: Book;
  externalAutoRunBusy?: boolean;
  onBookChange: (book: Book) => void;
  onAction?: (view: SkillsView | 'conceptExercises') => void;
  onContentChange?: () => void;
  onEntityCountsChange?: (counts: { abilities: number; bookExercises: number; exercises: number }) => void;
  externalRefreshToken?: number;
  pipelineOnly?: boolean;
  pipelineControls?: React.ReactNode;
  pipelinePrefix?: PipelineAction[];
  pipelineSuffix?: PipelineAction[];
  onAutoRunComplete?: () => void;
  onAutoRunProgressChange?: (progress?: AutoRunProgress) => void;
  onAutoRunProcessingChange?: (status?: ProcessingStatus) => void;
  onAutoRunAbortReady?: (abort?: () => void) => void;
  onAbortAutoRun?: () => void;
  onPipelineSelectionChange?: (key: string) => void;
  showPipeline?: boolean;
  view: SkillsView;
}

export interface FixedAbilityReview {
  ability: GeneratedAbility;
  errors: string[];
  exerciseTitle?: string;
  record: StoredAbility;
  recordId: string;
}

export interface DuplicateAbilityReview {
  chapterTitle: string;
  deleted: StoredAbility;
  deletedConceptId?: number;
  deletedConceptTitle?: string;
  deletedExerciseId?: number;
  deletedExerciseTitle?: string;
  kept: StoredAbility;
  keptExerciseTitle?: string;
}

export interface FixReviewResult {
  checked: number;
  duplicatePairs: DuplicateAbilityReview[];
  items: FixedAbilityReview[];
}

export interface FixedExerciseReview {
  errors: string[];
  exercise: Exercise;
  exerciseId: number;
  original: Exercise;
}

export interface DuplicateExerciseReview {
  chapterTitle: string;
  deleted: Exercise;
  kept: Exercise;
}

export interface ExerciseFixReviewResult {
  checked: number;
  duplicatePairs: DuplicateExerciseReview[];
  items: FixedExerciseReview[];
}

export interface FixedImageReview {
  errors: string[];
  exerciseIndex: number;
  imageId: number;
  field: 'p' | 'i';
  fixedPreRender: TikzPreRenderResult;
  fixedTikz: string;
  originalPreRender: TikzPreRenderResult;
  originalTikz: string;
  prompt: string;
  record: StoredAbility;
}

export interface ImageFixReviewResult {
  checked: number;
  renderFailures: number;
  items: FixedImageReview[];
}

export interface BookPageContent {
  exercises: Exercise[];
  page: BookPage;
}

export interface ChapterContent {
  chapter: BookChapter;
  concepts: BookConcept[];
  exercises: Exercise[];
  abilities: StoredAbility[];
  skills: Skill[];
}

export interface SkillSource {
  chapterId: number;
  chapterTitle: string;
  description: string;
  sourceId: number;
  sourceType: 'concept' | 'exercise';
  title: string;
}

export type AiAction = 'exercises' | 'fix' | 'fixExercises' | 'fixImages' | 'images' | 'skills';
