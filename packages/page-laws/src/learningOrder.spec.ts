// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { sortAbilitiesForDisplay, sortExercisesForDisplay } from './learningOrder.js';

describe('learning display order', (): void => {
  it('sorts Exercises by persisted ZPD display order across source pages', (): void => {
    const exercises = sortExercisesForDisplay([
      { bookPage: [1, 2], description: '', displayOrder: 2, id: 12, solution: '', title: 'later' },
      { bookPage: [1, 9], description: '', displayOrder: 0, id: 11, solution: '', title: 'first' },
      { bookPage: [1, 1], description: '', displayOrder: 1, id: 10, solution: '', title: 'middle' }
    ]);

    expect(exercises.map(({ id }) => id)).toEqual([11, 10, 12]);
  });

  it('sorts Abilities by the Exercise-derived display order', (): void => {
    const abilities = sortAbilitiesForDisplay([
      { displayOrder: 4, id: 'b' },
      { displayOrder: 1, id: 'a' },
      { displayOrder: 3, id: 'c' }
    ]);

    expect(abilities.map(({ id }) => id)).toEqual(['a', 'c', 'b']);
  });
});
