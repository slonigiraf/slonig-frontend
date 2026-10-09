// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Exercise } from '@slonigiraf/db';
import type OpenAI from 'openai';

import { abilityRepairInput, exerciseRepairInput, requestAbilityRepairResult, type StoredAbility } from './abilityProcessing.js';

describe('Ability repair source evidence', (): void => {
  it('always includes both source Exercise and source Concept without needing an embedding alert', (): void => {
    const record: StoredAbility = { ability: null, content: '{}', id: 'ability-1', moduleId: 'book-1-exercise-7' };
    const sourceExercise = { conceptId: 3, description: 'Convert kilometers to meters.', id: 7, title: 'Convert lengths', solution: 'Multiply by 1000.' } as Exercise;
    const sourceConcept = { description: 'One kilometer contains 1000 meters.', title: 'Kilometers in meters' };
    const input = abilityRepairInput('en', [record], 'Measurements', 11, undefined,
      new Map([[record.moduleId, sourceExercise]]), new Map([[3, sourceConcept]])) as { abilities: Array<{ sourceConcept?: typeof sourceConcept; sourceExercise?: unknown }> };

    assert.deepEqual(input.abilities[0].sourceConcept, sourceConcept);
    assert.ok(input.abilities[0].sourceExercise);
  });
  it('includes the source Concept in Fix exercises input', (): void => {
    const exercise = { conceptId: 3, description: 'Convert distance.', id: 7, title: 'Old title', solution: 'Multiply.' } as Exercise;
    const concept = { title: 'Distance conversion', description: 'Convert km to m.' };
    const input = exerciseRepairInput('en', [exercise], 'Measurements', 11, new Map([[3, concept]])) as { exercises: Array<{ sourceConcept: typeof concept }> };

    assert.deepEqual(input.exercises[0].sourceConcept, concept);
  });
});


describe('Ability no-op repair recovery', (): void => {
  const createAbility = () => ({
    h: 'Read equal groups', i: '', t: 3,
    q: [
      { h: 'Count <kx>3</kx> groups.', a: '<kx>6</kx>', p: 'linked-visual', i: '', pPrompt: 'Three groups of two' },
      { h: 'Count <kx>4</kx> groups.', a: '<kx>8</kx>', p: '', i: '' }
    ]
  });
  const createRecord = (id: string): StoredAbility => {
    const ability = createAbility();

    return { ability, content: JSON.stringify(ability), id, moduleId: 'book-1-exercise-7' };
  };
  const response = (value: unknown) => ({ choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }] });

  it('retries only unchanged Abilities and retains other correct repairs', async (): Promise<void> => {
    const batch = [createRecord('first'), createRecord('second')];
    const visualOnly = { ...createAbility(), q: createAbility().q.map((question) => ({ ...question, p: 'AI cannot overwrite this image', pPrompt: 'AI cannot replace original metadata' })) };
    const fixedSecond = createAbility();

    fixedSecond.q[1].a = '<kx>8</kx> objects';
    const fixedFirst = createAbility();

    fixedFirst.q[0].h = 'How many objects are in <kx>3</kx> groups of <kx>2</kx>?';
    const replies = [
      response({ duplicatePairs: [], reviews: [
        { index: 0, hasErrors: true, errors: ['Incorrect image'], ability: visualOnly },
        { index: 1, hasErrors: true, errors: ['Incomplete answer'], ability: fixedSecond }
      ] }),
      response({ duplicatePairs: [], reviews: [{ index: 0, hasErrors: true, errors: ['Missing question detail'], ability: fixedFirst }] })
    ];
    const prompts: string[] = [];
    const client = { chat: { completions: { create: async (request: { messages: Array<{ content: string }> }) => {
      prompts.push(request.messages[1].content);

      return replies.shift();
    } } } } as unknown as OpenAI;
    const result = await requestAbilityRepairResult(client, 'test-model', 'system', abilityRepairInput('en', batch), batch);

    assert.equal(prompts.length, 2);
    assert.match(prompts[1], /REPAIR TASK, NOT ANOTHER AUDIT/);
    assert.equal(result.unresolvedReviews, undefined);
    assert.equal(result.reviews.length, 2);
    assert.equal(result.reviews[0].ability?.q[0].h, fixedFirst.q[0].h);
    assert.equal(result.reviews[0].ability?.q[0].p, batch[0].ability?.q[0].p);
    assert.equal(result.reviews[0].ability?.q[0].pPrompt, batch[0].ability?.q[0].pPrompt);
    assert.equal(result.reviews[1].ability?.q[1].a, fixedSecond.q[1].a);
  });

  it('reports stubborn no-op diagnoses without losing valid chapter repairs', async (): Promise<void> => {
    const batch = [createRecord('first'), createRecord('second')];
    const corrected = createAbility();

    corrected.q[0].a = '<kx>6</kx> objects';
    let calls = 0;
    const initial = { duplicatePairs: [], reviews: [
      { index: 0, hasErrors: true, errors: ['A wrong visual'], ability: createAbility() },
      { index: 1, hasErrors: true, errors: ['Answer incomplete'], ability: corrected }
    ] };
    const retry = { duplicatePairs: [], reviews: [{ index: 0, hasErrors: true, errors: ['A wrong visual'], ability: createAbility() }] };
    const client = { chat: { completions: { create: async () => {
      calls++;

      return response(calls === 1 ? initial : retry);
    } } } } as unknown as OpenAI;
    const result = await requestAbilityRepairResult(client, 'test-model', 'system', abilityRepairInput('en', batch), batch);

    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].index, 1);
    assert.deepEqual(result.unresolvedReviews, [{ errors: ['A wrong visual'], index: 0 }]);
  });
});
