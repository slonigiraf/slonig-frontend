// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
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

  const render = useCallback((): void => {
    setRendered(draft);
    setMessage('');
  }, [draft]);
  const toggleDetails = useCallback((): void => {
    setIsDetailsShown((shown) => !shown);
  }, []);
  const toggleVisualEditor = useCallback((): void => {
    setIsVisualEditorShown((shown) => !shown);
    setMessage('');
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
        label={isVisualEditorShown ? 'Close visual editor' : 'Edit visually'}
        onClick={toggleVisualEditor}
      />}
      <Button
        icon={isDetailsShown ? 'eye-slash' : 'eye'}
        label={isDetailsShown ? 'Hide visual details' : 'Show visual details'}
        onClick={toggleDetails}
      />
      {onSave && <Button
        icon='save'
        isDisabled={isSaving || !draft.trim()}
        label={isSaving ? 'Saving…' : 'Save TikZ'}
        onClick={save}
      />}
    </Button.Group>
    {message && <EditorMessage>{message}</EditorMessage>}
    {isVisualEditorShown && <VisualEditorPanel>
      <iframe
        allow='clipboard-read; clipboard-write'
        ref={editorRef}
        src={TIKZ_EDITOR_URL}
        title={`${alt} visual TikZ editor`}
      />
    </VisualEditorPanel>}
    {isDetailsShown && <>
      {prompt?.trim() && <PromptBlock>
        <strong>{alt} visual prompt</strong>
        <div>{prompt}</div>
      </PromptBlock>}
      <strong>{alt} TikZ</strong>
      <textarea
        aria-label={`${alt} TikZ source`}
        onChange={(event) => setDraft(event.target.value)}
        rows={8}
        spellCheck={false}
        value={draft}
      />
      <Button.Group>
        <Button
          icon='eye'
          label='Render'
          onClick={render}
        />
      </Button.Group>
    </>}
  </TikzEditor>;
}

const TikzEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  max-width: 72rem;
  width: 100%;

  textarea {
    box-sizing: border-box;
    font-family: monospace;
    font-size: 0.9rem;
    min-height: 9rem;
    resize: vertical;
    width: 100%;
  }
`;

const VisualEditorPanel = styled.div`
  border: 1px solid rgba(127, 127, 127, 0.3);
  border-radius: 0.5rem;
  height: min(70vh, 52rem);
  min-height: 32rem;
  overflow: hidden;
  width: 100%;

  iframe {
    border: 0;
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
