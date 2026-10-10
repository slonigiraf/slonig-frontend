// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookConcept } from '@slonigiraf/db';

import type { MissingChapterConcept } from '../../book/domain/concepts/fixConcepts.js';
import type { ConceptChapterNavigationItem } from '../../book/domain/concepts/conceptRecognition.js';
import type { PendingBookProcessingAction } from '../../book/application/pipeline/bookPipeline.js';
import type { FixConceptsChapterStatuses } from '../../book/infrastructure/storage/fixConceptsProgress.js';
import type { PipelineAction } from '../../shared/types/processing.js';

export interface Props {
  autoRunAll?: boolean;
  autoRunStartKey?: string;
  autoRunSkipRefineChapters?: boolean;
  book: Book;
  file: File;
  embeddingModel: string;
  fixOnlyFailedConcepts: boolean;
  generateAllConceptsModel: string;
  generateOnlyMissingConcepts: boolean;
  generateOnlyMissingStandards: boolean;
  isPriceDisabled?: boolean;
  onAbortFastForward: () => void;
  onAutoRunComplete?: () => void;
  onBookChange: (book: Book) => void;
  onFastForward: (startKey: string) => void;
  onPrice: () => void;
  onProcessingComplete: () => void;
  pendingProcessingAction?: PendingBookProcessingAction;
  processingToolbar: PipelineAction[];
  processingToolbarAfterFixImages?: PipelineAction[];
  standardsModel: string;
}

export interface FixConceptsReviewChapter {
  before: BookConcept[];
  chapter: ConceptChapterNavigationItem;
  missing: MissingChapterConcept[];
  removed: BookConcept[];
}

export interface FixConceptsReview {
  baseStatuses: FixConceptsChapterStatuses;
  chapters: FixConceptsReviewChapter[];
  failedChapters: Array<{ chapter: ConceptChapterNavigationItem; reason: string }>;
  targetChapterCount: number;
}

export interface DeduplicateConceptsReviewPair {
  deleted: BookConcept;
  deletedChapterId: number;
  deletedChapterTitle: string;
  kept: BookConcept;
  keptChapterId: number;
  keptChapterTitle: string;
  selected: boolean;
}

export interface DeduplicateConceptsReview {
  checkedConceptCount: number;
  pairs: DeduplicateConceptsReviewPair[];
}
