// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { AbilityFixInstructions, BookAbilityChangeLogEntry, BookAbilityWorkItem, BookConcept } from '@slonigiraf/db';
import { getAbilities, getAbility, getBookConceptById, getImage, hydrateAbilityContent } from '@slonigiraf/db';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Modal, styled } from '@polkadot/react-components';

import type { StoredAbility } from '../../../book/application/abilities/abilityProcessing.js';
import { conceptAbilityModuleId, storedAbilityImageId } from '../../../book/application/abilities/abilityProcessing.js';
import { parseStoredAbility } from '../../../../abilities/abilities.js';
import AbilityConceptCard from '../../../features/skills/components/AbilityConceptCard.js';
import { AbilityCard } from '../../../features/skills/components/SkillsComponents.js';
import { StyledSkills } from '../../../features/skills/SkillsStyles.js';
import { groupAbilityChanges } from './abilityChangeLogGroups.js';
import type { AbilityChangeGroup } from './abilityChangeLogGroups.js';

type AbilityPreview = { concept?: BookConcept; record?: StoredAbility; visualIssues?: Record<string, string[]> };

const StyledLogToolbar = styled.div`
  display: flex;
  justify-content: flex-end;
  margin-bottom: 0.8rem;
`;

const StyledLogPreview = styled(StyledSkills)`
  max-height: min(72vh, 56rem);
  overflow: auto;
  box-sizing: border-box;
  padding: 0.4rem 2.5rem 0.4rem 0.4rem;

  .abilityChangeLogEntry {
    border-bottom: 1px solid var(--border-table);
    margin-bottom: 1.3rem;
    padding-bottom: 1.3rem;
  }
  .abilityChangeLogEntry:last-child { border-bottom: 0; margin-bottom: 0; }
  .abilityChangeLogMeta {
    align-items: center;
    display: flex;
    flex-wrap: wrap;
    gap: 0.65rem;
    justify-content: space-between;
    margin: 0 0 0.85rem;
  }
  .abilityChangeLogMeta > div { min-width: 0; }
  .abilityChangeLogMeta small { display: block; margin-top: 0.15rem; opacity: 0.8; }
  .abilityChangeLogMeta .ui--Button { margin: 0; }
  .abilityChangeLogEntry .abilityConceptCard { margin-bottom: 0; }
  .abilityChangeLogUnavailable { margin: 0.8rem 0; }
`;

interface Props {
  bookId: number;
  entries: readonly BookAbilityChangeLogEntry[];
  isQueueBusy: boolean;
  onClose: () => void;
  onContentChange: () => void;
  onError: (message: string) => void;
  onLogChange: () => Promise<void>;
  onQueueFix: (record: StoredAbility, instructions: AbilityFixInstructions) => Promise<void>;
  onCancelFix: (itemId: string) => Promise<void>;
  onQueueSplit: (record: StoredAbility) => Promise<void>;
  onReviewed: (ids: number[]) => Promise<void>;
  workQueueItems: readonly BookAbilityWorkItem[];
}

