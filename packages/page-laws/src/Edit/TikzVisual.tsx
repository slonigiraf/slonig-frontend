// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, styled } from '@polkadot/react-components';
import TikzDisplay from './TikzDisplay.js';

interface Props {
  alt: string;
  editorTitle?: string;
  hasCompileError?: boolean;
  isEditorShownInitially?: boolean;
  onCompileError?: () => Promise<void> | void;
  onEditorClose?: () => void;
  onSave?: (value: string) => Promise<void>;
  prompt?: string;
  showPreview?: boolean;
  value: string;
}

const TIKZ_EDITOR_URL = 'https://texlyre.github.io/tikz-editor-embed-mirror/tikz-editor/index.html';
const TIKZ_EDITOR_ORIGIN = 'https://texlyre.github.io';

interface TikzEditorMessage {
  event?: 'autosave' | 'change' | 'export' | 'init' | 'loaded' | 'save';
  source?: string;
}

function parseEditorMessage (value: unknown): TikzEditorMessage | undefined {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value) as TikzEditorMessage;
    } catch {
      return undefined;
    }
  }

  if (value && typeof value === 'object') {
    return value as TikzEditorMessage;
  }

  return undefined;
}

export default function TikzVisual ({ alt, editorTitle, hasCompileError = false, isEditorShownInitially = false, onCompileError, onEditorClose, onSave, prompt, showPreview = true, value }: Props): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [rendered, setRendered] = useState(value);
  const [isDetailsShown, setIsDetailsShown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVisualEditorShown, setIsVisualEditorShown] = useState(isEditorShownInitially);
  const [message, setMessage] = useState('');
  const editorRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(draft);
  const editStartValueRef = useRef(draft);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    if (!isVisualEditorShown) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape' && !isSaving) {
        const original = editStartValueRef.current;

        draftRef.current = original;
        setDraft(original);
        setRendered(original);
        setMessage('');
        setIsVisualEditorShown(false);
        onEditorClose?.();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isSaving, isVisualEditorShown, onEditorClose]);

  const sendToEditor = useCallback((payload: object): void => {
    editorRef.current?.contentWindow?.postMessage(JSON.stringify(payload), TIKZ_EDITOR_ORIGIN);
  }, []);

  const saveAndExit = useCallback(async (): Promise<void> => {
    if (!onSave) {
      return;
    }

    const nextValue = draftRef.current.trim();

    setIsSaving(true);
    setMessage('');

    try {
      await onSave(nextValue);
      draftRef.current = nextValue;
      setDraft(nextValue);
      setRendered(nextValue);
      editStartValueRef.current = nextValue;
      sendToEditor({ action: 'status', modified: false });
      setIsVisualEditorShown(false);
      setMessage('Saved.');
      onEditorClose?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save TikZ.');
    } finally {
      setIsSaving(false);
    }
  }, [onEditorClose, onSave, sendToEditor]);

  useEffect(() => {
    if (!isVisualEditorShown) {
      return undefined;
    }

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== TIKZ_EDITOR_ORIGIN || event.source !== editorRef.current?.contentWindow) {
        return;
      }

      const data = parseEditorMessage(event.data);

      if (!data?.event) {
        return;
      }

      if (data.event === 'init') {
        sendToEditor({ action: 'load', autosave: 1, source: draftRef.current });
        return;
      }

      if ((data.event === 'change' || data.event === 'autosave') && typeof data.source === 'string') {
        draftRef.current = data.source;
        setDraft(data.source);
        setRendered(data.source);
        setMessage('');
        return;
      }

      if (data.event === 'save' && typeof data.source === 'string') {
        draftRef.current = data.source;
        setDraft(data.source);
        setRendered(data.source);
        setMessage('');
      }
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [isVisualEditorShown, sendToEditor]);

  const toggleDetails = useCallback((): void => {
    setIsDetailsShown((shown) => !shown);
  }, []);
  const openVisualEditor = useCallback((): void => {
    editStartValueRef.current = draftRef.current;
    setIsVisualEditorShown(true);
    setMessage('');
  }, []);
  const cancelVisualEditor = useCallback((): void => {
    const original = editStartValueRef.current;

    draftRef.current = original;
    setDraft(original);
    setRendered(original);
    setMessage('');
    setIsVisualEditorShown(false);
    onEditorClose?.();
  }, [onEditorClose]);

  return <TikzEditor>
    {showPreview && <TikzDisplay
      alt={`${alt} TikZ preview`}
      hasCompileError={hasCompileError && rendered === value}
      onCompileError={rendered === value ? onCompileError : undefined}
      value={rendered}
    />}
    {showPreview && <Button.Group>
      {onSave && <Button
        icon='edit'
        isDisabled={isSaving || !draft.trim()}
        label='Edit'
        onClick={openVisualEditor}
      />}
      {prompt?.trim() && <Button
        icon={isDetailsShown ? 'eye-slash' : 'eye'}
        label={isDetailsShown ? 'Hide visual prompt' : 'Show visual prompt'}
        onClick={toggleDetails}
      />}
    </Button.Group>}
    {showPreview && !isVisualEditorShown && message && <EditorMessage>{message}</EditorMessage>}
    {isVisualEditorShown && createPortal(
      <VisualEditorOverlay role='dialog' aria-label={`${alt} visual TikZ editor`} aria-modal='true'>
        <VisualEditorHeader>
          <strong>{editorTitle ?? `Edit ${alt}`}</strong>
          <VisualEditorHeaderActions>
            {message && <EditorMessage>{message}</EditorMessage>}
            <Button
              icon='times'
              isDisabled={isSaving}
              label='Cancel'
              onClick={cancelVisualEditor}
            />
            <Button
              icon='save'
              isDisabled={isSaving || !draft.trim()}
              label={isSaving ? 'Saving…' : 'Save and exit'}
              onClick={saveAndExit}
            />
          </VisualEditorHeaderActions>
        </VisualEditorHeader>
        <VisualEditorBody>
          <iframe
            allow='clipboard-read; clipboard-write'
            ref={editorRef}
            src={TIKZ_EDITOR_URL}
            title={`${alt} visual TikZ editor`}
          />
        </VisualEditorBody>
      </VisualEditorOverlay>,
      document.body
    )}
    {showPreview && isDetailsShown && prompt?.trim() && <PromptBlock>
      <strong>{alt} visual prompt</strong>
      <div>{prompt}</div>
    </PromptBlock>}
  </TikzEditor>;
}

const TikzEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  max-width: 72rem;
  width: 100%;
`;

const VisualEditorOverlay = styled.div`
  background: var(--bg-page, #fff);
  display: flex;
  flex-direction: column;
  height: 100vh;
  inset: 0;
  position: fixed;
  width: 100vw;
  z-index: 100000;
`;

const VisualEditorHeader = styled.div`
  align-items: center;
  border-bottom: 1px solid rgba(127, 127, 127, 0.3);
  display: flex;
  flex: 0 0 auto;
  gap: 1rem;
  justify-content: space-between;
  min-height: 3.5rem;
  padding: 0.5rem 0.75rem 0.5rem 1rem;
`;

const VisualEditorHeaderActions = styled.div`
  align-items: center;
  display: flex;
  gap: 0.5rem;

  small {
    margin-right: 0.5rem;
  }
`;

const VisualEditorBody = styled.div`
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
  display: block;
  line-height: 1.4;
`;

const PromptBlock = styled.div`
  background: rgba(127, 127, 127, 0.08);
  border: 1px solid rgba(127, 127, 127, 0.22);
  border-radius: 0.35rem;
  padding: 0.65rem 0.75rem;

  strong {
    display: block;
    margin-bottom: 0.25rem;
  }
`;
