// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Book, BookPage, BookStageSpendKey } from '@slonigiraf/db';
import { getSetting, SettingKey, updateBookFieldsAndStages } from '@slonigiraf/db';
import type { Dispatch, SetStateAction } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { estimateAiInput } from '../book/processing/aiEstimate.js';
import { getBookAgeSamplePageNumbers, MAX_BOOK_LEARNER_AGE, MIN_BOOK_LEARNER_AGE, normalizeBookAge, parseDetectedBookAge } from '../book/processing/metadata/bookAge.js';
import { getMiddleBookPageNumbers, normalizeLanguageCode, parseDetectedBookLanguage } from '../book/processing/metadata/bookLanguage.js';
import { automaticBookSubjectForLanguage, normalizeBookSubject, parseDetectedBookSubject } from '../book/processing/metadata/bookSubject.js';
import { DEFAULT_PROCESSING_MODEL } from '../book/processing/config.js';
import { BOOK_AGE_DETECTION_PROMPT, BOOK_LANGUAGE_DETECTION_PROMPT, BOOK_SUBJECT_DETECTION_PROMPT } from '../book/prompts/metadata.js';
import { openRouterRequestGate } from '../../openrouter/concurrency.js';
import { reportOpenRouterCost } from '../../openrouter/cost.js';
import { createOpenRouterClient } from './BookReaderProcessing.js';
import type { ReaderPane } from './BookReaderUtils.js';

interface UseBookMetadataControllerOptions {
  addAgeCost: (costUsd: number) => void;
  addLanguageCost: (costUsd: number) => void;
  addSubjectCost: (costUsd: number) => void;
  autoRunAll: boolean;
  book: Book;
  currentReaderProcessingSignal: () => AbortSignal;
  onBookChange: (book: Book) => void;
  pages: Map<number, BookPage>;
  revealPane: (pane: ReaderPane) => void;
  setError: Dispatch<SetStateAction<string>>;
  setOpenRouterSpent: Dispatch<SetStateAction<number>>;
  totalPages: number;
}

