// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Icon, Modal, styled } from '@polkadot/react-components';
import TikzDisplay from './TikzDisplay.js';
import { TIKZ_EDITOR_ORIGIN, TIKZ_EDITOR_URL, cacheTikzEditorSvg, parseTikzEditorMessage } from './tikzEditorBridge.js';

interface Props {
  alt: string;
  editorTitle?: string;
  expandedPrompt?: React.ReactNode;
  hasCompileError?: boolean;
  isEditorShownInitially?: boolean;
  onCompileStateChange?: (hasError: boolean, renderedValue: string) => Promise<void> | void;
  onEditorClose?: () => void;
  onSave?: (value: string) => Promise<void>;
  prompt?: string;
  showPreview?: boolean;
  value: string;
}

interface PendingEditorSave {
  reject: (reason: Error) => void;
  resolve: (value: { source: string; svg: string }) => void;
  timer: ReturnType<typeof setTimeout>;
}

const EDITOR_SAVE_TIMEOUT_MS = 10_000;

export default function TikzVisual ({ alt, editorTitle, expandedPrompt, hasCompileError = false, isEditorShownInitially = false, onCompileStateChange, onEditorClose, onSave, prompt, showPreview = true, value }: Props): React.ReactElement {
  const [draft, setDraft] = useState(value);
  const [rendered, setRendered] = useState(value);
  const [isDetailsShown, setIsDetailsShown] = useState(false);
  const [isPreviewBig, setIsPreviewBig] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVisualEditorShown, setIsVisualEditorShown] = useState(isEditorShownInitially);
  const [message, setMessage] = useState('');
  const [recompileToken, setRecompileToken] = useState(0);
  const [previewScale, setPreviewScale] = useState(1);
  const [retrySource, setRetrySource] = useState<string | undefined>(undefined);
  const editorRef = useRef<HTMLIFrameElement>(null);
  const draftRef = useRef(draft);
  const editStartValueRef = useRef(draft);
  const retrySourceRef = useRef<string | undefined>(undefined);
  const pendingEditorSaveRef = useRef<PendingEditorSave | undefined>(undefined);
  const lastPinchDistanceRef = useRef(0);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  // Keep local preview state aligned with DB-driven prop refreshes, except while
  // the visual editor is open or an explicit Save/Exit retry is still settling.
  useEffect(() => {
    if (isVisualEditorShown || retrySourceRef.current) {
      return;
    }

    draftRef.current = value;
    setDraft(value);
    setRendered(value);
  }, [isVisualEditorShown, value]);

  // A successful retry can persist slightly before/after the parent Ability is
  // re-hydrated. Keep ignoring the stale `hasCompileError` prop until the parent
  // reflects that this exact source is no longer failed.
  useEffect(() => {
    if (retrySource && retrySource === value && !hasCompileError) {
      retrySourceRef.current = undefined;
      setRetrySource(undefined);
    }
  }, [hasCompileError, retrySource, value]);

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

  const saveAndExit = useCallback(async (): Promise<void> => {
    if (!onSave) {
      return;
    }

    setIsSaving(true);
    setMessage('');

    try {
      // Ask the already-visible editor to save first. Its documented save
      // response contains both the authoritative source and the SVG currently
      // shown by the editor. Cache that exact SVG before any parent refresh so
      // closing the editor never requires an immediate hidden re-render.
      const saved = await requestEditorSave();
      const nextValue = saved.source.trim();

      if (!nextValue) {
        throw new Error('TikZ Editor returned empty source.');
      }

      cacheTikzEditorSvg(nextValue, saved.svg);
      retrySourceRef.current = nextValue;
      setRetrySource(nextValue);

      await onSave(nextValue);
      draftRef.current = nextValue;
      setDraft(nextValue);
      setRendered(nextValue);
      setRecompileToken((token) => token + 1);
      editStartValueRef.current = nextValue;
      sendToEditor({ action: 'status', modified: false });
      setIsVisualEditorShown(false);
      setMessage('Saved.');
      onEditorClose?.();
    } catch (error) {
      retrySourceRef.current = undefined;
      setRetrySource(undefined);
      setMessage(error instanceof Error ? error.message : 'Unable to save TikZ.');
    } finally {
      setIsSaving(false);
    }
  }, [onEditorClose, onSave, requestEditorSave, sendToEditor]);


  useEffect(() => {
    if (!isVisualEditorShown) {
      return undefined;
    }

    const onMessage = (event: MessageEvent): void => {
      if (event.origin !== TIKZ_EDITOR_ORIGIN || event.source !== editorRef.current?.contentWindow) {
        return;
      }

      const data = parseTikzEditorMessage(event.data);

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

        if (data.event === 'autosave' && typeof data.svg === 'string' && data.svg.trim()) {
          try {
            cacheTikzEditorSvg(data.source, data.svg);
          } catch {
            // Keep editing even if an intermediate SVG is malformed. A formal
            // Save and exit request below will surface a useful error instead.
          }
        }

        return;
      }

      if (data.event === 'save') {
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

        try {
          const svg = cacheTikzEditorSvg(source, data.svg);

          draftRef.current = source;
          setDraft(source);
          setRendered(source);
          setMessage('');

          if (pending) {
            clearTimeout(pending.timer);
            pendingEditorSaveRef.current = undefined;
            pending.resolve({ source, svg });
          }
        } catch (error) {
          if (pending) {
            clearTimeout(pending.timer);
            pendingEditorSaveRef.current = undefined;
            pending.reject(error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    };

    window.addEventListener('message', onMessage);

    return () => window.removeEventListener('message', onMessage);
  }, [isVisualEditorShown, sendToEditor]);

  useEffect(() => () => {
    const pending = pendingEditorSaveRef.current;

    if (pending) {
      clearTimeout(pending.timer);
      pendingEditorSaveRef.current = undefined;
      pending.reject(new Error('TikZ Editor was closed before save completed.'));
    }
  }, []);

  const handleCompileStateChange = useCallback(async (hasError: boolean, renderedValue: string): Promise<void> => {
    try {
      await onCompileStateChange?.(hasError, renderedValue);
    } finally {
      // On failure, stop suppressing the persisted error immediately. On
      // success, wait for the parent refresh effect above to observe that the
      // persisted error flag has actually cleared.
      if (hasError && retrySourceRef.current === renderedValue) {
        retrySourceRef.current = undefined;
        setRetrySource(undefined);
      }
    }
  }, [onCompileStateChange]);

  const toggleDetails = useCallback((): void => {
    setIsDetailsShown((shown) => !shown);
  }, []);
  const closePreview = useCallback((): void => {
    setPreviewScale(1);
    lastPinchDistanceRef.current = 0;
    setIsPreviewBig(false);
  }, []);
  const handlePreviewTouchMove = useCallback((event: React.TouchEvent<HTMLDivElement>): void => {
    if (event.touches.length !== 2) {
      return;
    }

    const dx = event.touches[0].pageX - event.touches[1].pageX;
    const dy = event.touches[0].pageY - event.touches[1].pageY;
    const distance = Math.sqrt(dx * dx + dy * dy);

    if (lastPinchDistanceRef.current !== 0) {
      const distanceChange = distance - lastPinchDistanceRef.current;

      setPreviewScale((previous) => Math.max(1, previous + distanceChange / 200));
    }

    lastPinchDistanceRef.current = distance;
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
    {showPreview && <PreviewBlock>
      <PreviewRow>
        <ZoomablePreview
          aria-label={`Open ${alt} TikZ preview`}
          onClick={() => setIsPreviewBig(true)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              setIsPreviewBig(true);
            }
          }}
          role='button'
          tabIndex={0}
        >
          <TikzDisplay
            alt={`${alt} TikZ preview`}
            displayMode='thumbnail'
            hasCompileError={hasCompileError && rendered === value && retrySource !== rendered}
            onCompileStateChange={handleCompileStateChange}
            recompileToken={recompileToken}
            value={rendered}
          />
        </ZoomablePreview>
        {onSave && <button
          aria-label={`Edit ${alt} image`}
          className='tikzEditInline'
          disabled={isSaving || !draft.trim()}
          onClick={openVisualEditor}
          title={`Edit ${alt} image`}
          type='button'
        ><Icon icon='edit' /></button>}
      </PreviewRow>
      {prompt?.trim() && <PreviewActions>
        <Button
          icon={isDetailsShown ? 'eye-slash' : 'eye'}
          label={isDetailsShown ? 'Hide visual prompt' : 'Show visual prompt'}
          onClick={toggleDetails}
        />
      </PreviewActions>}
    </PreviewBlock>}
    {showPreview && isPreviewBig && <ImageModal header=' ' onClose={closePreview} size='large'>
      <Modal.Content>
        <PreviewViewport
          onTouchMove={handlePreviewTouchMove}
          onTouchStart={() => { lastPinchDistanceRef.current = 0; }}
        >
          <ScaledPreview className={expandedPrompt ? 'withExpandedPrompt' : undefined} style={{ transform: `scale(${previewScale})` }}>
            <TikzDisplay
              alt={`${alt} TikZ preview`}
              displayMode='modal'
              hasCompileError={hasCompileError && rendered === value && retrySource !== rendered}
              value={rendered}
            />
          </ScaledPreview>
        </PreviewViewport>
        {expandedPrompt && <ExpandedPrompt>{expandedPrompt}</ExpandedPrompt>}
      </Modal.Content>
    </ImageModal>}
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
  align-items: flex-start;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin-top: 0.5rem;
  max-width: 100%;
  width: fit-content;
`;

const PreviewBlock = styled.div`
  align-items: stretch;
  display: inline-flex;
  flex-direction: column;
  gap: 0.35rem;
  max-width: 100%;
  width: fit-content;
`;

const PreviewRow = styled.div`
  align-items: flex-start;
  display: flex;
  flex-wrap: nowrap;
  gap: 0.35rem;
  max-width: 100%;
  min-width: 0;

  .tikzEditInline {
    align-items: center;
    background: transparent;
    border: 0;
    border-radius: 0.25rem;
    box-shadow: none;
    color: var(--color-text, #555);
    cursor: pointer;
    display: inline-flex;
    flex: 0 0 1.75rem;
    height: 1.75rem;
    justify-content: center;
    margin: 0;
    padding: 0;
    width: 1.75rem;

    .ui--Icon {
      margin: 0 !important;
      padding: 0;
      height: 0.85rem;
      width: 0.85rem;
    }

    &:hover:not(:disabled) {
      background: var(--bg-menu, #f3f3f3);
    }

    &:focus-visible {
      outline: 2px solid var(--color-primary, #1682d4);
      outline-offset: 1px;
    }

    &:disabled {
      cursor: not-allowed;
      opacity: 0.45;
    }
  }
`;

const PreviewActions = styled.div`
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  justify-content: flex-end;
  max-width: 100%;
  width: 100%;

  .ui--Button {
    margin: 0;
  }
`;

const ZoomablePreview = styled.div`
  cursor: zoom-in;
  display: inline-block;
  flex: 0 1 150px;
  min-width: 0;
  max-width: 150px;
  width: 150px;

  &:focus-visible {
    outline: 2px solid currentColor;
    outline-offset: 2px;
  }
`;

const ImageModal = styled(Modal)`
  .ui--Modal__body {
    box-sizing: border-box;
    max-height: calc(100dvh - 16px);
    max-width: calc(100vw - 16px);
    overflow: auto;
  }
`;

const PreviewViewport = styled.div`
  align-items: center;
  display: flex;
  justify-content: center;
  min-height: 0;
  overflow: auto;
  width: 100%;
`;

const ScaledPreview = styled.div`
  max-height: calc(100dvh - 9rem);
  max-width: 100%;
  transform-origin: center center;
  width: 100%;

  &.withExpandedPrompt {
    max-height: calc(100dvh - 16rem);

    .tikzDisplay--modal,
    .tikzDisplay--modal > svg,
    .tikzDisplay--modal > * > svg {
      max-height: calc(100dvh - 16rem);
    }
  }
`;

const ExpandedPrompt = styled.div`
  border-top: 1px solid var(--border-table);
  margin-top: 0.75rem;
  padding: 0.75rem 0.5rem;
  text-align: left;
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
