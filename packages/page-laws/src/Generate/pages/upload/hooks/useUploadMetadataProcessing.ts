// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book } from '@slonigiraf/db';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getBookPages, isBookProcessingStageComplete, resetBookProcessingStagesFrom, updateBookFieldsAndStages } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useState } from 'react';

import type { AiInputEstimate } from '../../../book/processing/aiEstimate.js';
import type { BookReaderCommandAction, PendingBookProcessingAction } from '../../../book/runtime/bookPipeline.js';

import { estimateAiInput } from '../../../book/processing/aiEstimate.js';
import { clearFixConceptsChapterStatuses } from '../../../book/runtime/fixConceptsProgress.js';
import { loadPdfJs } from '../../../book/processing/source/pdf.js';
import { useTranslation } from '../../../../common/translate.js';

interface UploadMetadataProcessingParams {
  generateAllConceptsModel: string;
  readerFile?: File;
  requestProcessing: (action: BookReaderCommandAction) => void;
  selectedBook?: Book;
  setBooks: Dispatch<SetStateAction<Book[]>>;
  setError: Dispatch<SetStateAction<string>>;
  setPendingProcessingAction: Dispatch<SetStateAction<PendingBookProcessingAction | undefined>>;
}

export function useUploadMetadataProcessing ({ generateAllConceptsModel, readerFile, requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction }: UploadMetadataProcessingParams) {
  const { t } = useTranslation();
  const [identifyChaptersEstimate, setIdentifyChaptersEstimate] = useState<AiInputEstimate>();
  const [isIdentifyChaptersConfirmationOpen, setIsIdentifyChaptersConfirmationOpen] = useState(false);
  const [isRecognizeConfirmationOpen, setIsRecognizeConfirmationOpen] = useState(false);
  const [recognizePageCount, setRecognizePageCount] = useState<number>();

  const onRecognize = useCallback((): void => {
    setRecognizePageCount(undefined);
    setIsRecognizeConfirmationOpen(true);
  }, []);

  useEffect(() => {
    if (!isRecognizeConfirmationOpen || !readerFile) {
      return;
    }

    let active = true;
    let document: PDFDocumentProxy | undefined;

    const calculate = async (): Promise<void> => {
      const { getDocument } = await loadPdfJs();
      const task = getDocument({ data: new Uint8Array(await readerFile.arrayBuffer()) });

      document = await task.promise;

      if (active) {
        setRecognizePageCount(document.numPages);
      }
    };

    calculate().catch(() => {
      if (active) {
        setRecognizePageCount(undefined);
        setError(t('Unable to estimate the Mathpix cost.'));
      }
    });

    return () => {
      active = false;
      document?.destroy().catch(console.error);
    };
  }, [isRecognizeConfirmationOpen, readerFile, setError, t]);

  const closeRecognizeConfirmation = useCallback((): void => {
    setIsRecognizeConfirmationOpen(false);
  }, []);

  const confirmRecognize = useCallback((): void => {
    setIsRecognizeConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('recognize');

    updateBookFieldsAndStages(selectedBook.id, { age: undefined, language: undefined, subject: undefined }, { resetFrom: 'recognize' }).then((resetBook) => {
      if (!resetBook) {
        throw new Error('Book not found.');
      }

      setBooks((current) => current.map((book) => book.id === resetBook.id ? resetBook : book));
      requestProcessing('recognize');
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset recognition, language, subject, and age.'));
    });
  }, [requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction, t]);

  const onShowLanguage = useCallback((): void => {
    if (!selectedBook || !isBookProcessingStageComplete(selectedBook, 'recognize')) {
      return;
    }

    setError('');
    requestProcessing('language');
  }, [requestProcessing, selectedBook, setError]);

  const onShowSubject = useCallback((): void => {
    if (!selectedBook || !isBookProcessingStageComplete(selectedBook, 'recognize')) {
      return;
    }

    if (!selectedBook.language) {
      setError(t('Book language has not been set yet. Open the Language step, then detect it from text or choose it manually.'));
      return;
    }

    setError('');
    requestProcessing('subject');
  }, [requestProcessing, selectedBook, setError, t]);

  const onShowAge = useCallback((): void => {
    if (!selectedBook || !isBookProcessingStageComplete(selectedBook, 'recognize')) {
      return;
    }

    if (!selectedBook.language) {
      setError(t('Book language has not been set yet. Open the Language step, then detect it from text or choose it manually.'));
      return;
    }

    if (!selectedBook.subject) {
      setError(t('Book subject has not been set yet. Open the Subject step, then detect it from text or choose it manually.'));
      return;
    }

    setError('');
    requestProcessing('age');
  }, [requestProcessing, selectedBook, setError, t]);

  const onIdentifyChapters = useCallback((): void => {
    if (!selectedBook) {
      return;
    }

    setError('');
    setIdentifyChaptersEstimate(undefined);
    setIsIdentifyChaptersConfirmationOpen(true);
  }, [selectedBook, setError]);

  useEffect(() => {
    if (!isIdentifyChaptersConfirmationOpen || !selectedBook) {
      return;
    }

    let active = true;

    const calculate = async (): Promise<void> => {
      const pages = await getBookPages(selectedBook.id);
      const compactPages = pages.map(({ mathpixHeadings, pageMMD = '', pageNumber }) => `Page ${pageNumber}\n${(mathpixHeadings ?? []).map(({ text, type }) => `[${type}] ${text}`).join(' | ')}\n${pageMMD.replace(/\s+/g, ' ').slice(0, 650)}`);
      const windowSize = 36;
      const overlap = 3;
      const step = windowSize - overlap;
      const requests: string[] = [];

      for (let start = 0; start < compactPages.length; start += step) {
        requests.push(compactPages.slice(start, start + windowSize).join('\n\n').padEnd(compactPages.slice(start, start + windowSize).join('\n\n').length + 1_500));

        if (start + windowSize >= compactPages.length) {
          break;
        }
      }

      requests.push(compactPages.filter((_, index) => (pages[index]?.mathpixHeadings?.length ?? 0) > 0).join('\n').padEnd(2_000));

      if (active) {
        setIdentifyChaptersEstimate(estimateAiInput(generateAllConceptsModel, requests, Math.max(2_000, pages.length * 12)));
      }
    };

    calculate().catch(() => {
      if (active) {
        setError(t('Unable to estimate chapter identification cost.'));
      }
    });

    return () => {
      active = false;
    };
  }, [generateAllConceptsModel, isIdentifyChaptersConfirmationOpen, selectedBook, setError, t]);

  const closeIdentifyChaptersConfirmation = useCallback((): void => {
    setIsIdentifyChaptersConfirmationOpen(false);
    setPendingProcessingAction(undefined);
  }, [setPendingProcessingAction]);

  const confirmIdentifyChapters = useCallback((): void => {
    setIsIdentifyChaptersConfirmationOpen(false);

    if (!selectedBook) {
      return;
    }

    setPendingProcessingAction('chapters');

    resetBookProcessingStagesFrom(selectedBook.id, 'chapters').then((updatedBook) => {
      clearFixConceptsChapterStatuses(selectedBook.id);
      if (updatedBook) {
        setBooks((current) => current.map((book) => book.id === updatedBook.id ? updatedBook : book));
      }

      requestProcessing('chapters');
    }).catch(() => {
      setPendingProcessingAction(undefined);
      setError(t('Unable to reset the book processing stage.'));
    });
  }, [requestProcessing, selectedBook, setBooks, setError, setPendingProcessingAction, t]);

  return {
    closeIdentifyChaptersConfirmation,
    closeRecognizeConfirmation,
    confirmIdentifyChapters,
    confirmRecognize,
    identifyChaptersEstimate,
    isIdentifyChaptersConfirmationOpen,
    isRecognizeConfirmationOpen,
    onIdentifyChapters,
    onRecognize,
    onShowAge,
    onShowLanguage,
    onShowSubject,
    recognizePageCount
  };
}
