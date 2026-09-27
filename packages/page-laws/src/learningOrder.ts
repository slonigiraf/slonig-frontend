// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { Exercise } from '@slonigiraf/db';

function finiteDisplayOrder(value: number | undefined): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

export function sortExercisesForDisplay(exercises: Exercise[]): Exercise[] {
  return [...exercises].sort((a, b) => {
    const aOrder = finiteDisplayOrder(a.displayOrder);
    const bOrder = finiteDisplayOrder(b.displayOrder);

    if (aOrder !== undefined || bOrder !== undefined) {
      if (aOrder === undefined) return 1;
      if (bOrder === undefined) return -1;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }

    return a.bookPage[1] - b.bookPage[1] || (a.id ?? Number.MAX_SAFE_INTEGER) - (b.id ?? Number.MAX_SAFE_INTEGER);
  });
}

export function sortAbilitiesForDisplay<T extends { displayOrder?: number; id: string }>(abilities: T[]): T[] {
  return [...abilities].sort((a, b) => {
    const aOrder = finiteDisplayOrder(a.displayOrder);
    const bOrder = finiteDisplayOrder(b.displayOrder);

    if (aOrder !== undefined || bOrder !== undefined) {
      if (aOrder === undefined) return 1;
      if (bOrder === undefined) return -1;
      if (aOrder !== bOrder) return aOrder - bOrder;
    }

    return a.id.localeCompare(b.id);
  });
}