export default function AbilityChangeLogModal ({ bookId, entries, isQueueBusy, onClose, onContentChange, onError, onLogChange, onQueueFix, onCancelFix, onQueueSplit, onReviewed, workQueueItems }: Props): React.ReactElement {
  const groups = useMemo(() => groupAbilityChanges(entries), [entries]);
  const [previews, setPreviews] = useState<Map<string, AbilityPreview>>();
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [reviewing, setReviewing] = useState<string>();

  useEffect(() => {
    let active = true;
    setPreviews(undefined);

    void Promise.all(groups.map(async ({ latest }): Promise<[string, AbilityPreview]> => {
      const concept = latest.conceptId === undefined ? undefined : await getBookConceptById(latest.conceptId);
      let row = await getAbility(latest.recordId);

      // Regeneration may have replaced an older record ID. Only use the
      // Concept's current Ability when there is exactly one unambiguous match.
      if (!row && latest.conceptId !== undefined) {
        const candidates = await getAbilities(conceptAbilityModuleId(bookId, latest.conceptId));
        if (candidates.length === 1) row = candidates[0];
      }

      if (!row || !row.moduleId.startsWith(`book-${bookId}-`)) return [latest.recordId, { concept }];

      let ability: StoredAbility['ability'] = null;
      try {
        ability = parseStoredAbility(await hydrateAbilityContent(row.content));
      } catch {
        // Keep the same invalid-Ability placeholder as the Abilities tab.
      }

      const record: StoredAbility = { ...row, ability };
      const visualIssues: Record<string, string[]> = {};
      await Promise.all((ability?.q ?? []).flatMap((_, exerciseIndex) => (['p', 'i'] as const).map(async (field) => {
        const imageId = storedAbilityImageId(record, exerciseIndex, field);
        const image = imageId === undefined ? undefined : await getImage(imageId);
        const issues = [...new Set([...(image?.detectedIssues ?? []), ...(image?.reviewResult?.errors ?? [])])];
        if (issues.length) visualIssues[`${exerciseIndex}-${field}`] = issues;
      })));

      return [latest.recordId, { concept, record, visualIssues }];
    })).then((items) => {
      if (active) setPreviews(new Map(items));
    }).catch((error: unknown) => {
      if (active) {
        setPreviews(new Map());
        onError(`Unable to load the Ability change log: ${error instanceof Error ? error.message : String(error)}`);
      }
    });

    return () => { active = false; };
  }, [bookId, groups, onError, refreshVersion]);

  const refreshPreview = useCallback((): void => {
    onContentChange();
    setRefreshVersion((value) => value + 1);
    void onLogChange().catch((error: unknown) => onError(error instanceof Error ? error.message : String(error)));
  }, [onContentChange, onError, onLogChange]);

  const reviewGroup = useCallback(async (group: AbilityChangeGroup): Promise<void> => {
    setReviewing(group.latest.recordId);
    try {
      await onReviewed(group.entryIds);
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to mark this Ability as reviewed.');
    } finally {
      setReviewing(undefined);
    }
  }, [onError, onReviewed]);

  const reviewAll = useCallback(async (): Promise<void> => {
    if (reviewing !== undefined || isQueueBusy || !groups.length) return;
    setReviewing('#all');
    try {
      await onReviewed(groups.flatMap(({ entryIds }) => entryIds));
    } catch (error) {
      onError(error instanceof Error ? error.message : 'Unable to mark all Abilities as reviewed.');
    } finally {
      setReviewing(undefined);
    }
  }, [groups, isQueueBusy, onError, onReviewed, reviewing]);

  return <Modal header={`Ability change log (${groups.length})`} onClose={onClose} size='large'>
    <Modal.Content>
      {!groups.length && <p>No unreviewed Ability changes.</p>}
      {!!groups.length && <StyledLogToolbar>
        <Button
          icon='check'
          isDisabled={reviewing !== undefined || isQueueBusy}
          label={reviewing === '#all' ? 'Marking all reviewed…' : 'Mark all reviewed'}
          onClick={() => { void reviewAll(); }}
        />
      </StyledLogToolbar>}
      {!!groups.length && <StyledLogPreview className='abilityChangeLogPreview'>
        {groups.map((group) => {
          const { latest } = group;
          const preview = previews?.get(latest.recordId);
          const record = preview?.record;
          const conceptId = latest.conceptId;

          return <div className='abilityChangeLogEntry' key={latest.recordId}>
            <div className='abilityChangeLogMeta'>
              <div>
                <strong>{latest.title}</strong> — {latest.summary.startsWith('AI split Concept ') ? 'AI split' : 'AI fixed'}
                <small>{latest.summary} · {new Date(latest.updatedAt).toLocaleString()}</small>
              </div>
              <Button
                icon='check'
                isDisabled={reviewing !== undefined}
                label={reviewing === latest.recordId ? 'Reviewing…' : 'Reviewed'}
                onClick={() => { void reviewGroup(group); }}
              />
            </div>
            {previews === undefined
              ? <p>Loading Ability…</p>
              : <AbilityConceptCard concept={preview?.concept} isSingleExercise={record?.ability?.q.length === 1} ordinal={preview?.concept?.displayOrder === undefined ? undefined : preview.concept.displayOrder + 1}>
                {record
                  ? <AbilityCard
                    isBusy={isQueueBusy}
                    queuedFixItemId={workQueueItems.find((item) => item.kind === 'fix' && (item.recordId === record.id || item.recordId === latest.recordId))?.id}
                    isQueuedForSplit={conceptId !== undefined && workQueueItems.some((item) => item.kind === 'split' && item.conceptId === conceptId)}
                    onDeleted={refreshPreview}
                    onError={onError}
                    onQueueFix={onQueueFix}
                    onCancelFix={onCancelFix}
                    onSplit={(ability) => { void onQueueSplit(ability).catch((error: unknown) => onError(error instanceof Error ? error.message : String(error))); }}
                    record={record}
                    visualIssues={preview?.visualIssues}
                  />
                  : <p className='abilityChangeLogUnavailable'>The logged Ability is no longer available. You can still mark its change as reviewed.</p>}
              </AbilityConceptCard>}
          </div>;
        })}
      </StyledLogPreview>}
    </Modal.Content>
  </Modal>;
}
