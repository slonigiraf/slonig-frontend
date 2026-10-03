// Copyright 2017-2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import { Button, styled } from '@polkadot/react-components';

interface Props {
  ariaLabel?: string;
  onCancel: () => void;
  onChange?: (value: string) => void;
  onSave: (value: string, svg: string) => Promise<void> | void;
  onSaved?: (value: string) => void;
  title: string;
  value: string;
}

interface TikzEditorMessage {
  event?: 'autosave' | 'change' | 'export' | 'init' | 'loaded' | 'save';
  source?: string;
  svg?: string;
  xml?: string;
}

interface PendingEditorSave {
  reject: (reason: Error) => void;
  resolve: (value: { source: string; svg: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

const EDITOR_SAVE_TIMEOUT_MS = 10_000;

const TIKZ_EDITOR_URL = 'https://texlyre.github.io/tikz-editor-embed-mirror/tikz-editor/index.html';
const TIKZ_EDITOR_ORIGIN = 'https://texlyre.github.io';

function parseEditorMessage (value: unknown): TikzEditorMessage | undefined {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as TikzEditorMessage;
    } catch {
      return undefined;
    }
  }

  return value && typeof value === 'object' ? value as TikzEditorMessage : undefined;
}

export default function TikzEditor ({ ariaLabel = 'TikZ editor', onCancel, onChange, onSave, onSaved, title, value }: Props): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const editorRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(value);
  const pendingEditorSaveRef = useRef<PendingEditorSave | undefined>(undefined);

  const sendToEditor = useCallback((payload: object): void => {
    editorRef.current?.contentWindow?.postMessage(JSON.stringify(payload), TIKZ_EDITOR_ORIGIN);
  }, []);

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSaving) {
        onCancel();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isSaving, onCancel]);

  const requestEditorSave = useCallback((): Promise<{ source: string; svg: string }> => {
    if (!editorRef.current?.contentWindow) {
      return Promise.reject(new Error('TikZ Editor is not ready.'));
    }

    const previous = pendingEditorSaveRef.current;

    if (previous) {
      clearTimeout(previous.timer);
      previous.reject(new Error('TikZ Editor save was superseded by another save request.'));
      pendingEditorSaveRef.current = undefined;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (pendingEditorSaveRef.current?.timer === timer) {
          pendingEditorSaveRef.current = undefined;
          reject(new Error('TikZ Editor save timed out.'));
        }
      }, EDITOR_SAVE_TIMEOUT_MS);

      pendingEditorSaveRef.current = { reject, resolve, timer };
      sendToEditor({ action: 'save' });
    });
  }, [sendToEditor]);

  useEffect(() => {
    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== TIKZ_EDITOR_ORIGIN || event.source !== editorRef.current?.contentWindow) {
        return;
      }

      const data = parseEditorMessage(event.data);

      if (data?.event === 'init') {
        sendToEditor({ action: 'load', autosave: 1, source: draftRef.current });
        return;
      }

      if ((data?.event === 'change' || data?.event === 'autosave') && typeof data.source === 'string') {
        draftRef.current = data.source;
        setDraft(data.source);
        setMessage('');
        onChange?.(data.source);
        return;
      }

      if (data?.event === 'save') {
        const source = typeof data.source === 'string' ? data.source : data.xml;
        const pending = pendingEditorSaveRef.current;

        if (typeof source !== 'string' || typeof data.svg !== 'string' || !data.svg.trim()) {
          if (pending) {
            clearTimeout(pending.timer);
            pendingEditorSaveRef.current = undefined;
            pending.reject(new Error('TikZ Editor did not return SVG with the save response.'));
          }
          return;
        }

        draftRef.current = source;
        setDraft(source);
        setMessage('');
        onChange?.(source);

        if (pending) {
          clearTimeout(pending.timer);
          pendingEditorSaveRef.current = undefined;
          pending.resolve({ source, svg: data.svg });
        }
      }
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [onChange, sendToEditor]);

  useEffect(() => () => {
    const pending = pendingEditorSaveRef.current;

    if (pending) {
      clearTimeout(pending.timer);
      pendingEditorSaveRef.current = undefined;
      pending.reject(new Error('TikZ Editor was closed before save completed.'));
    }
  }, []);

  const saveAndExit = useCallback(async (): Promise<void> => {
    setIsSaving(true);
    setMessage('');

    try {
      // Do not trust the most recent autosave/change event here: it can lag a
      // click on Save and exit. Ask the visible editor for its authoritative
      // source + the exact SVG that is on screen, then persist that pair.
      const saved = await requestEditorSave();
      const source = saved.source.trim();

      if (!source) {
        throw new Error('TikZ Editor returned empty source.');
      }

      await onSave(source, saved.svg);
      draftRef.current = source;
      setDraft(source);
      sendToEditor({ action: 'status', modified: false });
      onSaved?.(source);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save TikZ.');
    } finally {
      setIsSaving(false);
    }
  }, [onSave, onSaved, requestEditorSave, sendToEditor]);

  return createPortal(
    <EditorOverlay
      aria-label={ariaLabel}
      aria-modal='true'
      role='dialog'
    >
      <EditorHeader>
        <strong>{title}</strong>
        <EditorActions>
          {message && <EditorMessage>{message}</EditorMessage>}
          <Button
            icon='times'
            isDisabled={isSaving}
            label='Cancel'
            onClick={onCancel}
          />
          <Button
            icon='save'
            isDisabled={isSaving || !draft.trim()}
            label={isSaving ? 'Saving…' : 'Save and exit'}
            onClick={saveAndExit}
          />
        </EditorActions>
      </EditorHeader>
      <EditorBody>
        <iframe
          allow='clipboard-read; clipboard-write'
          ref={editorRef}
          src={TIKZ_EDITOR_URL}
          title={ariaLabel}
        />
      </EditorBody>
    </EditorOverlay>,
    document.body
  );
}

const EditorOverlay = styled.div`
  background: var(--bg-page, #fff);
  display: flex;
  flex-direction: column;
  height: 100vh;
  inset: 0;
  position: fixed;
  width: 100vw;
  z-index: 100000;
`;

const EditorHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid rgba(127, 127, 127, 0.3);
  display: flex;
  flex: 0 0 auto;
  gap: 1rem;
  justify-content: space-between;
  min-height: 3.5rem;
  padding: 0.5rem 0.75rem 0.5rem 1rem;
`;

const EditorActions = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;

  small { margin-right: 0.5rem; }
`;

const EditorBody = styled.div`
  flex: 1 1 auto;
  min-height: 0;
  overflow: hidden;

  iframe {
    border: 0;
    display: block;
    height: 100%;
    width: 100%;
  }
`;

const EditorMessage = styled.small`
  color: #b00020;
  display: block;
  line-height: 1.4;
`;
