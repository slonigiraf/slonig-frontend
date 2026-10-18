// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AbilityFixInstructions, BookAbilityWorkItem } from '@slonigiraf/db';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, Spinner } from '@polkadot/react-components';

import type { StoredAbility } from '../../../book/application/abilities/abilityProcessing.js';
import type { ChapterContent } from '../SkillsTypes.js';
import AbilityConceptCard from './AbilityConceptCard.js';
import { queuedAbilityWorkRecord } from './queuedAbilityWorkLabel.js';
import { AbilityCard } from './SkillsComponents.js';
import { StyledSkills } from '../SkillsStyles.js';

interface Props {
  chapters: readonly ChapterContent[];
  isBusy: boolean;
  isLoading: boolean;
  hasLoadError: boolean;
  onCancelFix?: (id: string) => Promise<void>;
  onClose: () => void;
  onContentChange: () => void;
  onAbilityReplaced?: (oldId: string, nextId: string) => void;
  onError: (message: string) => void;
  onQueueFix?: (record: StoredAbility, instructions: AbilityFixInstructions) => Promise<void>;
  onQueueSplit?: (record: StoredAbility) => void;
  onReviewed: (record: StoredAbility) => Promise<void>;
  queuedItems: readonly BookAbilityWorkItem[];
  reviewAbilityIds?: readonly string[];
  allowQueuedReview?: boolean;
}

