// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useState } from 'react';

import { UploadBookToolbar } from './components/UploadBookToolbar.js';
import { UploadLayout } from './styles/UploadLayout.js';
import { UploadReader } from './components/UploadReader.js';
import { UploadStageDialogs } from './components/UploadStageDialogs.js';
import { useUploadProcessing } from './hooks/useUploadProcessing.js';
import { useUploadedBookLibrary } from './hooks/useUploadedBookLibrary.js';

function Upload (): React.ReactElement {
  const [error, setError] = useState('');
  const library = useUploadedBookLibrary(setError);
  const processing = useUploadProcessing({
    isBusy: library.isBusy,
    readerFile: library.readerFile,
    refreshBooks: library.refreshBooks,
    selectedBook: library.selectedBook,
    setBooks: library.setBooks,
    setError
  });

  return <UploadLayout>
    <UploadStageDialogs
      processing={processing}
      selectedBook={library.selectedBook}
    />
    <UploadBookToolbar
      books={library.books}
      deleteSelectedBook={library.deleteSelectedBook}
      isBusy={library.isBusy}
      isFastForwardRunning={processing.pricing.isFastForwardRunning}
      selectedBook={library.selectedBook}
      selectedId={library.selectedId}
      setError={setError}
      setSelectedId={library.setSelectedId}
      uploadBook={library.uploadBook}
    />
    {error && <p className='errorMessage' role='alert'>{error}</p>}
    <UploadReader
      book={library.selectedBook}
      file={library.readerFile}
      isBusy={library.isBusy}
      processing={processing}
    />
  </UploadLayout>;
}

export default React.memo(Upload);
