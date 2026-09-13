// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useMemo, useState } from 'react';
import { Button, styled } from '@polkadot/react-components';

interface Props {
  alt: string;
  onSave?: (value: string) => Promise<void>;
  value: string;
}

export function isTikzCode (value: string): boolean {
  const trimmed = value.trim();

  return /\\begin\s*\{tikzpicture\}/.test(trimmed) && /\\end\s*\{tikzpicture\}/.test(trimmed);
}

function escapeHtml (value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function tikzDocument (value: string, alt: string): string {
  const safeTikz = escapeHtml(value);
  const safeAlt = escapeHtml(alt);

  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="https://tikzjax.com/v1/fonts.css"><style>html,body{margin:0;padding:0;background:transparent}body{display:flex;align-items:center;justify-content:center;min-height:160px;padding:12px;box-sizing:border-box}svg{max-width:100%;height:auto}</style><script src="https://tikzjax.com/v1/tikzjax.js"></script></head><body><script type="text/tikz" data-aria-label="${safeAlt}">${safeTikz}</script></body></html>`;
}

export default function TikzVisual ({ alt, onSave, value }: Props): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [rendered, setRendered] = useState(value);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState('');
  const preview = useMemo(() => tikzDocument(rendered, alt), [alt, rendered]);

  const render = useCallback((): void => {
    setRendered(draft);
    setMessage('');
  }, [draft]);

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
    <PreviewFrame
      key={rendered}
      srcDoc={preview}
      title={`${alt} TikZ preview`}
    />
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

const PreviewFrame = styled.iframe`
  background: white;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 0.35rem;
  box-sizing: border-box;
  min-height: 220px;
  width: 100%;
`;
