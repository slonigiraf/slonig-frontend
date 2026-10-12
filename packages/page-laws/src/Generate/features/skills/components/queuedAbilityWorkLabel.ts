// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookAbilityWorkItem } from '@slonigiraf/db';
import type { ChapterContent } from '../SkillsTypes.js';

/** Resolve human-readable queue entries from the current book snapshot. */
export function queuedAbilityWorkLabel (item: BookAbilityWorkItem, chapters: readonly ChapterContent[]): { title: string; concept: string } {
  const chapter = chapters.find(({ concepts }) => concepts.some(({ id }) => id === item.conceptId));
  const concept = chapter?.concepts.find(({ id }) => id === item.conceptId);
  const records = chapter?.abilities.filter(({ moduleId }) => moduleId.endsWith(`-concept-${item.conceptId}`)) ?? [];
  const record = records.find(({ id }) => id === item.recordId) ?? (records.length === 1 ? records[0] : undefined);
  const conceptTitle = concept?.title?.trim() || `Concept ${item.conceptId}`;
  const title = record?.ability?.h?.trim() || conceptTitle;

  return { title, concept: conceptTitle };
}

/** Match queue identity exactly; after an edit changed the ID, allow a
 * Concept fallback only when that Concept still has one current Ability. */
export function queuedFixItemForAbility (
  record: { id: string; moduleId: string },
  items: readonly BookAbilityWorkItem[],
  conceptAbilityCount: number
): BookAbilityWorkItem | undefined {
  const exact = items.find((item) => item.kind === 'fix' && item.recordId === record.id);
  if (exact) return exact;
  if (conceptAbilityCount !== 1) return undefined;
  const conceptId = Number(/-concept-(\d+)$/.exec(record.moduleId)?.[1]);
  if (!Number.isSafeInteger(conceptId)) return undefined;
  const matches = items.filter((item) => item.kind === 'fix' && item.conceptId === conceptId);

  return matches.length === 1 ? matches[0] : undefined;
}
