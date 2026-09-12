// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import type { Exercise } from '@slonigiraf/db';

import { parseAbilityBlueprints, parseBlueprintAbilities, parseBlueprintVisualPlans, runAtomicAbilityWorkflow, validateAbilityBlueprintEvidence } from './abilityWorkflow.js';

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

  it('runs planning and text through separate generation and audit passes before returning atomic conversions', async (): Promise<void> => {
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
    const abilities = JSON.stringify({
      abilities: [
        { exerciseId: 12, skillIndex: 0, ability: { h: 'Read an x-coordinate', i: '', q: [{ a: '<kx>2</kx>', h: 'Read the x-coordinate of point A.', i: '', p: '' }, { a: '<kx>-3</kx>', h: 'Read the x-coordinate of point B.', i: '', p: '' }], t: 3 } },
        { exerciseId: 12, skillIndex: 1, ability: { h: 'Calculate horizontal distance', i: '', q: [{ a: '<kx>3</kx>', h: 'Find the horizontal distance between <kx>x=2</kx> and <kx>x=5</kx>.', i: '', p: '' }, { a: '<kx>4</kx>', h: 'Find the horizontal distance between <kx>x=-1</kx> and <kx>x=3</kx>.', i: '', p: '' }], t: 3 } }
      ]
    });
    const visualPlan = JSON.stringify({
      plans: [{
        exerciseId: 12,
        imagePrompts: [
          { changesImage: false, i: '', p: 'Coordinate plane from -5 to 5 with point A at (2,1), labeled A.' },
          { changesImage: false, i: '', p: 'Coordinate plane from -5 to 5 with point B at (-3,2), labeled B.' }
        ],
        skillIndex: 0
      }]
    });
    const outputs = [plan, plan, abilities, abilities, visualPlan, visualPlan];
    const prompts: string[] = [];
    let index = 0;
    const result = await runAtomicAbilityWorkflow('en', 'Coordinates', [source], async (prompt, parse) => {
      prompts.push(prompt);

      return parse(outputs[index++]);
    });

    assert.equal(index, 6);
    assert.equal(result.length, 2);
    assert.equal(result[0].imagePrompts?.[0].p.includes('(2,1)'), true);
    assert.equal(result[1].imagePrompts, undefined);
    assert.match(prompts[0], /planning stage only/i);
    assert.match(prompts[1], /Audit an internal Ability plan/i);
    assert.match(prompts[3], /semantic quality gate/i);
    assert.match(prompts[5], /Audit the visual specifications/i);
  });

});
