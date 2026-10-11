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
          { h: 'What are the coordinates of the plotted point?', a: '<kx>(2, 3)</kx>', p: '', i: '', pPrompt: 'Point at (2,3)', iPrompt: '' },
          { h: 'Read the coordinates of the point shown.', a: '<kx>(4, 5)</kx>', p: '', i: '', pPrompt: 'Point at (4,5)', iPrompt: '' }
        ]
      }] }));
    };
    const ability = await generateConceptAbility('en', 'Coordinates', source, runJson, 11);

    assert.equal(ability.h, source.title);
    assert.equal(ability.q.length, 2);
    assert.ok(ability.q.every(({ p, i }) => p === '' && i === ''));
    assert.equal(ability.q[0].pPrompt, 'Point at (2,3)');
    assert.equal(ability.q[0].iPrompt, '');
    assert.match(sentPrompt, /DIRECT CONCEPT-TO-ABILITY QUALITY CONTRACT/);
    assert.match(sentPrompt, /input modality, output modality/);
    assert.match(sentPrompt, /ONE generation pass/);
    assert.match(sentPrompt, /multiple choice/);
    assert.match(sentPrompt, /q\[\]\.pPrompt is a standalone generation description/);
    assert.match(sentPrompt, /q\[\]\.iPrompt is a standalone generation description/);
    assert.match(sentPrompt, /Preserve the \*represented form\*/);
    assert.match(sentPrompt, /source Concept title EXACTLY/);
    assert.match(sentPrompt, /Learner age: 11/);
    assert.doesNotMatch(sentPrompt, /SOURCE EXERCISE:/);
  });

  it('supports two image-only answers without generating redundant written solutions', async (): Promise<void> => {
    const concept = { id: 8, title: 'Complete number lines', description: 'Complete a number line with the missing point.' } as BookConcept;
    const runner: AbilityWorkflowJsonRunner = async (_prompt, parse) => parse(JSON.stringify({ abilities: [{
      h: concept.title,
      i: '',
      t: 3,
      q: [
        { h: 'Mark the missing point on the first line.', a: '', p: '', i: '', pPrompt: 'Line with a missing point.', iPrompt: 'Same line completed with the missing point correctly marked.' },
        { h: 'Mark the missing point on the second line.', a: '', p: '', i: '', pPrompt: 'Another line with a missing point.', iPrompt: 'The second line correctly completed and labeled.' }
      ]
    }] }));
    const ability = await generateConceptAbility('en', 'Number lines', concept, runner);

    assert.equal(ability.q[0].a, '');
    assert.equal(ability.q[1].a, '');
    assert.ok(ability.q.every(({ p, i, pPrompt, iPrompt }) => p === '' && i === '' && !!pPrompt && !!iPrompt));
  });

  it('rejects legacy image descriptions in p/i and requires both prompt fields', async (): Promise<void> => {
    const concept = { id: 18, title: 'Mark the point', description: 'Mark a point on a number line.' } as BookConcept;
    const otherwiseValid = {
      h: concept.title, i: '', t: 3,
      q: [
        { h: 'Mark the first location.', a: '', p: '', i: '', pPrompt: 'First number line.', iPrompt: 'First completed line.' },
        { h: 'Mark a second location.', a: '', p: '', i: '', pPrompt: 'Second number line.', iPrompt: 'Second completed line.' }
      ]
    };
    let repairContext = '';
    const runner: AbilityWorkflowJsonRunner = async (_prompt, parse, options) => {
      repairContext = options?.repairContext ?? '';
      const legacy = JSON.parse(JSON.stringify(otherwiseValid)) as typeof otherwiseValid;

      legacy.q[0].i = legacy.q[0].iPrompt;
      legacy.q[0].iPrompt = '';
      assert.throws(() => parse(JSON.stringify({ abilities: [legacy] })), /put image descriptions in pPrompt and iPrompt/);

      const missingPrompt = JSON.parse(JSON.stringify(otherwiseValid)) as typeof otherwiseValid;

      delete (missingPrompt.q[0] as Partial<typeof missingPrompt.q[0]>).pPrompt;
      assert.throws(() => parse(JSON.stringify({ abilities: [missingPrompt] })), /pPrompt and iPrompt are required strings/);

      return parse(JSON.stringify({ abilities: [otherwiseValid] }));
    };
    const ability = await generateConceptAbility('en', 'Number lines', concept, runner);

    assert.equal(ability.q[0].iPrompt, 'First completed line.');
    assert.equal(ability.q[0].i, '');
    assert.match(repairContext, /put the entire image prompt ONLY in iPrompt/);
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
