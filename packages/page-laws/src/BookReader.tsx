// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { getBookPages, putBookPage } from '@slonigiraf/db';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button, styled } from '@polkadot/react-components';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

interface Props {
  book: Book;
  file: File;
}

function BookReader ({ book, file }: Props): React.ReactElement {
  const [concepts, setConcepts] = useState('');
  const [error, setError] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [totalPages, setTotalPages] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const pageAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    let loadingTask: PDFDocumentLoadingTask | undefined;

    setError('');
    setPageNumber(1);
    setPageInput('1');
    setPdf(undefined);
    setTotalPages(0);

    const load = async (): Promise<void> => {
      const data = new Uint8Array(await file.arrayBuffer());

      if (!active) {
        return;
      }

      loadingTask = getDocument({ data });

      const [document, storedPages] = await Promise.all([
        loadingTask.promise,
        getBookPages(book.id)
      ]);

      if (!active) {
        void document.destroy();

        return;
      }

      setPdf(document);
      setTotalPages(document.numPages);
      setPages(new Map(storedPages.map((page) => [page.pageNumber, page])));
    };

    load().catch(() => active && setError('Unable to open this PDF.'));

    return () => {
      active = false;
      void loadingTask?.destroy();
    };
  }, [book.id, file]);

  useEffect(() => {
    setConcepts(pages.get(pageNumber)?.concepts ?? '');
  }, [pageNumber, pages]);

  useEffect(() => {
    if (!pdf || !canvasRef.current || !pageAreaRef.current) {
      return;
    }

    let renderTask: RenderTask | undefined;
    let active = true;
    const canvas = canvasRef.current;
    const pageArea = pageAreaRef.current;

    const render = async (): Promise<void> => {
      const page = await pdf.getPage(pageNumber);
      const initialViewport = page.getViewport({ scale: 1 });
      const availableWidth = Math.max(pageArea.clientWidth, 320);
      const scale = availableWidth / initialViewport.width;
      const viewport = page.getViewport({ scale });
      const context = canvas.getContext('2d');

      if (!active || !context) {
        return;
      }

      canvas.width = viewport.width;
      canvas.height = viewport.height;
      renderTask = page.render({ canvasContext: context, viewport });
      await renderTask.promise;
    };

    render().catch((renderError: Error) => {
      if (renderError.name !== 'RenderingCancelledException') {
        setError('Unable to render this page.');
      }
    });

    return () => {
      active = false;
      renderTask?.cancel();
    };
  }, [isMaximized, pageNumber, pdf]);

  useEffect(() => {
    if (!isMaximized) {
      return;
    }

    const closeOnEscape = ({ key }: KeyboardEvent): void => {
      if (key === 'Escape') {
        setIsMaximized(false);
      }
    };

    window.addEventListener('keydown', closeOnEscape);

    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [isMaximized]);

  const saveConcepts = useCallback((): void => {
    const bookPage: BookPage = {
      bookId: book.id,
      concepts,
      conceptsProcessed: pages.get(pageNumber)?.conceptsProcessed ?? false,
      pageNumber
    };

    setPages((current) => new Map(current).set(pageNumber, bookPage));
    putBookPage(bookPage).catch(() => setError('Unable to save concepts.'));
  }, [book.id, concepts, pageNumber, pages]);

  const goToPage = useCallback((requestedPage: number): void => {
    if (!totalPages) {
      return;
    }

    const nextPage = Math.min(totalPages, Math.max(1, requestedPage));

    saveConcepts();
    setPageNumber(nextPage);
    setPageInput(String(nextPage));
  }, [saveConcepts, totalPages]);

  const submitPageInput = useCallback((): void => {
    const requestedPage = Number(pageInput);

    if (Number.isInteger(requestedPage)) {
      goToPage(requestedPage);
    } else {
      setPageInput(String(pageNumber));
    }
  }, [goToPage, pageInput, pageNumber]);

  return (
    <StyledReader className={isMaximized ? 'isMaximized' : ''}>
      <div className='pageNavigation'>
        <Button
          icon='arrow-left'
          isDisabled={pageNumber <= 1}
          onClick={() => goToPage(pageNumber - 1)}
        />
        <label>
          Page
          <input
            max={totalPages || 1}
            min={1}
            onBlur={submitPageInput}
            onChange={({ target }) => setPageInput(target.value)}
            onKeyDown={({ key }) => key === 'Enter' && submitPageInput()}
            type='number'
            value={pageInput}
          />
          <span>of {totalPages || '…'}</span>
        </label>
        <Button
          icon='arrow-right'
          isDisabled={!totalPages || pageNumber >= totalPages}
          onClick={() => goToPage(pageNumber + 1)}
        />
        <input
          aria-label='Navigate pages'
          className='pageScroller'
          disabled={!totalPages}
          max={totalPages || 1}
          min={1}
          onChange={({ target }) => goToPage(Number(target.value))}
          type='range'
          value={pageNumber}
        />
        <div className='previewButton'>
          <Button
            icon={isMaximized ? 'compress' : 'search-plus'}
            onClick={() => setIsMaximized((value) => !value)}
          />
        </div>
      </div>
      {error && <p
        className='readerError'
        role='alert'
                >{error}</p>}
      <div className='readerColumns'>
        <div
          className='pageArea'
          ref={pageAreaRef}
        >
          <canvas ref={canvasRef} />
        </div>
        <label className='conceptsArea'>
          <span>Concepts</span>
          <textarea
            onBlur={saveConcepts}
            onChange={({ target }) => setConcepts(target.value)}
            placeholder='Concepts for this page'
            value={concepts}
          />
        </label>
      </div>
    </StyledReader>
  );
}

