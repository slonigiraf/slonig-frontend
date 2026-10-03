// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { cosineSimilarity } from './abilityEmbeddingValidation.js';

describe('Ability embedding validation', (): void => {
  it('returns one for identical embeddings', (): void => {
    assert.equal(cosineSimilarity([1, 2, 3], [1, 2, 3]), 1);
  });

  it('returns zero for orthogonal embeddings', (): void => {
    assert.equal(cosineSimilarity([1, 0], [0, 1]), 0);
  });

  it('rejects invalid vector pairs', (): void => {
    assert.equal(cosineSimilarity([], []), undefined);
    assert.equal(cosineSimilarity([1], [1, 2]), undefined);
    assert.equal(cosineSimilarity([0, 0], [1, 1]), undefined);
  });
});