/** Book-wide sequential review. Nothing is silently approved at a chapter boundary. */
export default function AbilityReviewMode ({ allowQueuedReview = false, chapters, hasLoadError, isBusy, isLoading, onCancelFix, onClose, onContentChange, onAbilityReplaced, onError, onQueueFix, onQueueSplit, onReviewed, queuedItems, reviewAbilityIds }: Props): React.ReactElement {
  // Review status belongs to IndexedDB. Only keep the ephemeral Back/Next
  // navigation trail here; a reload resumes at the first unreviewed Ability.
  const [visitedIds, setVisitedIds] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [acknowledgedReviewIds, setAcknowledgedReviewIds] = useState<readonly string[]>([]);
  const [saving, setSaving] = useState(false);
  const contentRef = useRef<HTMLElement>(null);
  const entries = useMemo(() => {
    const selectedIds = reviewAbilityIds === undefined ? undefined : new Set(reviewAbilityIds);

    return chapters.flatMap(({ abilities, chapter, concepts }, chapterIndex) => abilities
      .filter(({ id }) => selectedIds === undefined || selectedIds.has(id))
      .map((record) => ({
        chapter, chapterIndex, concept: concepts.find(({ id }) => record.moduleId.endsWith(`-concept-${id}`)), record
      })));
  }, [chapters, reviewAbilityIds]);
  // `chapters` is the latest IndexedDB snapshot provided by SkillsPage.
  // Never maintain a second, independent set of reviewed IDs.
  // A successful IndexedDB write can precede the refreshed chapter snapshot.
  // Immediately hide that row from the pending queue so Next/Space cannot
  // briefly redisplay the Ability that was just reviewed.
  const pending = entries.filter(({ record }) => !record.reviewed && !acknowledgedReviewIds.includes(record.id));
  const current = (historyIndex < visitedIds.length
    ? entries.find(({ record }) => record.id === visitedIds[historyIndex])
    : undefined) ?? pending[0];
  const isCurrentReviewed = Boolean(current && (current.record.reviewed || acknowledgedReviewIds.includes(current.record.id)));
  const reviewedCount = entries.length - pending.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !document.querySelector('.ui--Modal')) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [onClose]);

  const advance = useCallback((justReviewed = false): void => {
    if (!current) return;
    if (justReviewed) setAcknowledgedReviewIds((previous) => previous.includes(current.record.id) ? previous : [...previous, current.record.id]);
    setVisitedIds((previous) => historyIndex === previous.length ? [...previous, current.record.id] : previous);
    setHistoryIndex((previous) => previous + 1);
  }, [current, historyIndex]);

  const markReviewed = useCallback(async (): Promise<void> => {
    if (!current || isCurrentReviewed || saving) return;
    setSaving(true);
    try {
      await onReviewed(current.record);
      advance(true);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to save this review.');
    } finally {
      setSaving(false);
    }
  }, [advance, current, isCurrentReviewed, onError, onReviewed, saving]);

  // Ability rows have content-addressed IDs. Updating an exercise or removing
  // its image changes that ID, but Review must keep its Back/Next history and
  // selected-chapter scope pointed at the same logical Ability.
  const handleAbilityReplaced = useCallback((oldId: string, nextId: string): void => {
    if (oldId === nextId) return;
    setVisitedIds((previous) => previous.map((id) => id === oldId ? nextId : id));
    setAcknowledgedReviewIds((previous) => previous.map((id) => id === oldId ? nextId : id));
    onAbilityReplaced?.(oldId, nextId);
  }, [onAbilityReplaced]);

  // Rereviewing scheduled work must expose cancellation for *every* queued
  // Ability, including splits and fixes whose content-addressed ID changed.
  // Resolve against the same live Ability snapshot used to build the review scope.
  const matchingQueuedItems = allowQueuedReview && current
    ? queuedItems.filter((item) => queuedAbilityWorkRecord(item, chapters)?.id === current.record.id)
    : [];
  const queuedFixId = current && (allowQueuedReview
    ? matchingQueuedItems.find((item) => item.kind === 'fix')
    : queuedItems.find((item) => item.kind === 'fix' && item.recordId === current.record.id))?.id;
  const queuedSplit = current && queuedItems.some((item) => item.kind === 'split' && item.conceptId === current.concept?.id);
  // Prefer cancelling an existing fix before an accompanying split. Once the
  // queue refreshes, another pending job for this Ability can be cancelled.
  const scheduledWorkItemId = matchingQueuedItems.find((item) => item.kind === 'fix')?.id ?? matchingQueuedItems[0]?.id;
  const isNextAction = isCurrentReviewed || (Boolean(queuedFixId) && !allowQueuedReview);

  // Scheduling an AI fix is a review decision. Only advance once scheduling
  // and saving the review have succeeded; a failed review can still be
  // completed with Next if the fix was already queued successfully.
  const queueFixAndReview = useCallback(async (record: StoredAbility, instructions: AbilityFixInstructions): Promise<void> => {
    if (!onQueueFix) return;
    setSaving(true);
    try {
      await onQueueFix(record, instructions);
      try {
        if (!record.reviewed) {
          await onReviewed(record);
        }
        if (current?.record.id === record.id) advance(!record.reviewed);
      } catch (error) {
        onError(error instanceof Error ? error.message : 'Unable to save this review. Use Next to try again.');
      }
    } finally {
      setSaving(false);
    }
  }, [advance, current?.record.id, onError, onQueueFix, onReviewed]);

  // Space reviews an unreviewed Ability, or follows Next on a reviewed or
  // queued-for-AI-fix Ability. Leave typing and native controls alone.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== ' ' || event.repeat || event.isComposing || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey ||
          !current || isLoading || hasLoadError || saving || document.querySelector('.ui--Modal')) return;

      const target = event.target;
      if (target instanceof Element && target.closest('input, textarea, select, button, a, [role="button"], [role="textbox"], [contenteditable="true"], [contenteditable=""]')) return;

      if (isNextAction) {
        event.preventDefault();
        if (isCurrentReviewed) advance();
        else void markReviewed();
        return;
      }

      if (isBusy || (queuedSplit && !allowQueuedReview)) return;
      event.preventDefault();
      void markReviewed();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [advance, allowQueuedReview, current, hasLoadError, isBusy, isCurrentReviewed, isLoading, isNextAction, markReviewed, queuedSplit, saving]);

  // Calculate a shared *maximum* height for question/answer visuals; actual
  // dimensions preserve each image's aspect ratio. Simple exercises should
  // not expand into nearly full-screen blank cards.
  // More image-heavy Abilities may still use the full available review area.
  // If text alone is too tall (or on a narrow screen), retain scrolling.
  const hasAtMostOneVisualPerExercise = current?.record.ability?.q.every(({ i, p }) => !(i?.trim() && p?.trim())) ?? false;
  useLayoutEffect(() => {
    const content = contentRef.current;
    if (!content || !current || isLoading || hasLoadError) return;

    // Discard the outgoing Ability's fitted image size and scroll position
    // before painting the next one. Its async images will measure afresh.
    content.style.setProperty('--review-visual-height', '150px');
    content.scrollTop = 0;
    let frame = 0;
    const fitVisuals = (): void => {
      if (!content.clientHeight || !content.clientWidth) return;
      const card = content.querySelector<HTMLElement>('.abilityConceptCard');
      if (!card) return;

      // With only one visual per exercise, use at most 60% of the viewport
      // height for the entire Concept/Ability card (not for each image).
      // Also cap individual simple previews so small diagrams stay compact.
      const compactHeight = Math.floor(window.innerHeight * 0.6);
      const cardLimit = hasAtMostOneVisualPerExercise
        ? Math.min(content.clientHeight, compactHeight)
        : content.clientHeight;
      const maxVisualHeight = hasAtMostOneVisualPerExercise
        ? Math.min(content.clientHeight * 0.8, window.innerHeight * 0.38)
        : content.clientHeight * 0.8;
      const max = Math.max(72, Math.floor(maxVisualHeight));
      const fits = (height: number): boolean => {
        content.style.setProperty('--review-visual-height', `${height}px`);
        return card.getBoundingClientRect().height <= cardLimit + 2 && content.scrollHeight <= content.clientHeight + 2;
      };
      let low = 72;
      let high = max;
      if (fits(low)) {
        for (let attempt = 0; attempt < 10 && high - low > 1; attempt++) {
          const middle = Math.ceil((low + high) / 2);
          if (fits(middle)) low = middle;
          else high = middle - 1;
        }
      }
      content.style.setProperty('--review-visual-height', `${low}px`);
    };
    const scheduleFit = (): void => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(fitVisuals);
    };
    const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(scheduleFit) : undefined;
    observer?.observe(content);
    const card = content.querySelector('.abilityConceptCard');
    if (card) observer?.observe(card);
    window.addEventListener('resize', scheduleFit);
    scheduleFit();
    return () => {
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleFit);
    };
  }, [current?.record.id, current?.record.content, hasAtMostOneVisualPerExercise, hasLoadError, isLoading, queuedFixId, queuedSplit]);


  return createPortal(<StyledSkills aria-label='Book Ability review' className='abilityReviewOverlay' role='dialog' aria-modal='true'>
    <header className='abilityReviewHeader'>
      <div className='abilityReviewSummary'>
        <h2>Review Abilities</h2>
        {!isLoading && <span>{hasLoadError ? 'Unable to load review data' : `${reviewedCount}/${entries.length} reviewed · ${pending.length} left`}</span>}
        {!isLoading && !hasLoadError && current && <span className='abilityReviewLocation' title={current.chapter.title}>Chapter {current.chapterIndex + 1}/{chapters.length}: {current.chapter.title}</span>}
      </div>
      <div className='abilityReviewActions'>
        <Button className='abilityReviewBackButton' icon='arrow-left' isDisabled={saving || isLoading || hasLoadError || historyIndex === 0} label='Back' onClick={() => {
          setHistoryIndex((previous) => Math.max(0, previous - 1));
          // A clicked button keeps keyboard focus. Without blurring it, the
          // next Space press clicks Back again instead of reviewing/advancing.
          if (document.activeElement instanceof HTMLButtonElement && document.activeElement.classList.contains('abilityReviewBackButton')) {
            document.activeElement.blur();
          }
        }} />
        {!isLoading && !hasLoadError && current && <>
          <Button className='abilityReviewReviewedButton' icon={isNextAction ? 'arrow-right' : 'check'} isDisabled={saving || (!isNextAction && (isBusy || (Boolean(queuedSplit) && !allowQueuedReview)))} label={saving ? 'Saving…' : isNextAction ? 'Next' : 'Reviewed'} onClick={() => {
            // Let the following Space press use review navigation rather than
            // activating the previously focused button again.
            if (document.activeElement instanceof HTMLButtonElement) document.activeElement.blur();
            if (isCurrentReviewed) advance();
            else void markReviewed();
          }} />
        </>}
        <Button icon='times' onClick={onClose} />
      </div>
    </header>
    {!isLoading && !hasLoadError && <div className='abilityReviewProgress' role='progressbar' aria-label='Book Ability review progress' aria-valuenow={reviewedCount} aria-valuemin={0} aria-valuemax={entries.length}>
      <div style={{ width: `${entries.length ? (100 * reviewedCount / entries.length) : 100}%` }} />
    </div>}
    <main className='abilityReviewContent' ref={contentRef}>
      {isLoading ? <div aria-label='Loading review data' className='abilityReviewLoading' role='status'>
        <Spinner label='Loading' />
      </div> : hasLoadError ? <div className='abilityReviewDone' role='alert'>
        <h3>Unable to load review data.</h3>
        <p>The review status could not be verified. Retry loading the book.</p>
        <Button icon='redo' label='Retry' onClick={onContentChange} />
      </div> : current ? <>
        {queuedFixId && <p className='abilityReviewPending'>{allowQueuedReview ? 'An AI fix is scheduled. Review this Ability before running the job.' : 'An AI fix is scheduled. Select Next to continue; review the updated Ability after processing.'}</p>}
        {!queuedFixId && queuedSplit && <p className='abilityReviewPending'>{allowQueuedReview ? 'An AI split is scheduled. Review this Ability before running the job.' : 'This Ability has a pending AI job. Review it after the job finishes.'}</p>}
        <AbilityConceptCard key={current.record.id} concept={current.concept} isSingleExercise={current.record.ability?.q.length === 1}>
          <AbilityCard
            hideReviewedIndicator
            isBusy={isBusy || saving}
            queuedFixItemId={queuedFixId}
            scheduledWorkItemId={scheduledWorkItemId}
            isQueuedForSplit={Boolean(queuedSplit)}
            onCancelFix={onCancelFix}
            onDeleted={onContentChange}
            onReplaced={handleAbilityReplaced}
            onError={onError}
            onQueueFix={onQueueFix ? queueFixAndReview : undefined}
            onSplit={(record) => onQueueSplit?.(record)}
            record={current.record}
          />
        </AbilityConceptCard>
      </> : <div className='abilityReviewDone'>
        <h3>{entries.length === 0 && reviewAbilityIds !== undefined ? 'No Abilities in this review selection.' : (reviewAbilityIds === undefined ? 'Entire book reviewed!' : 'Selected Abilities reviewed!')}</h3>
        <p>{reviewAbilityIds === undefined ? 'Every Ability has been marked Reviewed.' : 'The selected Abilities have all been reviewed.'}</p>
        <Button icon='check' label='Close' onClick={onClose} />
      </div>}
    </main>
  </StyledSkills>, document.body);
}
