// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { conceptChapterMoveInsertionIndex } from './conceptChapterMove.js';

describe('concept chapter move placement', (): void => {
  it('places a concept from a preceding chapter at the beginning of the target chapter', (): void => {
    assert.equal(conceptChapterMoveInsertionIndex(1, 3, 5), 0);
  });

  it('places a concept from a later chapter at the end of the target chapter', (): void => {
    assert.equal(conceptChapterMoveInsertionIndex(4, 2, 5), 5);
  });
});
