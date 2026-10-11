// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { CONCEPT_REDO_STAGES, conceptRedoStagesFrom } from './conceptRedoStages.js';

describe('Concept-scoped AI regeneration', () => {
  it('runs every stage from Ability generation by default', () => {
    assert.deepEqual(conceptRedoStagesFrom('abilities'), CONCEPT_REDO_STAGES.map(({ key }) => key));
  });

  it('can start from Ability creation', () => {
    assert.deepEqual(conceptRedoStagesFrom('abilities'), ['abilities', 'fixAbilities', 'images', 'fixImages', 'answerImages', 'fixAnswerImages']);
  });

  it('can rerun only image generation and image fixes', () => {
    assert.deepEqual(conceptRedoStagesFrom('images'), ['images', 'fixImages', 'answerImages', 'fixAnswerImages']);
  });

  it('can start at question-image repair and continue to answer images', () => {
    assert.deepEqual(conceptRedoStagesFrom('fixImages'), ['fixImages', 'answerImages', 'fixAnswerImages']);
  });

  it('can regenerate only answers and their QA', () => {
    assert.deepEqual(conceptRedoStagesFrom('answerImages'), ['answerImages', 'fixAnswerImages']);
  });

  it('rejects unknown stages', () => {
    assert.throws(() => conceptRedoStagesFrom('other' as 'exercises'), /Unknown Concept/);
  });
});
