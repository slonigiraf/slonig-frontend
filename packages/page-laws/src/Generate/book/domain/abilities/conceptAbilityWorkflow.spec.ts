// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { BookConcept } from '@slonigiraf/db';
import type { AbilityWorkflowJsonRunner } from './abilityWorkflow.js';

import { generateConceptAbility } from './conceptAbilityWorkflow.js';
import { FIX_ABILITIES_REQUEST_PROMPT } from '../../infrastructure/ai/prompts/abilities.js';

describe('Exercise quality rules carried into direct Concept -> Ability workflow', (): void => {
  it('generates directly from a Concept with the old Exercise design guarantees', async (): Promise<void> => {
    const source = { id: 19, title: 'Read coordinates', description: 'Read a coordinate pair from a plotted point.' } as BookConcept;
    let sentPrompt = '';
    const runJson: AbilityWorkflowJsonRunner = async (prompt, parse) => {
      sentPrompt = prompt;

      return parse(JSON.stringify({ abilities: [{
        h: source.title, i: '', t: 3,
        q: [
          { h: 'What are the coordinates of the plotted point?', a: '<kx>(2, 3)</kx>', p: 'Point at (2,3)', i: '' },
          { h: 'Read the coordinates of the point shown.', a: '<kx>(4, 5)</kx>', p: 'Point at (4,5)', i: '' }
        ]
      }] }));
    };
    const ability = await generateConceptAbility('en', 'Coordinates', source, runJson, 11);

    assert.equal(ability.h, source.title);
    assert.equal(ability.q.length, 2);
    assert.match(sentPrompt, /DIRECT CONCEPT-TO-ABILITY QUALITY CONTRACT/);
    assert.match(sentPrompt, /input modality, output modality/);
    assert.match(sentPrompt, /ONE generation pass/);
    assert.match(sentPrompt, /multiple choice/);
    assert.match(sentPrompt, /q\[\]\.p is a standalone generation description/);
    assert.match(sentPrompt, /q\[\]\.i is a standalone generation description/);
    assert.match(sentPrompt, /Preserve the \*represented form\*/);
    assert.match(sentPrompt, /source Concept title EXACTLY/);
    assert.match(sentPrompt, /Learner age: 11/);
    assert.doesNotMatch(sentPrompt, /SOURCE EXERCISE:/);
  });

  it('adds the Fix Exercise quality audit without allowing image modifications', (): void => {
    const prompt = FIX_ABILITIES_REQUEST_PROMPT({ abilities: [{ sourceConcept: { title: 'Draw a number line', description: 'Locate a point on a number line.' } }], learnerAge: 9 });

    assert.match(prompt, /ADDITIONAL QUALITY AUDIT ADAPTED FROM FIX EXERCISES/);
    assert.match(prompt, /If learnerAge is present, AUDIT age-level suitability/);
    assert.match(prompt, /REQUIRED INPUT MODALITY and ANSWER FORMAT/);
    assert.match(prompt, /q\[\]\.p, q\[\]\.i, q\[\]\.pPrompt, and q\[\]\.iPrompt are READ-ONLY/);
    assert.match(prompt, /Direct Concept-linked Abilities have NO sourceExercise/);
    assert.match(prompt, /sourceConcept as the PRIMARY authority/);
    assert.match(prompt, /non-obvious or multi-step answers/);
    assert.match(prompt, /duplicatePairs/);
  });
});
