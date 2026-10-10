// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import React, { useCallback, useMemo, useRef } from 'react';

import { Button, Dropdown } from '@polkadot/react-components';

import { useTranslation } from '../../../../common/translate.js';

interface UploadBookToolbarProps {
  books: Book[];
  deleteSelectedBook: () => Promise<void>;
  isBusy: boolean;
  isFastForwardRunning: boolean;
  isFastForwardPaused: boolean;
  resumeFastForward: () => void;
  selectedBook?: Book;
  selectedId?: number;
  setError: Dispatch<SetStateAction<string>>;
  setSelectedId: Dispatch<SetStateAction<number | undefined>>;
  uploadBook: (contents: Uint8Array, name: string) => Promise<void>;
}

export function UploadBookToolbar ({ books, deleteSelectedBook, isBusy, isFastForwardRunning, isFastForwardPaused, resumeFastForward, selectedBook, selectedId, setError, setSelectedId, uploadBook }: UploadBookToolbarProps): React.ReactElement {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const options = useMemo(
    () => books.map(({ id, name }) => ({ key: id, text: name, value: id })),
    [books]
  );

  const onChooseFile = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';

    if (file) {
      file.arrayBuffer()
        .then((buffer) => uploadBook(new Uint8Array(buffer), file.name))
        .catch(() => setError(t('Unable to read this PDF.')));
    }
  }, [setError, t, uploadBook]);

  return <div className='bookToolbar'>
    <div className='bookToolbarPrimary'>
      <Button
        className='uploadButton'
        icon='upload'
        isDisabled={isBusy || isFastForwardRunning}
        label={t('Upload')}
        onClick={onChooseFile}
      />
      {isFastForwardPaused && <Button
        icon='play'
        label={t('Resume Fast Forward')}
        onClick={resumeFastForward}
      />}
      <Dropdown
        className='bookSelect'
        isDisabled={!books.length || isBusy || isFastForwardRunning}
        isFull
        label={t('Uploaded books')}
        onChange={setSelectedId}
        options={options}
        placeholder={t('No books uploaded')}
        value={selectedId}
      />
      <Button
        className='deleteButton'
        icon='trash'
        isDisabled={!selectedBook || isBusy || isFastForwardRunning}
        onClick={deleteSelectedBook}
      />
    </div>
    <input
      accept='application/pdf,.pdf'
      className='fileInput'
      onChange={onFileChange}
      ref={fileInputRef}
      type='file'
    />
  </div>;
}
