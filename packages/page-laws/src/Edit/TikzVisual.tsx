// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useState } from 'react';
import { Button, styled } from '@polkadot/react-components';
import TikzDisplay from './TikzDisplay.js';

interface Props {
  alt: string;
  onSave?: (value: string) => Promise<void>;
  prompt?: string;
  value: string;
}

export default function TikzVisual ({ alt, onSave, prompt, value }: Props): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [rendered, setRendered] = useState(value);
  const [isDetailsShown, setIsDetailsShown] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');

  const render = useCallback((): void => {
    setRendered(draft);
    setMessage('');
  }, [draft]);
  const toggleDetails = useCallback((): void => {
    setIsDetailsShown((shown) => !shown);
  }, []);

  const save = useCallback((): void => {
    if (!onSave) {
      return;
    }

    setIsSaving(true);
    setMessage('');
    onSave(draft.trim())
      .then(() => {
        setRendered(draft.trim());
        setMessage('Saved.');
      })
      .catch((error) => setMessage(error instanceof Error ? error.message : 'Unable to save TikZ.'))
      .finally(() => setIsSaving(false));
  }, [draft, onSave]);

  return <TikzEditor>
    <TikzDisplay alt={`${alt} TikZ preview`} value={rendered} />
    <Button
      icon={isDetailsShown ? 'eye-slash' : 'eye'}
      label={isDetailsShown ? 'Hide visual details' : 'Show visual details'}
      onClick={toggleDetails}
    />
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
        {onSave && <Button
          icon='save'
          isDisabled={isSaving || !draft.trim()}
          label={isSaving ? 'Saving…' : 'Save TikZ'}
          onClick={save}
        />}
      </Button.Group>
      {message && <small>{message}</small>}
    </>}
  </TikzEditor>;
}

const TikzEditor = styled.div`
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  max-width: 46rem;
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
