// Copyright 2026 @slonigiraf/slonig-components authors & contributors
// SPDX-License-Identifier: Apache-2.0
/** Historical table renames/shapes, applied to staged rows before any live data changes. */
export function migrateBackupRows(version: number, tableName: string, rows: unknown[]): unknown[] {
  if (version >= 81) return rows;
  if (tableName === 'exerciseTemplates') return rows.map((row) => {
    const { bookSkillId, ...rest } = row as Record<string, unknown>;
    return { ...rest, skillId: rest.skillId ?? bookSkillId };
  });
  if (tableName === 'skills') return rows.map((row) => {
    const { bookExerciseIds, ...rest } = row as Record<string, unknown>;
    return { ...rest, exerciseIds: rest.exerciseIds ?? bookExerciseIds ?? [] };
  });
  return rows;
}
