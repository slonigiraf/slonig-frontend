// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookAbilityChangeLogEntry } from '@slonigiraf/db';

export interface AbilityChangeGroup {
  /** Newest change for this Ability. */
  latest: BookAbilityChangeLogEntry;
  entryIds: number[];
}

/** A repeated edit is one unreviewed Ability, not several entries in the badge. */
export function groupAbilityChanges (entries: readonly BookAbilityChangeLogEntry[]): AbilityChangeGroup[] {
  const byAbility = new Map<string, AbilityChangeGroup>();

  // The database resolves older content-hashed IDs to the current Ability
  // before grouping. Keep separate Abilities under the same Concept distinct.
  for (const entry of entries.filter(({ source }) => source === 'ai').sort((a, b) => b.updatedAt - a.updatedAt || (b.id ?? 0) - (a.id ?? 0))) {
    const key = entry.recordId;
    const group = byAbility.get(key);

    if (group) {
      if (entry.id !== undefined) group.entryIds.push(entry.id);
    } else {
      byAbility.set(key, {
        entryIds: entry.id === undefined ? [] : [entry.id],
        latest: entry
      });
    }
  }

  return Array.from(byAbility.values());
}

