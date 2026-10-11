// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import { isBookProcessingStageComplete, isBookProcessingStageSatisfied } from '@slonigiraf/db';

import { isRefineChaptersComplete } from '../../../book/domain/chapters/refineChapters.js';
import { bookPipelineStageLabel } from '../../../book/application/pipeline/bookPipeline.js';
import type { PipelineAction } from '../../../shared/types/processing.js';

interface ProcessingToolbarHandlers {
  onAssignStandards: () => void;
  onEmbeddings: () => void;
  onFixConcepts: () => void;
  onGenerateConcepts: () => void;
  onIdentifyChapters: () => void;
  onRecognize: () => void;
  onRefineChapters: () => void;
  onSkipRefineChapters: () => Promise<void>;
  onShowAge: () => void;
  onShowLanguage: () => void;
  onShowSubject: () => void;
  onSortConcepts: () => void;
  onDeduplicateConcepts: () => void;
}

interface ProcessingToolbars {
  prefix: PipelineAction[];
  suffix: PipelineAction[];
}

type Translate = (key: string) => string;

export function createProcessingToolbars (
  book: Book,
  isBusy: boolean,
  hasReaderFile: boolean,
  handlers: ProcessingToolbarHandlers,
  t: Translate
): ProcessingToolbars {
  const blocked = !hasReaderFile || isBusy;
  const stage = (key: Parameters<typeof bookPipelineStageLabel>[0]): boolean => isBookProcessingStageSatisfied(book, key);
  const done = (key: Parameters<typeof bookPipelineStageLabel>[0]): boolean => isBookProcessingStageComplete(book, key);
  const label = (key: Parameters<typeof bookPipelineStageLabel>[0]): string => t(bookPipelineStageLabel(key));

  return {
    prefix: [
      {
        key: 'recognize',
        label: label('recognize'),
        isDone: done('recognize'),
        isDisabled: blocked,
        onClick: handlers.onRecognize
      },
      {
        key: 'language',
        label: label('language'),
        isDone: done('language'),
        isDisabled: blocked || !stage('recognize'),
        onClick: handlers.onShowLanguage
      },
      {
        key: 'subject',
        label: label('subject'),
        isDone: done('subject'),
        isDisabled: blocked || !stage('language') || !book.language,
        onClick: handlers.onShowSubject
      },
      {
        key: 'age',
        label: label('age'),
        isDone: done('age'),
        isDisabled: blocked || !stage('subject') || !book.subject,
        onClick: handlers.onShowAge
      },
      {
        key: 'chapters',
        label: label('chapters'),
        isDone: done('chapters'),
        isDisabled: blocked || !stage('age'),
        onClick: handlers.onIdentifyChapters
      },
      {
        key: 'concepts',
        label: label('concepts'),
        isDone: done('concepts'),
        isDisabled: blocked || !stage('chapters') || !book.language || !book.subject,
        onClick: handlers.onGenerateConcepts
      },
      {
        key: 'fixConcepts',
        label: label('fixConcepts'),
        isDone: done('fixConcepts'),
        isDisabled: blocked || !stage('concepts') || !book.language || !book.subject || book.age === undefined,
        onClick: handlers.onFixConcepts
      },
      {
        key: 'embeddings',
        label: label('embeddings'),
        isDone: done('embeddings'),
        isDisabled: blocked || !stage('fixConcepts'),
        onClick: handlers.onEmbeddings
      },
      {
        key: 'deduplicateConcepts',
        label: label('deduplicateConcepts'),
        isDone: done('deduplicateConcepts'),
        isDisabled: blocked || !stage('embeddings') || !book.language || !book.subject || book.age === undefined,
        onClick: handlers.onDeduplicateConcepts
      },
      {
        key: 'sortConcepts',
        label: label('sortConcepts'),
        isDone: done('sortConcepts'),
        isDisabled: blocked || !stage('deduplicateConcepts') || !book.language || !book.subject || book.age === undefined,
        onClick: handlers.onSortConcepts
      },
      {
        key: 'refineChapters',
        label: label('refineChapters'),
        isDone: isRefineChaptersComplete(book),
        isDisabled: blocked || !stage('sortConcepts') || !book.language || !book.subject || book.age === undefined,
        onClick: handlers.onRefineChapters,
        onSkip: handlers.onSkipRefineChapters
      }
    ],
    suffix: [
      {
        key: 'standards',
        label: label('standards'),
        isDone: done('standards'),
        isDisabled: blocked || !stage('fixAnswerImages') || !stage('embeddings') || !book.language || !book.subject,
        onClick: handlers.onAssignStandards
      }
    ]
  };
}
