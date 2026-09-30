// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { TikzEditor as SharedTikzEditor } from '@slonigiraf/slonig-components';
import React, { useCallback, useRef, useState } from 'react';

import { Button, styled } from '@polkadot/react-components';

import TikzDisplay from './TikzDisplay.js';

interface Props {
  alt: string;
  editorTitle?: string;
  hasCompileError?: boolean;
  isEditorShownInitially?: boolean;
  onCompileStateChange?: (hasError: boolean) => Promise<void> | void;
  onEditorClose?: () => void;
  onSave?: (value: string) => Promise<void>;
  prompt?: string;
  showPreview?: boolean;
  value: string;
}

export default function TikzVisual ({ alt, editorTitle, hasCompileError = false, isEditorShownInitially = false, onCompileStateChange, onEditorClose, onSave, prompt, showPreview = true, value }: Props): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [rendered, setRendered] = useState(value);
  const [isDetailsShown, setIsDetailsShown] = useState(false);
  const [isVisualEditorShown, setIsVisualEditorShown] = useState(isEditorShownInitially);
  const [message, setMessage] = useState('');
  const editStartValueRef = useRef(draft);

  const saveFromEditor = useCallback(async (nextValue: string): Promise<void> => {
    if (!onSave) {
      return;
    }

    setMessage('');
    await onSave(nextValue);
    setDraft(nextValue);
    setRendered(nextValue);
    editStartValueRef.current = nextValue;
  }, [onSave]);

  const toggleDetails = useCallback((): void => {
    setIsDetailsShown((shown) => !shown);
  }, []);
  const openVisualEditor = useCallback((): void => {
    editStartValueRef.current = draft;
    setIsVisualEditorShown(true);
    setMessage('');
  }, [draft]);
  const updateEditorDraft = useCallback((nextValue: string): void => {
    setDraft(nextValue);
    setRendered(nextValue);
    setMessage('');
  }, []);
  const cancelVisualEditor = useCallback((): void => {
    const original = editStartValueRef.current;

    setDraft(original);
    setRendered(original);
    setMessage('');
    setIsVisualEditorShown(false);
    onEditorClose?.();
  }, [onEditorClose]);
  const finishVisualEditor = useCallback((): void => {
    setIsVisualEditorShown(false);
    setMessage('Saved.');
    onEditorClose?.();
  }, [onEditorClose]);

  return <TikzVisualContainer>
    {showPreview && <TikzDisplay
      alt={`${alt} TikZ preview`}
      hasCompileError={hasCompileError && rendered === value}
      onCompileStateChange={rendered === value ? onCompileStateChange : undefined}
      value={rendered}
    />}
    {showPreview && <Button.Group>
      {onSave && <Button
        icon='edit'
        isDisabled={!draft.trim()}
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
    {isVisualEditorShown && onSave && <SharedTikzEditor
      ariaLabel={`${alt} visual TikZ editor`}
      onCancel={cancelVisualEditor}
      onChange={updateEditorDraft}
      onSave={saveFromEditor}
      onSaved={finishVisualEditor}
      title={editorTitle ?? `Edit ${alt}`}
      value={draft}
    />}
    {showPreview && isDetailsShown && prompt?.trim() && <PromptBlock>
      <strong>{alt} visual prompt</strong>
      <div>{prompt}</div>
    </PromptBlock>}
  </TikzVisualContainer>;
}

const TikzVisualContainer = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  max-width: 72rem;
  width: 100%;
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