export function useBookMetadataController ({
  addAgeCost,
  addLanguageCost,
  addSubjectCost,
  autoRunAll,
  book,
  currentReaderProcessingSignal,
  onBookChange,
  pages,
  revealPane,
  setError,
  setOpenRouterSpent,
  totalPages
}: UseBookMetadataControllerOptions) {
  const [isDetectingBookLanguage, setIsDetectingBookLanguage] = useState(false);
  const [isLanguageDetectionConfirmationOpen, setIsLanguageDetectionConfirmationOpen] = useState(false);
  const [confirmedProcessingStage, setConfirmedProcessingStage] = useState<BookStageSpendKey>();
  const [isDetectingBookSubject, setIsDetectingBookSubject] = useState(false);
  const [isDetectingBookAge, setIsDetectingBookAge] = useState(false);
  const [isSubjectDetectionConfirmationOpen, setIsSubjectDetectionConfirmationOpen] = useState(false);
  const [isAgeDetectionConfirmationOpen, setIsAgeDetectionConfirmationOpen] = useState(false);
  const [selectedLanguageModel, setSelectedLanguageModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [selectedSubjectModel, setSelectedSubjectModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [selectedAgeModel, setSelectedAgeModel] = useState(DEFAULT_PROCESSING_MODEL);
  const [ageInput, setAgeInput] = useState(book.age === undefined ? '' : String(book.age));
  const isDetectingBookLanguageRef = useRef(false);
  const isDetectingBookSubjectRef = useRef(false);
  const isDetectingBookAgeRef = useRef(false);

  useEffect((): void => {
    setAgeInput(book.age === undefined ? '' : String(book.age));
  }, [book.age]);

  const languageDetectionEstimate = useMemo(() => {
    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = pages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      return 'Recognition text is incomplete; language detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedLanguageModel, [BOOK_LANGUAGE_DETECTION_PROMPT(pageTexts)], 32);
  }, [pages, selectedLanguageModel, totalPages]);

  const subjectDetectionEstimate = useMemo(() => {
    if (automaticBookSubjectForLanguage(book.language)) {
      return 'Non-English books are classified as na automatically. No OpenRouter request or model cost is needed.';
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = pages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      return 'Recognition text is incomplete; subject detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedSubjectModel, [BOOK_SUBJECT_DETECTION_PROMPT(book.language ?? 'unknown', pageTexts)], 64);
  }, [book.language, pages, selectedSubjectModel, totalPages]);

  const ageSamplePageNumbers = useMemo(() => getBookAgeSamplePageNumbers(totalPages, Array.from(pages.values()).flatMap(({ pageMMD, pageNumber }) => pageMMD?.trim() ? [pageNumber] : [])), [pages, totalPages]);
  const ageSamplePageTexts = useMemo(() => ageSamplePageNumbers.flatMap((samplePageNumber) => {
    const text = pages.get(samplePageNumber)?.pageMMD?.trim();

    return text ? [{ pageNumber: samplePageNumber, text }] : [];
  }), [ageSamplePageNumbers, pages]);
  const ageDetectionEstimate = useMemo(() => {
    if (!ageSamplePageNumbers.length || ageSamplePageNumbers.length !== Math.min(3, totalPages) || ageSamplePageTexts.length !== ageSamplePageNumbers.length) {
      return 'Representative recognition text is incomplete; age detection cannot be estimated yet.';
    }

    return estimateAiInput(selectedAgeModel, [BOOK_AGE_DETECTION_PROMPT(book.language ?? 'unknown', book.subject ?? 'unknown', ageSamplePageTexts)], 32);
  }, [ageSamplePageNumbers, ageSamplePageTexts, book.language, book.subject, selectedAgeModel, totalPages]);

  const isMmdConversionComplete = useMemo((): boolean => {
    if (!totalPages) {
      return false;
    }

    return Array.from({ length: totalPages }, (_, index) => pages.get(index + 1)?.pageMMD !== undefined).every(Boolean);
  }, [pages, totalPages]);

  const detectAndStoreBookLanguage = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.language) || isDetectingBookLanguageRef.current) {
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = recognizedPages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      if (force) {
        throw new Error('The middle recognized pages do not contain enough text to detect a language. Choose the language manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or choose the language manually.');
      }

      return;
    }

    isDetectingBookLanguageRef.current = true;
    setIsDetectingBookLanguage(true);

    try {
      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_LANGUAGE_DETECTION_PROMPT(pageTexts), role: 'user' }],
        model: autoRunAll ? DEFAULT_PROCESSING_MODEL : selectedLanguageModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addLanguageCost);

      const language = parseDetectedBookLanguage(response.choices[0].message?.content?.trim() ?? '');
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      const changes: Partial<Pick<Book, 'age' | 'language' | 'subject'>> = { language };

      if (languageChanged) {
        changes.age = undefined;
        changes.subject = automaticSubject;
      } else if (automaticSubject) {
        changes.subject = automaticSubject;
      }

      const updatedBook = await updateBookFieldsAndStages(book.id, changes, {
        complete: automaticSubject ? ['language', 'subject'] : ['language'],
        ...(languageChanged ? { resetFrom: 'language' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('language');
    } finally {
      isDetectingBookLanguageRef.current = false;
      setIsDetectingBookLanguage(false);
    }
  }, [currentReaderProcessingSignal, addLanguageCost, autoRunAll, book, onBookChange, revealPane, selectedLanguageModel, totalPages]);

  const saveManualBookLanguage = useCallback(async (languageValue: string): Promise<void> => {
    const language = normalizeLanguageCode(languageValue);

    if (!language) {
      setError('Choose a valid ISO 639-1 book language.');
      return;
    }

    setError('');

    try {
      const languageChanged = normalizeLanguageCode(book.language) !== language;
      const automaticSubject = automaticBookSubjectForLanguage(language);
      const changes: Partial<Pick<Book, 'age' | 'language' | 'subject'>> = { language };

      if (languageChanged) {
        changes.age = undefined;
        changes.subject = automaticSubject;
      } else if (automaticSubject) {
        changes.subject = automaticSubject;
      }

      const updatedBook = await updateBookFieldsAndStages(book.id, changes, {
        complete: automaticSubject ? ['language', 'subject'] : ['language'],
        ...(languageChanged ? { resetFrom: 'language' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('language');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book language.');
    }
  }, [book, onBookChange, revealPane, setError]);

  const redetectBookLanguage = useCallback(async (): Promise<void> => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book language.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookLanguage(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine the book language from MMD text.');
    }
  }, [detectAndStoreBookLanguage, isMmdConversionComplete, pages, setError, setOpenRouterSpent]);

  const openLanguageDetectionConfirmation = useCallback((): void => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book language.');
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const hasAllMiddleText = middlePageNumbers.length > 0 && middlePageNumbers.every((middlePageNumber) => Boolean(pages.get(middlePageNumber)?.pageMMD?.trim()));

    if (!hasAllMiddleText) {
      setError('The middle recognized pages do not contain enough text to detect a language. Choose the language manually.');
      return;
    }

    setError('');
    setIsLanguageDetectionConfirmationOpen(true);
  }, [isMmdConversionComplete, pages, setError, totalPages]);

  const closeLanguageDetectionConfirmation = useCallback((): void => {
    setIsLanguageDetectionConfirmationOpen(false);
  }, []);

  const confirmLanguageDetection = useCallback((): void => {
    setIsLanguageDetectionConfirmationOpen(false);
    setConfirmedProcessingStage('language');
    redetectBookLanguage()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'language' ? undefined : current));
  }, [redetectBookLanguage]);

  const detectAndStoreBookSubject = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.subject) || isDetectingBookSubjectRef.current) {
      return;
    }

    if (!book.language) {
      if (force) {
        throw new Error('Set the book language before detecting its subject.');
      }

      return;
    }

    const automaticSubject = automaticBookSubjectForLanguage(book.language);

    if (automaticSubject) {
      const subjectChanged = book.subject !== automaticSubject;
      const updatedBook = await updateBookFieldsAndStages(book.id, {
        ...(subjectChanged ? { age: undefined } : {}),
        subject: automaticSubject
      }, {
        complete: ['subject'],
        ...(subjectChanged ? { resetFrom: 'subject' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('subject');
      return;
    }

    const middlePageNumbers = getMiddleBookPageNumbers(totalPages);
    const pageTexts = middlePageNumbers.flatMap((middlePageNumber) => {
      const text = recognizedPages.get(middlePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: middlePageNumber, text }] : [];
    });

    if (!middlePageNumbers.length || pageTexts.length !== middlePageNumbers.length) {
      if (force) {
        throw new Error('The middle recognized pages do not contain enough text to detect a subject. Choose the subject manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or choose the subject manually.');
      }

      return;
    }

    isDetectingBookSubjectRef.current = true;
    setIsDetectingBookSubject(true);

    try {
      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_SUBJECT_DETECTION_PROMPT(book.language ?? 'unknown', pageTexts), role: 'user' }],
        model: autoRunAll ? DEFAULT_PROCESSING_MODEL : selectedSubjectModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addSubjectCost);

      const subject = parseDetectedBookSubject(response.choices[0].message?.content?.trim() ?? '');
      const subjectChanged = book.subject !== subject;
      const updatedBook = await updateBookFieldsAndStages(book.id, {
        ...(subjectChanged ? { age: undefined } : {}),
        subject
      }, {
        complete: ['subject'],
        ...(subjectChanged ? { resetFrom: 'subject' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('subject');
    } finally {
      isDetectingBookSubjectRef.current = false;
      setIsDetectingBookSubject(false);
    }
  }, [currentReaderProcessingSignal, addSubjectCost, autoRunAll, book, onBookChange, revealPane, selectedSubjectModel, totalPages]);

  const saveManualBookSubject = useCallback(async (subjectValue: string): Promise<void> => {
    const subject = normalizeBookSubject(subjectValue);

    if (!subject) {
      setError('Choose a valid book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before setting its subject.');
      return;
    }

    setError('');

    try {
      const subjectChanged = book.subject !== subject;
      const updatedBook = await updateBookFieldsAndStages(book.id, {
        ...(subjectChanged ? { age: undefined } : {}),
        subject
      }, {
        complete: ['subject'],
        ...(subjectChanged ? { resetFrom: 'subject' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('subject');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the book subject.');
    }
  }, [book, onBookChange, revealPane, setError]);

  const redetectBookSubject = useCallback(async (): Promise<void> => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before detecting its subject.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookSubject(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine the book subject from MMD text.');
    }
  }, [book.language, detectAndStoreBookSubject, isMmdConversionComplete, pages, setError, setOpenRouterSpent]);

  const openSubjectDetectionConfirmation = useCallback((): void => {
    if (!isMmdConversionComplete) {
      setError('Recognize every page before detecting the book subject.');
      return;
    }

    if (!book.language) {
      setError('Set the book language before detecting its subject.');
      return;
    }

    setError('');
    setIsSubjectDetectionConfirmationOpen(true);
  }, [book.language, isMmdConversionComplete, setError]);

  const closeSubjectDetectionConfirmation = useCallback((): void => {
    setIsSubjectDetectionConfirmationOpen(false);
  }, []);

  const confirmSubjectDetection = useCallback((): void => {
    setIsSubjectDetectionConfirmationOpen(false);
    setConfirmedProcessingStage('subject');
    redetectBookSubject()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'subject' ? undefined : current));
  }, [redetectBookSubject]);

  const detectAndStoreBookAge = useCallback(async (recognizedPages: Map<number, BookPage>, force = false): Promise<void> => {
    if ((!force && book.age !== undefined) || isDetectingBookAgeRef.current) {
      return;
    }

    if (!book.language || !book.subject) {
      if (force) {
        throw new Error('Set the book language and subject before detecting learner age.');
      }

      return;
    }

    const samplePageNumbers = getBookAgeSamplePageNumbers(totalPages, Array.from(recognizedPages.values()).flatMap(({ pageMMD, pageNumber }) => pageMMD?.trim() ? [pageNumber] : []));
    const pageTexts = samplePageNumbers.flatMap((samplePageNumber) => {
      const text = recognizedPages.get(samplePageNumber)?.pageMMD?.trim();

      return text ? [{ pageNumber: samplePageNumber, text }] : [];
    });

    if (!samplePageNumbers.length || samplePageNumbers.length !== Math.min(3, totalPages) || pageTexts.length !== samplePageNumbers.length) {
      if (force) {
        throw new Error('The representative recognized pages do not contain enough text to detect learner age. Enter the age manually.');
      }

      return;
    }

    const key = await getSetting(SettingKey.OPENROUTER_TOKEN);

    if (!key) {
      if (force) {
        throw new Error('No OpenRouter token found. Add it in Settings or enter the learner age manually.');
      }

      return;
    }

    isDetectingBookAgeRef.current = true;
    setIsDetectingBookAge(true);

    try {
      const client = createOpenRouterClient(key, currentReaderProcessingSignal());
      const response = await openRouterRequestGate.run(() => client.chat.completions.create({
        messages: [{ content: BOOK_AGE_DETECTION_PROMPT(book.language ?? 'unknown', book.subject ?? 'unknown', pageTexts), role: 'user' }],
        model: autoRunAll ? DEFAULT_PROCESSING_MODEL : selectedAgeModel,
        response_format: { type: 'json_object' }
      }));

      reportOpenRouterCost(response, addAgeCost);

      const age = parseDetectedBookAge(response.choices[0].message?.content?.trim() ?? '');
      const ageChanged = book.age !== age;
      const updatedBook = await updateBookFieldsAndStages(book.id, { age }, {
        complete: ['age'],
        ...(ageChanged ? { resetFrom: 'age' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('age');
    } finally {
      isDetectingBookAgeRef.current = false;
      setIsDetectingBookAge(false);
    }
  }, [currentReaderProcessingSignal, addAgeCost, autoRunAll, book, onBookChange, revealPane, selectedAgeModel, totalPages]);

  const saveManualBookAge = useCallback(async (): Promise<void> => {
    const age = normalizeBookAge(ageInput);

    if (age === undefined) {
      setError(`Enter a whole-number learner age from ${MIN_BOOK_LEARNER_AGE} through ${MAX_BOOK_LEARNER_AGE}.`);
      return;
    }

    setError('');

    try {
      const ageChanged = book.age !== age;
      const updatedBook = await updateBookFieldsAndStages(book.id, { age }, {
        complete: ['age'],
        ...(ageChanged ? { resetFrom: 'age' as const } : {})
      });

      if (!updatedBook) {
        throw new Error('Book not found.');
      }

      onBookChange(updatedBook);
      revealPane('age');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to save the learner age.');
    }
  }, [ageInput, book, onBookChange, revealPane, setError]);

  const redetectBookAge = useCallback(async (): Promise<void> => {
    if (!book.language || !book.subject) {
      setError('Set the book language and subject before detecting learner age.');
      return;
    }

    setError('');
    setOpenRouterSpent(0);

    try {
      await detectAndStoreBookAge(pages, true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to determine learner age from the representative text pages.');
    }
  }, [book.language, book.subject, detectAndStoreBookAge, pages, setError, setOpenRouterSpent]);

  const openAgeDetectionConfirmation = useCallback((): void => {
    if (!book.language || !book.subject) {
      setError('Set the book language and subject before detecting learner age.');
      return;
    }

    const hasAllSampleText = ageSamplePageNumbers.length === Math.min(3, totalPages) && ageSamplePageTexts.length === ageSamplePageNumbers.length;

    if (!hasAllSampleText) {
      setError('Recognize the representative sample pages before detecting learner age. You can still enter the age manually.');
      return;
    }

    setError('');
    setIsAgeDetectionConfirmationOpen(true);
  }, [ageSamplePageNumbers, ageSamplePageTexts, book.language, book.subject, setError, totalPages]);

  const closeAgeDetectionConfirmation = useCallback((): void => {
    setIsAgeDetectionConfirmationOpen(false);
  }, []);

  const confirmAgeDetection = useCallback((): void => {
    setIsAgeDetectionConfirmationOpen(false);
    setConfirmedProcessingStage('age');
    redetectBookAge()
      .catch(console.error)
      .finally(() => setConfirmedProcessingStage((current) => current === 'age' ? undefined : current));
  }, [redetectBookAge]);

  useEffect((): void => {
    if (!autoRunAll) {
      return;
    }

    if (isLanguageDetectionConfirmationOpen) {
      confirmLanguageDetection();
    }

    if (isSubjectDetectionConfirmationOpen) {
      confirmSubjectDetection();
    }

    if (isAgeDetectionConfirmationOpen) {
      confirmAgeDetection();
    }
  }, [autoRunAll, confirmAgeDetection, confirmLanguageDetection, confirmSubjectDetection, isAgeDetectionConfirmationOpen, isLanguageDetectionConfirmationOpen, isSubjectDetectionConfirmationOpen]);

  return {
    ageDetectionEstimate,
    ageInput,
    ageSamplePageNumbers,
    ageSamplePageTexts,
    closeAgeDetectionConfirmation,
    closeLanguageDetectionConfirmation,
    closeSubjectDetectionConfirmation,
    confirmAgeDetection,
    confirmLanguageDetection,
    confirmSubjectDetection,
    confirmedProcessingStage,
    detectAndStoreBookAge,
    detectAndStoreBookLanguage,
    detectAndStoreBookSubject,
    isAgeDetectionConfirmationOpen,
    isDetectingBookAge,
    isDetectingBookAgeRef,
    isDetectingBookLanguage,
    isDetectingBookLanguageRef,
    isDetectingBookSubject,
    isDetectingBookSubjectRef,
    isLanguageDetectionConfirmationOpen,
    isMmdConversionComplete,
    isSubjectDetectionConfirmationOpen,
    languageDetectionEstimate,
    openAgeDetectionConfirmation,
    openLanguageDetectionConfirmation,
    openSubjectDetectionConfirmation,
    redetectBookAge,
    redetectBookLanguage,
    redetectBookSubject,
    saveManualBookAge,
    saveManualBookLanguage,
    saveManualBookSubject,
    selectedAgeModel,
    selectedLanguageModel,
    selectedSubjectModel,
    setAgeInput,
    setConfirmedProcessingStage,
    setIsAgeDetectionConfirmationOpen,
    setIsDetectingBookAge,
    setIsDetectingBookLanguage,
    setIsDetectingBookSubject,
    setIsLanguageDetectionConfirmationOpen,
    setIsSubjectDetectionConfirmationOpen,
    setSelectedAgeModel,
    setSelectedLanguageModel,
    setSelectedSubjectModel,
    subjectDetectionEstimate
  } as const;
}
