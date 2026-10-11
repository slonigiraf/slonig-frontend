// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { describe, expect, it } from 'vitest';

import { sortAbilitiesForDisplay } from './learningOrder.js';

describe('Concept-linked Ability display order', (): void => {
  it('sorts Abilities by persisted display order', (): void => {
    const abilities = sortAbilitiesForDisplay([
      { displayOrder: 4, id: 'b' },
      { displayOrder: 1, id: 'a' },
      { displayOrder: 3, id: 'c' }
    ]);

    expect(abilities.map(({ id }) => id)).toEqual(['a', 'c', 'b']);
  });
});
