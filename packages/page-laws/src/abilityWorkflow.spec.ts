// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import type { Exercise } from '@slonigiraf/db';

import { assembleAtomicAbilityConversions, parseAbilityBlueprints, parseBlueprintAbilities, parseBlueprintVisualPlans, runAtomicAbilityWorkflow, validateAbilityBlueprintEvidence } from './abilityWorkflow.js';

describe('atomic Ability workflow', (): void => {
  it('allows one source Exercise to split into multiple atomic Ability blueprints', (): void => {
    const result = parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 7,
        skills: [
          { input: 'a plotted point', method: 'read its coordinates from the axes', operation: 'read coordinates', output: 'an ordered pair', questionVisual: 'required', solutionVisual: 'none', title: 'Read coordinates of a plotted point' },
          { input: 'two ordered pairs', method: 'subtract corresponding coordinates', operation: 'calculate coordinate differences', output: 'horizontal and vertical differences', questionVisual: 'none', solutionVisual: 'none', title: 'Calculate coordinate differences' }
        ]
      }]
    }), [7]);

    assert.equal(result.length, 2);
    assert.deepEqual(result.map(({ exerciseId, skillIndex }) => [exerciseId, skillIndex]), [[7, 0], [7, 1]]);
    assert.equal(result[0].questionVisual, 'required');
    assert.equal(result[1].questionVisual, 'none');
  });

  it('rejects a modified solution visual when there is no question visual to modify', (): void => {
    assert.throws(() => parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 8,
        skills: [{ input: 'an ordered pair', method: 'plot by x then y', operation: 'plot a point', output: 'a plotted point', questionVisual: 'none', solutionVisual: 'modify-question', title: 'Plot an ordered pair' }]
      }]
    }), [8]));
  });

  it('enforces succinct learner-facing tasks and answers as a parser gate', (): void => {
    const blueprints = parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 9,
        skills: [{ input: 'a distance in whole kilometers', method: 'multiply by 1000', operation: 'convert kilometers to meters', output: 'distance in meters', questionVisual: 'none', solutionVisual: 'none', title: 'Convert kilometers to meters' }]
      }]
    }), [9]);
    const concise = parseBlueprintAbilities(JSON.stringify({
      abilities: [{
        exerciseId: 9,
        skillIndex: 0,
        ability: {
          h: 'Convert kilometers to meters',
          i: '',
          q: [
            { a: '<kx>3000</kx> m', h: 'Convert <kx>3</kx> km to m.', i: '', p: '' },
            { a: '<kx>7000</kx> m', h: 'Convert <kx>7</kx> km to m.', i: '', p: '' }
          ],
          t: 3
        }
      }]
    }), blueprints);

    assert.equal(concise.length, 1);

    const verboseAnswer = Array.from({ length: 70 }, () => 'word').join(' ');

    assert.throws(() => parseBlueprintAbilities(JSON.stringify({
      abilities: [{
        exerciseId: 9,
        skillIndex: 0,
        ability: {
          h: 'Convert kilometers to meters',
          i: '',
          q: [
            { a: verboseAnswer, h: 'Convert <kx>3</kx> km to m.', i: '', p: '' },
            { a: '<kx>7000</kx> m', h: 'Convert <kx>7</kx> km to m.', i: '', p: '' }
          ],
          t: 3
        }
      }]
    }), blueprints));
  });

  it('requires visual plans to follow the audited visual contract', (): void => {
    const blueprints = parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 10,
        skills: [{ input: 'a coordinate plane with a shown point', method: 'move the point to the requested coordinate', operation: 'move a plotted point', output: 'the updated coordinate plane', questionVisual: 'required', solutionVisual: 'modify-question', title: 'Move a plotted point' }]
      }]
    }), [10]);
    const result = parseBlueprintVisualPlans(JSON.stringify({
      plans: [{
        exerciseId: 10,
        imagePrompts: [
          { changesImage: true, i: 'The same plane with point A moved to (4,2).', p: 'A coordinate plane with point A at (1,2).' },
          { changesImage: true, i: 'The same plane with point A moved to (-2,3).', p: 'A coordinate plane with point A at (3,3).' }
        ],
        skillIndex: 0
      }]
    }), blueprints);

    assert.equal(result[0].imagePrompts[0].changesImage, true);
    assert.match(result[0].imagePrompts[0].i, /same plane/i);
  });

  it('discards an unnecessary solution visual instead of failing a text-answer Ability', (): void => {
    const blueprints = parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 101,
        skills: [{ input: 'a shown graph', method: 'read the plotted value', operation: 'read a graph value', output: 'a number', questionVisual: 'required', solutionVisual: 'none', title: 'Read a graph value' }]
      }]
    }), [101]);
    const result = parseBlueprintVisualPlans(JSON.stringify({
      plans: [{
        exerciseId: 101,
        imagePrompts: [
          { changesImage: false, i: 'Decorative solution highlighting the answer.', p: 'Graph with the required plotted value.' },
          { changesImage: true, i: 'Another unnecessary answer image.', p: 'Graph with a different plotted value.' }
        ],
        skillIndex: 0
      }]
    }), blueprints);

    assert.deepEqual(result[0].imagePrompts, [
      { changesImage: false, i: '', p: 'Graph with the required plotted value.' },
      { changesImage: false, i: '', p: 'Graph with a different plotted value.' }
    ]);
  });

  it('accepts repeated visual-task wording when the two required visuals contain different concrete inputs', (): void => {
    const blueprints = parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 102,
        skills: [{ input: 'a shown gauge', method: 'read the marked value', operation: 'read a gauge value', output: 'a number', questionVisual: 'required', solutionVisual: 'none', title: 'Read a gauge value' }]
      }]
    }), [102]);
    const abilities = parseBlueprintAbilities(JSON.stringify({
      abilities: [{
        exerciseId: 102,
        skillIndex: 0,
        ability: {
          h: 'Read a gauge value',
          i: '',
          q: [
            { a: '<kx>3</kx>', h: 'Read the value shown.', i: '', p: '' },
            { a: '<kx>7</kx>', h: 'Read the value shown.', i: '', p: '' }
          ],
          t: 3
        }
      }]
    }), blueprints);
    const distinctPlans = parseBlueprintVisualPlans(JSON.stringify({
      plans: [{
        exerciseId: 102,
        imagePrompts: [
          { changesImage: false, i: '', p: 'Gauge from 0 to 10 with the needle pointing at 3.' },
          { changesImage: false, i: '', p: 'Gauge from 0 to 10 with the needle pointing at 7.' }
        ],
        skillIndex: 0
      }]
    }), blueprints);

    assert.equal(assembleAtomicAbilityConversions(blueprints, abilities, distinctPlans).length, 1);

    const duplicatePlans = parseBlueprintVisualPlans(JSON.stringify({
      plans: [{
        exerciseId: 102,
        imagePrompts: [
          { changesImage: false, i: '', p: 'Gauge from 0 to 10 with the needle pointing at 3.' },
          { changesImage: false, i: '', p: 'Gauge from 0 to 10 with the needle pointing at 3.' }
        ],
        skillIndex: 0
      }]
    }), blueprints);

    assert.throws(
      () => assembleAtomicAbilityConversions(blueprints, abilities, duplicatePlans),
      /different concrete input parameters/i
    );
  });

  it('rejects invented visual dependencies that are not supported by the repaired source Exercise', (): void => {
    const blueprints = parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 11,
        skills: [{ input: 'a shown graph', method: 'read the plotted value', operation: 'read a graph value', output: 'a number', questionVisual: 'required', solutionVisual: 'none', title: 'Read a graph value' }]
      }]
    }), [11]);
    const source = {
      abilityMode: 'reasoning',
      description: 'Read the supplied value.',
      id: 11,
      solution: '4',
      title: 'Read value'
    } as Exercise;

    assert.throws(() => validateAbilityBlueprintEvidence(blueprints, [source]), /invented a question visual/i);
  });

  it('uses two bounded semantic requests per source Exercise', async (): Promise<void> => {
    const source = {
      abilityMode: 'reasoning',
      description: 'Read a plotted point, then calculate the horizontal distance to x = 5.',
      id: 12,
      imageDescription: 'A coordinate plane with point A plotted.',
      solution: 'Read the x-coordinate, then subtract it from 5.',
      title: 'Coordinate task'
    } as Exercise;
    const plan = JSON.stringify({
      plans: [{
        exerciseId: 12,
        skills: [
          { input: 'a coordinate plane with one plotted point', method: 'read x from the horizontal axis', operation: 'read an x-coordinate', output: 'an x-coordinate', questionVisual: 'required', solutionVisual: 'none', title: 'Read an x-coordinate' },
          { input: 'two x-coordinates', method: 'subtract the smaller x-value from the larger', operation: 'calculate horizontal distance', output: 'a distance', questionVisual: 'none', solutionVisual: 'none', title: 'Calculate horizontal distance' }
        ]
      }]
    });
    const materialized = JSON.stringify({
      abilities: [
        {
          exerciseId: 12,
          skillIndex: 0,
          ability: { h: 'Read an x-coordinate', i: '', q: [{ a: '<kx>2</kx>', h: 'Read the x-coordinate of point A.', i: '', p: '' }, { a: '<kx>-3</kx>', h: 'Read the x-coordinate of point B.', i: '', p: '' }], t: 3 },
          imagePrompts: [
            { changesImage: false, i: '', p: 'Coordinate plane from -5 to 5 with point A at (2,1), labeled A.' },
            { changesImage: false, i: '', p: 'Coordinate plane from -5 to 5 with point B at (-3,2), labeled B.' }
          ]
        },
        {
          exerciseId: 12,
          skillIndex: 1,
          ability: { h: 'Calculate horizontal distance', i: '', q: [{ a: '<kx>3</kx>', h: 'Find the horizontal distance between <kx>x=2</kx> and <kx>x=5</kx>.', i: '', p: '' }, { a: '<kx>4</kx>', h: 'Find the horizontal distance between <kx>x=-1</kx> and <kx>x=3</kx>.', i: '', p: '' }], t: 3 },
          imagePrompts: [
            { changesImage: false, i: '', p: '' },
            { changesImage: false, i: '', p: '' }
          ]
        }
      ]
    });
    const outputs = [plan, materialized];
    const prompts: string[] = [];
    const options: Array<{ maxOutputTokens?: number; repairContext?: string; validationCycles?: number } | undefined> = [];
    let index = 0;
    const result = await runAtomicAbilityWorkflow('en', 'Coordinates', [source], async (prompt, parse, runOptions) => {
      prompts.push(prompt);
      options.push(runOptions);

      return parse(outputs[index++]);
    });

    assert.equal(index, 2);
    assert.equal(result.length, 2);
    assert.equal(result[0].imagePrompts?.[0].p.includes('(2,1)'), true);
    assert.equal(result[1].imagePrompts, undefined);
    assert.match(prompts[0], /Planning only/i);
    assert.match(prompts[1], /Materialize the exact atomic plan/i);
    assert.equal(prompts[1].includes('then calculate the horizontal distance'), false);
    assert.equal(prompts.some((prompt) => /Draft plan:|Candidates:|Draft visual plans:/i.test(prompt)), false);
    assert.equal(options[0]?.validationCycles, 1);
    assert.equal(options[1]?.validationCycles, 1);
    assert.equal(options[0]?.maxOutputTokens, 1_800);
    assert.equal(options[1]?.maxOutputTokens, 4_500);
  });

  it('keeps multi-source workflow requests source-bounded', async (): Promise<void> => {
    const sources = [21, 22].map((id) => ({
      abilityMode: 'reasoning',
      description: `Convert ${id} centimeters to meters.`,
      id,
      solution: `Divide ${id} by 100.`,
      title: `Conversion ${id}`
    })) as Exercise[];
    const prompts: string[] = [];
    let call = 0;

    const result = await runAtomicAbilityWorkflow('en', 'Units', sources, async (prompt, parse) => {
      prompts.push(prompt);
      const id = call < 2 ? 21 : 22;
      const isPlan = call % 2 === 0;

      call++;

      if (isPlan) {
        return parse(JSON.stringify({ plans: [{ exerciseId: id, skills: [{ input: 'centimeters', method: 'divide by 100', operation: 'convert centimeters to meters', output: 'meters', questionVisual: 'none', solutionVisual: 'none', title: 'Convert centimeters to meters' }] }] }));
      }

      return parse(JSON.stringify({ abilities: [{ exerciseId: id, skillIndex: 0, ability: { h: 'Convert centimeters to meters', i: '', q: [{ a: '<kx>0.25</kx> m', h: 'Convert <kx>25</kx> cm to m.', i: '', p: '' }, { a: '<kx>0.8</kx> m', h: 'Convert <kx>80</kx> cm to m.', i: '', p: '' }], t: 3 }, imagePrompts: [{ changesImage: false, i: '', p: '' }, { changesImage: false, i: '', p: '' }] }] }));
    });

    assert.equal(result.length, 2);
    assert.equal(prompts.length, 4);
    assert.equal(prompts[0].includes('"id":22'), false);
    assert.equal(prompts[1].includes('"id":22'), false);
    assert.equal(prompts[2].includes('"id":21'), false);
    assert.equal(prompts[3].includes('"id":21'), false);
  });

});
