// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, styled } from '@polkadot/react-components';
import TikzDisplay from './TikzDisplay.js';

interface Props {
  alt: string;
  onSave?: (value: string) => Promise<void>;
  prompt?: string;
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

export default function TikzVisual ({ alt, onSave, prompt, value }: Props): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [rendered, setRendered] = useState(value);
  const [isDetailsShown, setIsDetailsShown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVisualEditorShown, setIsVisualEditorShown] = useState(false);
  const [message, setMessage] = useState('');
  const editorRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(draft);

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
      if (event.key === 'Escape') {
        setIsVisualEditorShown(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isVisualEditorShown]);

  const sendToEditor = useCallback((payload: object): void => {
    editorRef.current?.contentWindow?.postMessage(JSON.stringify(payload), TIKZ_EDITOR_ORIGIN);
  }, []);

  const saveValue = useCallback((source: string): void => {
    if (!onSave) {
      return;
    }

    const nextValue = source.trim();

    setIsSaving(true);
    setMessage('');
    onSave(nextValue)
      .then(() => {
        setDraft(nextValue);
        setRendered(nextValue);
        sendToEditor({ action: 'status', modified: false });
        setMessage('Saved.');
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to save TikZ.'))
      .finally(() => setIsSaving(false));
  }, [onSave, sendToEditor]);

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
        setDraft(data.source);
        setRendered(data.source);
        setMessage('');
        return;
      }

      if (data.event === 'save' && typeof data.source === 'string') {
        setDraft(data.source);
        setRendered(data.source);
        saveValue(data.source);
      }
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [isVisualEditorShown, saveValue, sendToEditor]);

  const toggleDetails = useCallback((): void => {
    setIsDetailsShown((shown) => !shown);
  }, []);
  const openVisualEditor = useCallback((): void => {
    setIsVisualEditorShown(true);
    setMessage('');
  }, []);
  const closeVisualEditor = useCallback((): void => {
    setIsVisualEditorShown(false);
  }, []);
  const save = useCallback((): void => {
    saveValue(draft);
  }, [draft, saveValue]);

  return <TikzEditor>
    <TikzDisplay alt={`${alt} TikZ preview`} value={rendered} />
    <Button.Group>
      {onSave && <Button
        icon='edit'
        isDisabled={isSaving || !draft.trim()}
        label='Edit visually'
        onClick={openVisualEditor}
      />}
      {prompt?.trim() && <Button
        icon={isDetailsShown ? 'eye-slash' : 'eye'}
        label={isDetailsShown ? 'Hide visual prompt' : 'Show visual prompt'}
        onClick={toggleDetails}
      />}
      {onSave && <Button
        icon='save'
        isDisabled={isSaving || !draft.trim()}
        label={isSaving ? 'Saving…' : 'Save TikZ'}
        onClick={save}
      />}
    </Button.Group>
    {message && <EditorMessage>{message}</EditorMessage>}
    {isVisualEditorShown && createPortal(
      <VisualEditorOverlay role='dialog' aria-label={`${alt} visual TikZ editor`} aria-modal='true'>
        <VisualEditorHeader>
          <strong>Edit {alt}</strong>
          <Button
            icon='times'
            label='Close'
            onClick={closeVisualEditor}
          />
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
    {isDetailsShown && prompt?.trim() && <PromptBlock>
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
