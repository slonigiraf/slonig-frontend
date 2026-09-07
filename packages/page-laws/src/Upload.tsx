// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';

import { createBook, deleteBook, getBookByContentHash, getBookConceptsForBookPage, getBookPages, getBooks, getExercisesForBookPage, putBook, updateBookProcessingStage } from '@slonigiraf/db';
import { getDocument } from 'pdfjs-dist';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dropdown, Modal, styled } from '@polkadot/react-components';

import { estimateAiInput, formatAiInputEstimate } from './aiEstimate.js';
import BookReader, { OPENAI_MODELS } from './BookReader.js';
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
  const [generateAllConceptsModel, setGenerateAllConceptsModel] = useState(OPENAI_MODELS[0].value);
  const [generateConceptsEstimate, setGenerateConceptsEstimate] = useState('');
  const [isGenerateConceptsConfirmationOpen, setIsGenerateConceptsConfirmationOpen] = useState(false);
  const [isRefineConfirmationOpen, setIsRefineConfirmationOpen] = useState(false);
  const [isRecognizeConfirmationOpen, setIsRecognizeConfirmationOpen] = useState(false);
  const [pendingProcessingAction, setPendingProcessingAction] = useState<'concepts' | 'recognize' | 'refine'>();
  const [refineAllContentRequest, setRefineAllContentRequest] = useState(0);
  const [refineEstimate, setRefineEstimate] = useState('');
  const [recognizeEstimate, setRecognizeEstimate] = useState('');
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
    setIsRecognizeConfirmationOpen(true);
  }, []);

  useEffect(() => {
    if (!isRecognizeConfirmationOpen || !readerFile) {
      return;
    }

    let active = true;
    let document: PDFDocumentProxy | undefined;

    const calculate = async (): Promise<void> => {
      const task = getDocument({ data: new Uint8Array(await readerFile.arrayBuffer()) });

      document = await task.promise;

      if (active) {
        const price = document.numPages * 0.005;

        setRecognizeEstimate(`Estimated Mathpix v3/pdf cost: ${document.numPages} page${document.numPages === 1 ? '' : 's'} × $0.005 = $${price.toFixed(3)}.`);
      }
    };

    calculate().catch(() => active && setRecognizeEstimate('Unable to estimate the Mathpix cost.'));

    return () => {
      active = false;
      document?.destroy().catch(console.error);
    };
  }, [isRecognizeConfirmationOpen, readerFile]);

  const closeRecognizeConfirmation = useCallback((): void => {
    setIsRecognizeConfirmationOpen(false);
  }, []);

  const confirmRecognize = useCallback((): void => {
    setIsRecognizeConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('recognize');

    updateBookProcessingStage(selectedBook.id, 0).then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setRecognizeAllRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [selectedBook, t]);

  const onGenerateConcepts = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('concepts');

    setIsGenerateConceptsConfirmationOpen(true);
  }, [selectedBook]);

  useEffect(() => {
    if (!isGenerateConceptsConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id)
      .then((pages) => {
        const requestInputs = pages.filter(({ pageMMD }) => !!pageMMD).flatMap(({ pageMMD = '' }) => {
          const validationInput = pageMMD.slice(0, Math.ceil(pageMMD.length / 3));

          return [pageMMD.padEnd(pageMMD.length + 2_000), validationInput.padEnd(validationInput.length + 2_000)];
        });

        setGenerateConceptsEstimate(formatAiInputEstimate(estimateAiInput(generateAllConceptsModel, requestInputs, pages.length * 4_800)));
      })
      .catch(() => setError(t('Unable to estimate concept generation cost.')));
  }, [generateAllConceptsModel, isGenerateConceptsConfirmationOpen, selectedBook, t]);

  const closeGenerateConceptsConfirmation = useCallback((): void => {
    setIsGenerateConceptsConfirmationOpen(false);
  }, []);

  const confirmGenerateConcepts = useCallback((): void => {
    setIsGenerateConceptsConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    updateBookProcessingStage(selectedBook.id, 1).then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setGenerateAllConceptsRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [selectedBook, t]);

  const onRefineContent = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('refine');
    setIsRefineConfirmationOpen(true);
  }, [selectedBook]);

  useEffect(() => {
    if (!isRefineConfirmationOpen || !selectedBook) {
      return;
    }

    getBookPages(selectedBook.id).then(async (pages) => {
      const inputs = await Promise.all(pages.map(async ({ pageNumber }) => JSON.stringify({
        concepts: await getBookConceptsForBookPage(selectedBook.id, pageNumber),
        exercises: await getExercisesForBookPage([selectedBook.id, pageNumber])
      })));
      const requests = inputs.flatMap((input) => Array.from({ length: 8 }, () => input.padEnd(input.length + 2_000)));

      setRefineEstimate(formatAiInputEstimate(estimateAiInput(generateAllConceptsModel, requests, pages.length * 12_000)));
    }).catch(() => setError(t('Unable to estimate refinement cost.')));
  }, [generateAllConceptsModel, isRefineConfirmationOpen, selectedBook, t]);

  const closeRefineConfirmation = useCallback((): void => {
    setIsRefineConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, []);

  const confirmRefineContent = useCallback((): void => {
    setIsRefineConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    updateBookProcessingStage(selectedBook.id, 2).then((updatedBook) => {
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      setRefineAllContentRequest((request) => request + 1);
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
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
      setSelectedId(remaining[0]?.id);
    } catch {
      setError(t('Unable to delete this PDF.'));
    } finally {
      setIsBusy(false);
    }
  }, [books, selectedBook, t]);

  const onBookChange = useCallback((updatedBook: Book): void => {
    setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
  }, []);
  const onProcessingComplete = useCallback((): void => setPendingProcessingAction(undefined), []);

  return (
    <StyledSection>
      {isRecognizeConfirmationOpen && <Modal
        header={t('Recognize pages')}
        onClose={closeRecognizeConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Recognize every page in this book?')}</p>
          <p>{recognizeEstimate}</p>
          <p>
            <a
              href='https://mathpix.com/pricing/api'
              rel='noreferrer'
              target='_blank'
            >Mathpix API pricing</a>
          </p>
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeRecognizeConfirmation}
            />
            <Button
              icon='camera'
              label={t('Recognize')}
              onClick={confirmRecognize}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isGenerateConceptsConfirmationOpen && <Modal
        header={t('Generate concepts')}
        onClose={closeGenerateConceptsConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Generate concepts for every recognized page in this book?')}</p>
          <p>{generateConceptsEstimate}</p>
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeGenerateConceptsConfirmation}
            />
            <Button
              icon='magic'
              label={t('Generate')}
              onClick={confirmGenerateConcepts}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      {isRefineConfirmationOpen && <Modal
        header={t('Refine concepts and generate exercises')}
        onClose={closeRefineConfirmation}
        size='small'
      >
        <Modal.Content>
          <p>{t('Split concepts twice, generate four diverse exercises per refined concept, merge them with book exercises, then split the merged exercises twice?')}</p>
          <p>{refineEstimate}</p>
          <Dropdown
            className='batchModelSelect'
            isFull
            label={t('Model')}
            onChange={setGenerateAllConceptsModel}
            options={OPENAI_MODELS}
            value={generateAllConceptsModel}
          />
          <Button.Group>
            <Button
              icon='times'
              label={t('Cancel')}
              onClick={closeRefineConfirmation}
            />
            <Button
              icon='magic'
              label={t('Generate')}
              onClick={confirmRefineContent}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
      <div className='bookToolbar'>
        <Button
          icon='upload'
          isDisabled={isBusy}
          label={t('Upload')}
          onClick={onChooseFile}
        />
        <Dropdown
          className='bookSelect'
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
          icon='trash'
          isDisabled={!selectedBook || isBusy}
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
          generateAllConceptsModel={generateAllConceptsModel}
          generateAllConceptsRequest={generateAllConceptsRequest}
          onBookChange={onBookChange}
          onProcessingComplete={onProcessingComplete}
          pendingProcessingAction={pendingProcessingAction}
          processingToolbar={<>
            <Button
              icon={(selectedBook?.processingStage ?? 0) >= 1 ? 'rotate-left' : 'play'}
              isDisabled={!selectedBook || !readerFile || isBusy}
              label={t('Recognize')}
              onClick={onRecognize}
            />
            <span className='pipelineStep'>
              <span>›</span>
              <Button
                icon={(selectedBook?.processingStage ?? 0) >= 2 ? 'rotate-left' : 'play'}
                isDisabled={!selectedBook || !readerFile || isBusy || (selectedBook.processingStage ?? 0) < 1}
                label={t('Concepts')}
                onClick={onGenerateConcepts}
              />
            </span>
            <span className='pipelineStep'>
              <span>›</span>
              <Button
                icon={(selectedBook?.processingStage ?? 0) >= 3 ? 'rotate-left' : 'play'}
                isDisabled={!selectedBook || !readerFile || isBusy || (selectedBook.processingStage ?? 0) < 2}
                label={t('Refine & generate exercises')}
                onClick={onRefineContent}
              />
            </span>
          </>}
          recognizeAllRequest={recognizeAllRequest}
          refineAllContentRequest={refineAllContentRequest}
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
    gap: 1rem;
    grid-template-columns: auto minmax(12rem, 1fr) auto;
    margin-bottom: 0;
  }

  .bookToolbar .ui--Button {
    margin-bottom: 0.25rem;
  }

  .bookToolbar > .ui--Button:first-child {
    margin-bottom: 0;
    margin-right: -0.5rem;
  }

  .bookSelect { min-width: 0; overflow: visible; }
  .bookSelect > .text { display: block; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .batchModelSelect {
    margin: 1rem 0;
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
      gap: 0.5rem;
      grid-template-columns: 1fr 1fr;
    }

    .bookToolbar .ui--Dropdown {
      grid-column: 1 / -1;
    }
  }
`;

export default React.memo(Upload);
