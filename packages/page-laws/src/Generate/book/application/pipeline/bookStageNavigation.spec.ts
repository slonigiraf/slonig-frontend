// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { PipelineAction } from '../../../shared/types/processing.js';

import { nextUnresolvedStage } from './bookStageNavigation.js';

const action = (key: string, isDone = false): PipelineAction => ({
  key,
  label: key,
  isDone,
  isDisabled: false,
  onClick: () => undefined
});

describe('pipeline navigation', (): void => {
  it('does not mistake a bypassed failed stage for a success', (): void => {
    const actions = [action('concepts', true), action('fixConcepts'), action('embeddings'), action('standards')];

    assert.equal(nextUnresolvedStage(actions)?.key, 'fixConcepts');
    assert.equal(nextUnresolvedStage(actions, ['fixConcepts'])?.key, 'embeddings');
    assert.equal(actions[1].isDone, false);
  });

  it('selects the next unresolved stage after a completed stage rather than jumping backward to a previous failure', (): void => {
    const actions = [action('concepts'), action('fixConcepts', true), action('embeddings'), action('standards')];

    assert.equal(nextUnresolvedStage(actions, [], 'fixConcepts')?.key, 'embeddings');
  });

  it('does not auto-select an earlier skipped stage after advancing', (): void => {
    const actions = [action('concepts'), action('fixConcepts'), action('embeddings', true), action('standards')];

    assert.equal(nextUnresolvedStage(actions, ['concepts'], 'fixConcepts')?.key, 'standards');
  });
});