const StyledReader = styled.div`
  &.isMaximized {
    background: var(--bg-page);
    box-sizing: border-box;
    height: 100vh;
    height: 100dvh;
    inset: 0;
    padding: 1rem;
    position: fixed;
    width: 100vw;
    z-index: 1000;
  }

  &.isMaximized .readerColumns {
    height: calc(100vh - 5rem);
    height: calc(100dvh - 5rem);
  }

  .pageNavigation {
    align-items: center;
    display: grid;
    gap: 0.75rem;
    grid-template-columns: auto auto auto minmax(10rem, 1fr) auto;
    margin-bottom: 1rem;
  }

  .pageNavigation label {
    align-items: center;
    display: flex;
    gap: 0.5rem;
    white-space: nowrap;
  }

  .pageNavigation input[type='number'] {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    padding: 0.55rem;
    width: 5rem;
  }

  .pageScroller {
    cursor: pointer;
    min-width: 0;
    width: 100%;
  }

  .readerColumns {
    align-items: stretch;
    display: grid;
    gap: 1rem;
    grid-template-columns: minmax(0, 1fr) minmax(18rem, 1fr);
  }

  .conceptsArea {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.5rem;
    box-sizing: border-box;
    min-width: 0;
    overflow: hidden;
  }

  .pageArea {
    box-sizing: border-box;
    min-width: 0;
    overflow: auto;
    text-align: center;
  }

  .pageArea canvas {
    background: white;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.18);
    display: inline-block;
    height: auto;
    max-width: 100%;
  }

  .previewButton {
    align-items: center;
    display: flex;
    justify-content: flex-end;
  }

  .previewButton .ui--Button {
    margin: 0;
  }

  .conceptsArea {
    display: flex;
    flex-direction: column;
    padding: 1rem;
  }

  .conceptsArea > span {
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  .conceptsArea textarea {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    box-sizing: border-box;
    color: var(--color-text);
    flex: 1;
    min-height: 0;
    padding: 1rem;
    resize: vertical;
    width: 100%;
  }

  .readerError {
    color: #9f3a38;
  }

  @media only screen and (max-width: 800px) {
    .pageNavigation {
      grid-template-columns: auto 1fr auto auto;
    }

    .pageScroller {
      grid-column: 1 / 4;
    }

    .readerColumns {
      grid-template-columns: 1fr;
      height: auto;
    }

    .pageArea {
      height: calc(100vh - 70px);
      height: calc(100dvh - 70px);
    }

    .conceptsArea textarea {
      min-height: 20rem;
    }
  }
`;

export default React.memo(BookReader);
