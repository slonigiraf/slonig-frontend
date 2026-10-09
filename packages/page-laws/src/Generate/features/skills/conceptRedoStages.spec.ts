// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CONCEPT_REDO_STAGES, conceptRedoStagesFrom } from './conceptRedoStages.js';

describe('Concept-scoped AI regeneration', () => {
  it('runs every stage from Exercise generation by default', () => {
    assert.deepEqual(conceptRedoStagesFrom('exercises'), CONCEPT_REDO_STAGES.map(({ key }) => key));
  });

  it('can skip Exercise generation and start from Ability creation', () => {
    assert.deepEqual(conceptRedoStagesFrom('abilities'), ['abilities', 'fixAbilities', 'images', 'fixImages']);
  });

  it('can rerun only image generation and image fixes', () => {
    assert.deepEqual(conceptRedoStagesFrom('images'), ['images', 'fixImages']);
  });

  it('can rerun only the last repair stage', () => {
    assert.deepEqual(conceptRedoStagesFrom('fixImages'), ['fixImages']);
  });

  it('rejects unknown stages', () => {
    assert.throws(() => conceptRedoStagesFrom('other' as 'exercises'), /Unknown Concept/);
  });
});
