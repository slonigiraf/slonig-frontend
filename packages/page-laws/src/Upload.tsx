// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';

import { createBook, deleteBook, getBookByContentHash, getBooks, putBook } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, styled } from '@polkadot/react-components';

import BookReader from './BookReader.js';
import { useTranslation } from './translate.js';

const BOOKS_DIRECTORY = 'books';
const SELECTED_BOOK_SESSION_KEY = 'knowledge-upload-selected-book';

function getSessionBookId (): number | undefined {
  try {
    const value = Number(sessionStorage.getItem(SELECTED_BOOK_SESSION_KEY));

    return Number.isSafeInteger(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

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

async function getContentHash (contents: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', contents.slice().buffer);

  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function Upload (): React.ReactElement {
  const { t } = useTranslation();
  const [books, setBooks] = useState<Book[]>([]);
  const [error, setError] = useState('');
  const [isBusy, setIsBusy] = useState(false);
  const [generateAllConceptsRequest, setGenerateAllConceptsRequest] = useState(0);
  const [recognizeAllRequest, setRecognizeAllRequest] = useState(0);
  const [readerFile, setReaderFile] = useState<File>();
  const [selectedId, setSelectedId] = useState<number | undefined>(getSessionBookId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = useCallback(async (): Promise<void> => {
    let storedBooks = await getBooks();

    for (const book of storedBooks) {
      if (!book.contentHash) {
        try {
          const file = await readPdf(book.opfsName);
          const contentHash = await getContentHash(new Uint8Array(await file.arrayBuffer()));

          await putBook({ ...book, contentHash });
        } catch {
          // A missing file or an existing duplicate should not prevent other books from loading.
        }
      }
    }

    storedBooks = await getBooks();

    setBooks(storedBooks);
    setSelectedId((current) => storedBooks.some(({ id }) => id === current) ? current : storedBooks[0]?.id);
  }, []);

  useEffect((): void => {
    loadBooks().catch(() => setError(t('Unable to load uploaded books.')));
  }, [loadBooks, t]);

  useEffect((): void => {
    try {
      if (selectedId === undefined) {
        sessionStorage.removeItem(SELECTED_BOOK_SESSION_KEY);
      } else {
        sessionStorage.setItem(SELECTED_BOOK_SESSION_KEY, String(selectedId));
      }
    } catch {
      // Session storage may be unavailable in privacy-restricted browser contexts.
    }
  }, [selectedId]);

  const selectedBook = useMemo(
    () => books.find(({ id }) => id === selectedId),
    [books, selectedId]
  );

  useEffect(() => {
    let active = true;

    setReaderFile(undefined);

    if (selectedBook) {
      readPdf(selectedBook.opfsName)
        .then((file) => active && setReaderFile(file))
        .catch(() => active && setError(t('Unable to open this PDF.')));
    }

    return () => {
      active = false;
    };
  }, [selectedBook, t]);

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

    let id: number | undefined;
    let opfsName: string | undefined;

    try {
      const contentHash = await getContentHash(contents);
      const existingBook = await getBookByContentHash(contentHash);

      if (existingBook) {
        setSelectedId(existingBook.id);

        return;
      }

      id = await createBook({ contentHash, created: Date.now(), name, opfsName: '', size: contents.byteLength });
      opfsName = `${id}.pdf`;
      await writePdf(opfsName, contents);
      await putBook({ contentHash, created: Date.now(), id, name, opfsName, size: contents.byteLength });
      await loadBooks();
      setSelectedId(id);
    } catch {
      try {
        if (opfsName) {
          await removePdf(opfsName);
        }
      } catch {
        // The file may not have been created yet.
      }

      if (id !== undefined) {
        try {
          await deleteBook(id);
        } catch {
          // Preserve the original upload error if cleanup also fails.
        }
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

  const onRecognize = useCallback((): void => {
    setRecognizeAllRequest((request) => request + 1);
  }, []);

  const onGenerateConcepts = useCallback((): void => {
    setGenerateAllConceptsRequest((request) => request + 1);
  }, []);

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
      setSelectedId(remaining[0]?.id);
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
          icon='camera'
          isDisabled={!selectedBook || !readerFile || isBusy}
          label={t('Recognize')}
          onClick={onRecognize}
        />
        <Button
          icon='magic'
          isDisabled={!selectedBook || !readerFile || isBusy}
          label={t('Concepts')}
          onClick={onGenerateConcepts}
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
      {selectedBook && readerFile && (
        <BookReader
          book={selectedBook}
          file={readerFile}
          generateAllConceptsRequest={generateAllConceptsRequest}
          recognizeAllRequest={recognizeAllRequest}
        />
      )}
    </StyledSection>
  );
}

const StyledSection = styled.section`
  margin: 1.5rem auto 2rem;
  max-width: 90rem;

  .bookToolbar {
    align-items: flex-end;
    display: grid;
    gap: 0.5rem;
    grid-template-columns: minmax(12rem, 1fr) repeat(4, auto);
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
