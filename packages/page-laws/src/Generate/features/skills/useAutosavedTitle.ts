// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useRef, useState } from 'react';

import { TitleSaveQueue } from './titleSaveQueue.js';

const AUTOSAVE_DELAY_MS = 650;

export type TitleSaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

interface Options {
  sourceTitle: string;
  normalize: (value: string) => string;
  save: (title: string) => Promise<void>;
  onError: (error: unknown) => void;
}

/** Autosave a controlled title input; never report success before storage confirms it. */
export function useAutosavedTitle ({ normalize, onError, save, sourceTitle }: Options): {
  acceptSavedTitle: (title: string) => void;
  flush: (normalizeInput?: boolean) => Promise<void>;
  onChange: (title: string) => void;
  status: TitleSaveStatus;
  title: string;
} {
  const [title, setTitle] = useState(() => normalize(sourceTitle));
  const [status, setStatus] = useState<TitleSaveStatus>('idle');
  const draftRef = useRef(title);
  const queueRef = useRef(new TitleSaveQueue(sourceTitle));
  const sourceRef = useRef(sourceTitle);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const versionRef = useRef(0);
  const mountedRef = useRef(true);
  const normalizeRef = useRef(normalize);
  const saveRef = useRef(save);
  const onErrorRef = useRef(onError);

  normalizeRef.current = normalize;
  saveRef.current = save;
  onErrorRef.current = onError;

  const enqueueDraft = useCallback(async (): Promise<void> => {
    const expected = normalizeRef.current(draftRef.current);
    const version = versionRef.current;

    if (!expected.trim()) {
      await queueRef.current.wait();

      return;
    }

    // Even an unchanged name must wait for any prior write in progress.
    if (mountedRef.current && expected !== queueRef.current.savedTitle) {
      setStatus('saving');
    }

    await queueRef.current.enqueue(expected, (next) => saveRef.current(next), (error) => onErrorRef.current(error));

    if (mountedRef.current && version === versionRef.current) {
      const wasSaved = queueRef.current.savedTitle === expected;

      if (wasSaved) {
        // Reflect the normalized persisted value, not a differently cased draft.
        draftRef.current = expected;
        setTitle(expected);
      }

      setStatus(wasSaved ? 'saved' : 'error');
    }
  }, []);

  const flush = useCallback((normalizeInput = false): Promise<void> => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;

    if (!draftRef.current.trim()) {
      // An empty title isn't a valid name. Restore the last confirmed value.
      if (normalizeInput) {
        draftRef.current = queueRef.current.savedTitle;
        setTitle(draftRef.current);
      }

      return queueRef.current.wait();
    }

    if (normalizeInput) {
      const normalized = normalizeRef.current(draftRef.current);

      draftRef.current = normalized;
      setTitle(normalized);
    }

    return enqueueDraft();
  }, [enqueueDraft]);

  const onChange = useCallback((next: string): void => {
    versionRef.current++;
    draftRef.current = next;
    setTitle(next);
    setStatus('pending');
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      timeoutRef.current = undefined;
      void enqueueDraft();
    }, AUTOSAVE_DELAY_MS);
  }, [enqueueDraft]);

  // External changes are applied only when no local unsaved edits are being made.
  useEffect((): void => {
    if (sourceRef.current === sourceTitle) {
      return;
    }

    sourceRef.current = sourceTitle;
    const currentDraft = normalizeRef.current(draftRef.current);
    const previousSaved = normalizeRef.current(queueRef.current.savedTitle);

    if (currentDraft === previousSaved || !draftRef.current.trim()) {
      queueRef.current.adoptSavedTitle(sourceTitle);
      draftRef.current = normalizeRef.current(sourceTitle);
      setTitle(draftRef.current);
    } else if (currentDraft === normalizeRef.current(sourceTitle)) {
      queueRef.current.adoptSavedTitle(sourceTitle);
    }
  }, [sourceTitle]);

  const acceptSavedTitle = useCallback((next: string): void => {
    versionRef.current++;
    clearTimeout(timeoutRef.current);
    timeoutRef.current = undefined;
    queueRef.current.adoptSavedTitle(next);
    draftRef.current = next;
    setTitle(next);
    setStatus('saved');
  }, []);

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;
      clearTimeout(timeoutRef.current);
      // React doesn't fire blur when leaving the Course tab. Commit the last
      // draft even when the editor is unmounted.
      void enqueueDraft();
    };
  }, [enqueueDraft]);

  return { acceptSavedTitle, flush, onChange, status, title };
}
