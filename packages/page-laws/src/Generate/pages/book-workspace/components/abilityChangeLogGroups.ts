// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookAbilityChangeLogEntry } from '@slonigiraf/db';

export interface AbilityChangeGroup {
  /** Newest change for this Ability. */
  latest: BookAbilityChangeLogEntry;
  entryIds: number[];
  hasAiChanges: boolean;
}

/** A repeated edit is one unreviewed Ability, not several entries in the badge. */
export function groupAbilityChanges (entries: readonly BookAbilityChangeLogEntry[]): AbilityChangeGroup[] {
  const byAbility = new Map<string, AbilityChangeGroup>();

  for (const entry of [...entries].sort((a, b) => b.updatedAt - a.updatedAt)) {
    const group = byAbility.get(entry.recordId);

    if (group) {
      if (entry.id !== undefined) group.entryIds.push(entry.id);
      group.hasAiChanges ||= entry.source === 'ai';
    } else {
      byAbility.set(entry.recordId, {
        entryIds: entry.id === undefined ? [] : [entry.id],
        hasAiChanges: entry.source === 'ai',
        latest: entry
      });
    }
  }

  return Array.from(byAbility.values());
}

