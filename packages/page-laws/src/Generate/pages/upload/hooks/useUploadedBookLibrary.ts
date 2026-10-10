// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import { createBook, deleteBook, getBookByContentHash, getBooks, updateBookFields } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { bookProcessingManager } from '../../../book/application/pipeline/bookProcessingManager.js';
import { clearBookExternalCalls } from '../../../book/infrastructure/storage/bookExternalCalls.js';
import { clearFixConceptsChapterStatuses } from '../../../book/infrastructure/storage/fixConceptsProgress.js';
import { clearBookStageTimes } from '../../../book/infrastructure/storage/bookStageTime.js';
import { useTranslation } from '../../../../common/translate.js';

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

interface UploadedBookLibrary {
  books: Book[];
  deleteSelectedBook: () => Promise<void>;
  isBusy: boolean;
  readerFile?: File;
  refreshBooks: () => Promise<void>;
  selectedBook?: Book;
  selectedId?: number;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setSelectedId: Dispatch<SetStateAction<number | undefined>>;
  uploadBook: (contents: Uint8Array, name: string) => Promise<void>;
}

export function useUploadedBookLibrary (setError: Dispatch<SetStateAction<string>>): UploadedBookLibrary {
  const { t } = useTranslation();
  const [books, setBooks] = useState<Book[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [readerFile, setReaderFile] = useState<File>();
  const [selectedId, setSelectedId] = useState<number | undefined>(getSessionBookId);

  const loadBooks = useCallback(async (): Promise<void> => {
    let storedBooks = await getBooks();

    for (const book of storedBooks) {
      if (!book.contentHash) {
        try {
          const file = await readPdf(book.opfsName);
          const contentHash = await getContentHash(new Uint8Array(await file.arrayBuffer()));

          await updateBookFields(book.id, { contentHash });
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
  }, [loadBooks, setError, t]);

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
  const selectedBookOpfsName = selectedBook?.opfsName;

  useEffect(() => {
    let active = true;

    setReaderFile(undefined);

    if (selectedBookOpfsName) {
      readPdf(selectedBookOpfsName)
        .then((file) => active && setReaderFile(file))
        .catch(() => active && setError(t('Unable to open this PDF.')));
    }

    return () => {
      active = false;
    };
  }, [selectedBookOpfsName, setError, t]);

  const uploadBook = useCallback(async (contents: Uint8Array, name: string): Promise<void> => {
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
      await updateBookFields(id, { opfsName });
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
  }, [loadBooks, setError, t]);

  const refreshBooks = useCallback(async (): Promise<void> => {
    setBooks(await getBooks());
  }, []);

  const deleteSelectedBook = useCallback(async (): Promise<void> => {
    if (!selectedBook) {
      return;
    }

    setError('');
    setIsBusy(true);

    try {
      bookProcessingManager.cancel(selectedBook.id);
      await bookProcessingManager.flush(selectedBook.id);
      await removePdf(selectedBook.opfsName);
      await deleteBook(selectedBook.id);
      bookProcessingManager.forget(selectedBook.id);
      clearFixConceptsChapterStatuses(selectedBook.id);
      clearBookStageTimes(selectedBook.id);
      clearBookExternalCalls(selectedBook.id);

      const remaining = books.filter(({ id }) => id !== selectedBook.id);

      setBooks(remaining);
      setSelectedId(remaining[0]?.id);
    } catch {
      setError(t('Unable to delete this PDF.'));
    } finally {
      setIsBusy(false);
    }
  }, [books, selectedBook, setError, t]);

  return {
    books,
    deleteSelectedBook,
    isBusy,
    readerFile,
    refreshBooks,
    selectedBook,
    selectedId,
    setBooks,
    setSelectedId,
    uploadBook
  };
}
