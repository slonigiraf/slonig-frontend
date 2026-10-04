// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import React from 'react';

import type { UploadProcessing } from '../hooks/useUploadProcessing.js';

import { useTranslation } from '../../../../common/translate.js';

const BookReader = React.lazy(() => import('../../book-workspace/index.js'));

interface UploadReaderProps {
  book?: Book;
  file?: File;
  isBusy: boolean;
  processing: UploadProcessing;
}

export function UploadReader ({ book, file, isBusy, processing }: UploadReaderProps): React.ReactElement | null {
  const { t } = useTranslation();

  if (!book || !file) {
    return null;
  }

  return <React.Suspense fallback={<p>{t('Loading PDF reader…')}</p>}>
    <BookReader
      autoRunAll={processing.pricing.isFastForwardRunning}
      autoRunStartKey={processing.pricing.fastForwardStartKey}
      book={book}
      embeddingModel={processing.embeddingModel}
      fixOnlyFailedConcepts={processing.conceptGeneration.fixOnlyFailedConcepts}
      key={book.id}
      file={file}
      generateAllConceptsModel={processing.generateAllConceptsModel}
      standardsModel={processing.standardsModel}
      generateOnlyMissingConcepts={processing.conceptGeneration.generateOnlyMissingConcepts}
      isPriceDisabled={isBusy || processing.pricing.isFastForwardRunning}
      onAbortFastForward={processing.pricing.abortFastForward}
      onAutoRunComplete={processing.pricing.onFastForwardComplete}
      onBookChange={processing.onBookChange}
      onFastForward={processing.pricing.onFastForward}
      onPrice={processing.pricing.onPrice}
      onProcessingComplete={processing.onProcessingComplete}
      pendingProcessingAction={processing.pendingProcessingAction}
      processingCommand={processing.processingCommand}
      processingToolbar={processing.processingToolbars.prefix}
      processingToolbarAfterFixImages={processing.processingToolbars.suffix}
      generateOnlyMissingExercises={processing.standardsExercises.generateOnlyMissingExercises}
    />
  </React.Suspense>;
}
