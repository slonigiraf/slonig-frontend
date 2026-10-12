// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AbilityFixInstructions, BookAbilityWorkItem } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@polkadot/react-components';

import type { StoredAbility } from '../../../book/application/abilities/abilityProcessing.js';
import type { ChapterContent } from '../SkillsTypes.js';
import AbilityConceptCard from './AbilityConceptCard.js';
import { AbilityCard } from './SkillsComponents.js';
import { StyledSkills } from '../SkillsStyles.js';

interface Props {
  chapters: readonly ChapterContent[];
  isBusy: boolean;
  onCancelFix?: (id: string) => Promise<void>;
  onClose: () => void;
  onContentChange: () => void;
  onError: (message: string) => void;
  onQueueFix?: (record: StoredAbility, instructions: AbilityFixInstructions) => Promise<void>;
  onQueueSplit?: (record: StoredAbility) => void;
  onReviewed: (record: StoredAbility) => Promise<void>;
  queuedItems: readonly BookAbilityWorkItem[];
}

/** Book-wide sequential review. Nothing is silently approved at a chapter boundary. */
export default function AbilityReviewMode ({ chapters, isBusy, onCancelFix, onClose, onContentChange, onError, onQueueFix, onQueueSplit, onReviewed, queuedItems }: Props): React.ReactElement {
  const [reviewedIds, setReviewedIds] = useState<Set<string>>(() => new Set());
  const [skippedIds, setSkippedIds] = useState<Set<string>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const entries = useMemo(() => chapters.flatMap(({ abilities, chapter, concepts }, chapterIndex) => abilities.map((record) => ({
    chapter, chapterIndex, concept: concepts.find(({ id }) => record.moduleId.endsWith(`-concept-${id}`)), record
  }))), [chapters]);
  const pending = entries.filter(({ record }) => !record.reviewed && !reviewedIds.has(record.id));
  const current = pending.find(({ record }) => !skippedIds.has(record.id));
  const reviewedCount = entries.length - pending.length;

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent): void => { if (event.key === 'Escape' && !document.querySelector('.ui--Modal')) onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => { document.body.style.overflow = previousOverflow; window.removeEventListener('keydown', onKeyDown); };
  }, [onClose]);

  const markReviewed = useCallback(async (): Promise<void> => {
    if (!current || saving) return;
    setSaving(true);
    try {
      await onReviewed(current.record);
      setReviewedIds((previous) => new Set(previous).add(current.record.id));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to save this review.');
    } finally {
      setSaving(false);
    }
  }, [current, onError, onReviewed, saving]);

  const queuedFixId = current && queuedItems.find((item) => item.kind === 'fix' && item.recordId === current.record.id)?.id;
  const queuedSplit = current && queuedItems.some((item) => item.kind === 'split' && item.conceptId === current.concept?.id);

  return createPortal(<StyledSkills aria-label='Book Ability review' className='abilityReviewOverlay' role='dialog' aria-modal='true'>
    <header className='abilityReviewHeader'>
      <div>
        <h2>Review Abilities</h2>
        <p>{reviewedCount} of {entries.length} reviewed · {pending.length} remaining</p>
      </div>
      <Button icon='times' label='Exit review' onClick={onClose} />
    </header>
    <div className='abilityReviewProgress' role='progressbar' aria-label='Book Ability review progress' aria-valuenow={reviewedCount} aria-valuemin={0} aria-valuemax={entries.length}>
      <div style={{ width: `${entries.length ? (100 * reviewedCount / entries.length) : 100}%` }} />
    </div>
    <main className='abilityReviewContent'>
      {current ? <>
        <div className='abilityReviewLocation'>Chapter {current.chapterIndex + 1} of {chapters.length}: {current.chapter.title}</div>
        <AbilityConceptCard concept={current.concept} isSingleExercise={current.record.ability?.q.length === 1}>
          <AbilityCard
            isBusy={isBusy || saving}
            queuedFixItemId={queuedFixId}
            isQueuedForSplit={Boolean(queuedSplit)}
            onCancelFix={onCancelFix}
            onDeleted={onContentChange}
            onError={onError}
            onQueueFix={onQueueFix}
            onSplit={(record) => onQueueSplit?.(record)}
            record={current.record}
          />
        </AbilityConceptCard>
        <div className='abilityReviewActions'>
          <Button icon='arrow-right' isDisabled={saving} label='Skip for now' onClick={() => setSkippedIds((previous) => new Set(previous).add(current.record.id))} />
          <Button icon='check' isDisabled={saving || isBusy || Boolean(queuedFixId) || Boolean(queuedSplit)} label={saving ? 'Saving…' : 'Reviewed'} onClick={() => { void markReviewed(); }} />
        </div>
        {(queuedFixId || queuedSplit) && <p>This Ability has a pending AI job. Review it after that job finishes, or skip it for now.</p>}
      </> : <div className='abilityReviewDone'>
        <h3>{pending.length === 0 ? 'Entire book reviewed!' : 'You have reached the end of this review pass.'}</h3>
        <p>{pending.length === 0 ? 'Every Ability has been marked Reviewed.' : `${pending.length} Ability${pending.length === 1 ? ' is' : 'ies are'} still awaiting review.`}</p>
        {pending.length > 0 && <Button icon='redo' label='Review remaining' onClick={() => setSkippedIds(new Set<string>())} />}
        <Button icon='check' label='Close' onClick={onClose} />
      </div>}
    </main>
  </StyledSkills>, document.body);
}
