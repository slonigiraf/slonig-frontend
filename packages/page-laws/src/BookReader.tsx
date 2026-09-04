// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage } from '@slonigiraf/db';
import type { PDFDocumentLoadingTask, PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

import { getBookPages, getSetting, putBookPage, SettingKey, storeSetting } from '@slonigiraf/db';
import MathpixLoader from 'mathpix-markdown-it/lib/components/mathpix-loader/index.js';
import MathpixMarkdown from 'mathpix-markdown-it/lib/components/mathpix-markdown/index.js';
import OpenAI from 'openai';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import React, { useCallback, useEffect, useRef, useState } from 'react';

import { Button, Input, Modal, styled } from '@polkadot/react-components';

GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

const CONCEPTS_PROMPT = `On the provided page, identify the chapter and subchapter/section.

Extract only the concepts that are intentionally introduced or explained as new on this page. Do not include concepts that the page assumes the reader already knows, merely reviews, references from earlier sections, or uses only in exercises/examples without introducing them.

Use this exact output format, keeping the original language of the input:

◆ **[Chapter number and name, if shown] / [Subchapter or section number and name, if shown]**

● [New concept]

↳ [example from the page, if present]

● [New concept]

↳ [example from the page, if present]

If no new concepts are introduced, write:

● No new concepts introduced on this page.

Do not add explanations, commentary, summaries, or any text outside this format.`;

const OPENAI_MODELS = [
  { text: 'GPT-4o mini', value: 'openai/gpt-4o-mini' },
  { text: 'GPT-4o', value: 'openai/gpt-4o' },
  { text: 'GPT-4.1 mini', value: 'openai/gpt-4.1-mini' },
  { text: 'GPT-4.1', value: 'openai/gpt-4.1' },
  { text: 'GPT-5 mini', value: 'openai/gpt-5-mini' },
  { text: 'GPT-5', value: 'openai/gpt-5' },
  { text: 'GPT-5.4', value: 'openai/gpt-5.4' }
];

interface Props {
  book: Book;
  file: File;
}

type ReaderTab = 'recognized' | 'concepts';

function BookReader ({ book, file }: Props): React.ReactElement {
  const [activeTab, setActiveTab] = useState<ReaderTab>('recognized');
  const [concepts, setConcepts] = useState('');
  const [error, setError] = useState('');
  const [isMaximized, setIsMaximized] = useState(false);
  const [isMathpixKeyPromptOpen, setIsMathpixKeyPromptOpen] = useState(false);
  const [mathpixApiKey, setMathpixApiKey] = useState('');
  const [processingPage, setProcessingPage] = useState<number>();
  const [pageInput, setPageInput] = useState('1');
  const [pageNumber, setPageNumber] = useState(1);
  const [pages, setPages] = useState<Map<number, BookPage>>(new Map());
  const [pdf, setPdf] = useState<PDFDocumentProxy>();
  const [renderedPage, setRenderedPage] = useState<number>();
  const [selectedModel, setSelectedModel] = useState(OPENAI_MODELS[0].value);
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
    setRenderedPage(undefined);
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

      if (active) {
        setRenderedPage(pageNumber);
      }
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

  const generateConcepts = useCallback(async (): Promise<void> => {
    const pageMMD = pages.get(pageNumber)?.pageMMD;

    if (!pageMMD || processingPage !== undefined) {
      return;
    }

    setError('');
    setProcessingPage(pageNumber);

    try {
      const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

      if (!key) {
        throw new Error('No OpenRouter token found. Add it in Settings.');
      }

      const client = new OpenAI({
        apiKey: key,
        baseURL: 'https://openrouter.ai/api/v1',
        dangerouslyAllowBrowser: true,
        defaultHeaders: {
          'HTTP-Referer': window.location.origin,
          'X-OpenRouter-Title': 'Slonig'
        }
      });
      const response = await client.chat.completions.create({
        messages: [{
          content: `${CONCEPTS_PROMPT}\n\nRecognized page in Mathpix Markdown:\n\n${pageMMD}`,
          role: 'user'
        }],
        model: selectedModel
      });
      const generatedConcepts = response.choices[0].message?.content?.trim();

      if (!generatedConcepts) {
        throw new Error('OpenRouter returned no concepts.');
      }

      const generatedPage: BookPage = {
        ...pages.get(pageNumber),
        bookId: book.id,
        concepts: generatedConcepts,
        conceptsProcessed: true,
        pageNumber
      };

      await putBookPage(generatedPage);
      setPages((current) => new Map(current).set(pageNumber, generatedPage));
    } catch (generationError) {
      setError(generationError instanceof Error ? generationError.message : 'Unable to generate concepts.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [book.id, pageNumber, pages, processingPage, selectedModel]);

  const recognizePage = useCallback(async (): Promise<void> => {
    if (!canvasRef.current || renderedPage !== pageNumber || processingPage !== undefined) {
      return;
    }

    setError('');
    setProcessingPage(pageNumber);

    try {
      const apiKey = await getSetting(SettingKey.MATHPIX_API_KEY);

      if (!apiKey) {
        setIsMathpixKeyPromptOpen(true);

        return;
      }

      const tokenResponse = await fetch('https://api.mathpix.com/v3/app-tokens', {
        headers: { app_key: apiKey },
        method: 'POST'
      });
      const token = await tokenResponse.json() as { app_token?: string; error?: string };

      if (!tokenResponse.ok || !token.app_token) {
        throw new Error(token.error || 'Mathpix authentication failed.');
      }

      const image = await new Promise<Blob>((resolve, reject) => {
        canvasRef.current?.toBlob((blob) => blob
          ? resolve(blob)
          : reject(new Error('Unable to prepare this page for recognition.')), 'image/png');
      });
      const body = new FormData();

      body.append('file', image, `page-${pageNumber}.png`);
      body.append('options_json', JSON.stringify({ enable_document_layout: true, formats: ['text'] }));

      const response = await fetch('https://api.mathpix.com/v3/text', {
        body,
        headers: { app_token: token.app_token },
        method: 'POST'
      });
      const result = await response.json() as { error?: string; text?: string };
      const pageMMD = result.text?.trim();

      if (!response.ok || !pageMMD) {
        throw new Error(result.error || 'Mathpix returned no recognized content.');
      }

      const recognizedPage: BookPage = {
        ...pages.get(pageNumber),
        bookId: book.id,
        concepts: pages.get(pageNumber)?.concepts ?? '',
        conceptsProcessed: pages.get(pageNumber)?.conceptsProcessed ?? false,
        pageMMD,
        pageNumber
      };

      await putBookPage(recognizedPage);
      setPages((current) => new Map(current).set(pageNumber, recognizedPage));
    } catch (recognitionError) {
      setError(recognitionError instanceof Error ? recognitionError.message : 'Unable to recognize this page.');
    } finally {
      setProcessingPage(undefined);
    }
  }, [book.id, pageNumber, pages, processingPage, renderedPage]);

  const saveMathpixApiKey = useCallback(async (): Promise<void> => {
    const apiKey = mathpixApiKey.trim();

    if (!apiKey) {
      return;
    }

    await storeSetting(SettingKey.MATHPIX_API_KEY, apiKey);
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
    await recognizePage();
  }, [mathpixApiKey, recognizePage]);

  const submitMathpixApiKey = useCallback((): void => {
    saveMathpixApiKey().catch((saveError) => {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save the Mathpix API key.');
    });
  }, [saveMathpixApiKey]);

  const closeMathpixKeyPrompt = useCallback((): void => {
    setIsMathpixKeyPromptOpen(false);
    setMathpixApiKey('');
  }, []);

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
      ...pages.get(pageNumber),
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
      {isMathpixKeyPromptOpen && <Modal
        header='Mathpix API key'
        onClose={closeMathpixKeyPrompt}
        size='small'
      >
        <Modal.Content>
          <p>Enter your Mathpix API key to recognize this page.</p>
          <p>
            Get your API key from <a
              href='https://console.mathpix.com/'
              rel='noreferrer'
              target='_blank'
            >Mathpix Console</a>.
          </p>
          <Input
            autoFocus
            isFull
            label='Mathpix API key'
            onChange={setMathpixApiKey}
            onEnter={submitMathpixApiKey}
            placeholder='Enter your API key'
            type='password'
            value={mathpixApiKey}
          />
          <Button.Group>
            <Button
              icon='check'
              isDisabled={!mathpixApiKey.trim()}
              label='Save key'
              onClick={submitMathpixApiKey}
            />
          </Button.Group>
        </Modal.Content>
      </Modal>}
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
        <div className='detailsArea'>
          <div className='detailTabs' role='tablist'>
            {(['recognized', 'concepts'] as ReaderTab[]).map((tab) => (
              <button
                aria-selected={activeTab === tab}
                className={activeTab === tab ? 'active' : ''}
                key={tab}
                onClick={() => setActiveTab(tab)}
                role='tab'
                type='button'
              >{tab === 'recognized' ? 'Recognized' : 'Concepts'}</button>
            ))}
          </div>
          {activeTab === 'recognized'
            ? <div className='tabPanel' role='tabpanel'>
              <div className='detailsHeader'>
                <span>{processingPage === pageNumber ? 'Recognizing page…' : 'Mathpix MMD'}</span>
                <Button
                  icon='camera'
                  isDisabled={renderedPage !== pageNumber || processingPage !== undefined}
                  label={pages.get(pageNumber)?.pageMMD ? 'Recognize again' : 'Recognize page'}
                  onClick={recognizePage}
                />
              </div>
              {pages.get(pageNumber)?.pageMMD
                ? <div className='recognizedOutput'>
                  <MathpixLoader>
                    <MathpixMarkdown text={pages.get(pageNumber)?.pageMMD ?? ''} />
                  </MathpixLoader>
                </div>
                : <p className='emptyOutput'>This page has not been recognized yet.</p>}
            </div>
            : <div className='tabPanel conceptsPanel' role='tabpanel'>
              <div className='detailsHeader'>
                <span>{processingPage === pageNumber ? 'Generating concepts…' : 'Concepts'}</span>
                <div className='generationControls'>
                  <select
                    aria-label='OpenAI model'
                    disabled={processingPage !== undefined}
                    onChange={({ target }) => setSelectedModel(target.value)}
                    value={selectedModel}
                  >
                    {OPENAI_MODELS.map(({ text, value }) => (
                      <option key={value} value={value}>{text}</option>
                    ))}
                  </select>
                  <Button
                    icon='magic'
                    isDisabled={!pages.get(pageNumber)?.pageMMD || processingPage !== undefined}
                    label='Generate concepts'
                    onClick={generateConcepts}
                  />
                </div>
              </div>
              {!pages.get(pageNumber)?.pageMMD && <p className='recognitionHint'>Recognize this page before generating concepts.</p>}
              <textarea
                disabled={processingPage === pageNumber}
                onBlur={saveConcepts}
                onChange={({ target }) => setConcepts(target.value)}
                placeholder='Concepts for this page'
                value={concepts}
              />
            </div>}
        </div>
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

  .detailsArea {
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

  .detailsArea {
    display: flex;
    flex-direction: column;
  }

  .detailTabs {
    border-bottom: 1px solid #dde1eb;
    display: flex;
  }

  .detailTabs button {
    background: transparent;
    border: 0;
    border-bottom: 2px solid transparent;
    color: #8b8b8b;
    cursor: pointer;
    font: inherit;
    padding: 0.9rem 1.25rem;
  }

  .detailTabs button.active {
    border-bottom-color: var(--color-text);
    color: var(--color-text);
    font-weight: 600;
  }

  .tabPanel {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-height: 0;
    padding: 1rem;
  }

  .detailsHeader {
    align-items: center;
    display: flex;
    justify-content: space-between;
    font-weight: 600;
    margin-bottom: 0.75rem;
  }

  .generationControls {
    align-items: center;
    display: flex;
    gap: 0.5rem;
  }

  .generationControls select {
    background: var(--bg-input);
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    padding: 0.55rem;
  }

  .conceptsPanel textarea {
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

  .recognizedOutput {
    border: 1px solid #dde1eb;
    border-radius: 0.25rem;
    color: var(--color-text);
    flex: 1;
    margin: 0;
    min-height: 0;
    overflow: auto;
    padding: 1rem;
    word-break: break-word;
  }

  .recognizedOutput img, .recognizedOutput svg {
    height: auto;
    max-width: 100%;
  }

  .emptyOutput, .recognitionHint {
    color: #777;
  }

  .recognitionHint {
    margin-top: 0;
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

    .conceptsPanel textarea, .recognizedOutput {
      min-height: 20rem;
    }
  }
`;

export default React.memo(BookReader);
