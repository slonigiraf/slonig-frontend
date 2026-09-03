// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';

import { deleteBook, getBooks, putBook } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, styled } from '@polkadot/react-components';

import { useTranslation } from './translate.js';

const BOOKS_DIRECTORY = 'books';

async function getBooksDirectory (): Promise<FileSystemDirectoryHandle> {
  if (!navigator.storage?.getDirectory) {
    throw new Error('OPFS is not supported by this browser');
  }

  const root = await navigator.storage.getDirectory();

  return root.getDirectoryHandle(BOOKS_DIRECTORY, { create: true });
}

async function writePdf (opfsName: string, contents: Uint8Array): Promise<void> {
  const directory = await getBooksDirectory();
  const handle = await directory.getFileHandle(opfsName, { create: true });
  const writable = await handle.createWritable();

  await writable.write(contents.slice().buffer);
  await writable.close();
}

async function removePdf (opfsName: string): Promise<void> {
  const directory = await getBooksDirectory();

  await directory.removeEntry(opfsName);
}

async function readPdf (opfsName: string): Promise<File> {
  const directory = await getBooksDirectory();
  const handle = await directory.getFileHandle(opfsName);

  return handle.getFile();
}

function Upload (): React.ReactElement {
  const { t } = useTranslation();
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = useCallback(async (): Promise<void> => {
    const storedBooks = await getBooks();

    setBooks(storedBooks);
    setSelectedId((current) => current || storedBooks[0]?.id || '');
  }, []);

  useEffect((): void => {
    loadBooks().catch(() => setError(t('Unable to load uploaded books.')));
  }, [loadBooks, t]);

  const selectedBook = useMemo(
    () => books.find(({ id }) => id === selectedId),
    [books, selectedId]
  );

  const options = useMemo(
    () => books.map(({ id, name }) => ({ key: id, text: name, value: id })),
    [books]
  );

  const onUpload = useCallback(async (contents: Uint8Array, name: string): Promise<void> => {
    setError('');

    if (String.fromCharCode(...contents.slice(0, 5)) !== '%PDF-') {
      setError(t('The selected file is not a valid PDF.'));

      return;
    }

    setIsBusy(true);

    const id = crypto.randomUUID();
    const opfsName = `${id}.pdf`;

    try {
      await writePdf(opfsName, contents);
      await putBook({ created: Date.now(), id, name, opfsName, size: contents.byteLength });
      await loadBooks();
      setSelectedId(id);
    } catch {
      try {
        await removePdf(opfsName);
      } catch {
        // The file may not have been created yet.
      }

      setError(t('Unable to store this PDF.'));
    } finally {
      setIsBusy(false);
    }
  }, [loadBooks, t]);

  const onChooseFile = useCallback((): void => {
    fileInputRef.current?.click();
  }, []);

  const onFileChange = useCallback((event: React.ChangeEvent<HTMLInputElement>): void => {
    const file = event.currentTarget.files?.[0];

    event.currentTarget.value = '';

    if (file) {
      file.arrayBuffer()
        .then((buffer) => onUpload(new Uint8Array(buffer), file.name))
        .catch(() => setError(t('Unable to read this PDF.')));
    }
  }, [onUpload, t]);

  const onDownload = useCallback(async (): Promise<void> => {
    if (!selectedBook) {
      return;
    }

    setError('');

    try {
      const file = await readPdf(selectedBook.opfsName);
      const url = URL.createObjectURL(file);
      const link = document.createElement('a');

      link.download = selectedBook.name;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setError(t('Unable to download this PDF.'));
    }
  }, [selectedBook, t]);

  const onDelete = useCallback(async (): Promise<void> => {
    if (!selectedBook) {
      return;
    }

    setError('');
    setIsBusy(true);

    try {
      await removePdf(selectedBook.opfsName);
      await deleteBook(selectedBook.id);

      const remaining = books.filter(({ id }) => id !== selectedBook.id);

      setBooks(remaining);
      setSelectedId(remaining[0]?.id || '');
    } catch {
      setError(t('Unable to delete this PDF.'));
    } finally {
      setIsBusy(false);
    }
  }, [books, selectedBook, t]);

  return (
    <StyledSection>
      <div className='bookToolbar'>
        <Dropdown
          isDisabled={!books.length || isBusy}
          isFull
          label={t('Uploaded books')}
          onChange={setSelectedId}
          options={options}
          placeholder={t('No books uploaded')}
          value={selectedId}
        />
        <input
          accept='application/pdf,.pdf'
          className='fileInput'
          onChange={onFileChange}
          ref={fileInputRef}
          type='file'
        />
        <Button
          icon='upload'
          isDisabled={isBusy}
          label={t('Upload')}
          onClick={onChooseFile}
        />
        <Button
          icon='download'
          isDisabled={!selectedBook || isBusy}
          label={t('Download')}
          onClick={onDownload}
        />
        <Button
          icon='trash'
          isDisabled={!selectedBook || isBusy}
          label={t('Delete')}
          onClick={onDelete}
        />
      </div>
      {error && (
        <p
          className='errorMessage'
          role='alert'
        >{error}</p>
      )}
    </StyledSection>
  );
}

const StyledSection = styled.section`
  margin: 1.5rem auto 2rem;
  max-width: 60rem;

  .bookToolbar {
    align-items: flex-end;
    display: grid;
    gap: 0.5rem;
    grid-template-columns: minmax(12rem, 1fr) auto auto auto;
    margin-bottom: 2rem;
  }

  .bookToolbar .ui--Button {
    margin-bottom: 0.25rem;
  }

  .fileInput {
    display: none;
  }

  .errorMessage {
    color: #9f3a38;
    margin: 0.75rem 0 0;
  }

  @media only screen and (max-width: 700px) {
    .bookToolbar {
      align-items: stretch;
      grid-template-columns: 1fr 1fr;
    }

    .bookToolbar .ui--Dropdown {
      grid-column: 1 / -1;
    }
  }
`;

export default React.memo(Upload);
