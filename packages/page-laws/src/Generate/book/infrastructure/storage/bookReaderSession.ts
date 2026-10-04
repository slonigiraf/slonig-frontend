// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { ReaderPane } from '../../../shared/types/bookWorkspace.js';

export const pageSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-page`;
export const recognitionAttemptSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-recognition-attempted`;
export const readerPaneSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-pane`;
export const readerMaximizedSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-maximized`;
export const exerciseChapterSessionKey = (bookId: number): string => `knowledge-upload-book-${bookId}-exercises-chapter`;

export function getSessionPage (bookId: number): number {
  try {
    const value = Number(sessionStorage.getItem(pageSessionKey(bookId)));

    return Number.isSafeInteger(value) && value > 0 ? value : 1;
  } catch {
    return 1;
  }
}

export function storeSessionPage (bookId: number, pageNumber: number): void {
  try {
    sessionStorage.setItem(pageSessionKey(bookId), String(pageNumber));
  } catch {
    // Session storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function getSessionRecognitionAttempted (bookId: number): boolean {
  try {
    return sessionStorage.getItem(recognitionAttemptSessionKey(bookId)) === 'true';
  } catch {
    return false;
  }
}

export function storeSessionRecognitionAttempted (bookId: number): void {
  try {
    sessionStorage.setItem(recognitionAttemptSessionKey(bookId), 'true');
  } catch {
    // Session storage may be unavailable in privacy-restricted browser contexts.
  }
}

export function getSessionExerciseChapter (bookId: number): number {
  try {
    const stored = Number(sessionStorage.getItem(exerciseChapterSessionKey(bookId)));

    return Number.isSafeInteger(stored) && stored >= 0 ? stored : 0;
  } catch {
    return 0;
  }
}

export function getSessionReaderMaximized (bookId: number): boolean {
  try {
    return sessionStorage.getItem(readerMaximizedSessionKey(bookId)) === 'true';
  } catch {
    return false;
  }
}

export function getSessionReaderPane (bookId: number): ReaderPane {
  try {
    const value = sessionStorage.getItem(readerPaneSessionKey(bookId));

    if (value === 'pdfText' || value === 'pdf') {
      return 'text';
    }

    return value === 'text' || value === 'language' || value === 'subject' || value === 'age' || value === 'chapters' || value === 'textConcepts' || value === 'standards' || value === 'embeddings' || value === 'conceptExercises' || value === 'preExercisesExercises' || value === 'skillsCourse' ? value : 'text';
  } catch {
    return 'text';
  }
}
