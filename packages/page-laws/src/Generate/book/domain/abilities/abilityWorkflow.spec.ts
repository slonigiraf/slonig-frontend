// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import type { Exercise } from '@slonigiraf/db';

import { abilityGenerationRequestPrompt, assembleExerciseAbilityConversions, parseAbilityBlueprints, parseBlueprintAbilities, parseBlueprintVisualPlans, parseGeneratedAtomicAbility, generateExerciseAbility, runExerciseAbilityWorkflow, validateAbilityBlueprintEvidence } from './abilityWorkflow.js';

describe('one-Ability-per-Exercise workflow', (): void => {
  it('requires the two generated tasks to match source Exercise and Concept evidence', (): void => {
    const prompt = abilityGenerationRequestPrompt('en', 'Conversions', {
      id: 42,
      task: 'Convert whole kilometers to meters.',
      solution: 'Multiply by 1000.',
      sourceConcept: { title: 'Converting lengths', description: 'Convert kilometer measurements to meters by multiplying by 1000.' }
    });

    assert.match(prompt, /For EACH of the two generated tasks/);
    assert.match(prompt, /sourceConcept/);
    assert.match(prompt, /only specific input parameters/);
    assert.match(prompt, /Do NOT generate, copy, or return an Ability title/);
    assert.match(prompt, /NO Ability title field/);
    assert.match(prompt, /"ability":\{"i":"","t":3,"q":\[/);
    assert.doesNotMatch(prompt, /"h":"<exact sourceConcept.title>"/);
  });

  it('passes Concept context and sets the title in code without requesting an AI title', async (): Promise<void> => {
    const exercise = {
      conceptId: 12, description: 'Convert <kx>3</kx> km to m.', id: 42,
      solution: '<kx>3000</kx> m', title: 'Old exercise title'
    } as Exercise;
    const concept = { title: 'Converting DNA & RNA distances', description: 'Explain and apply conversions.' };
    const generated = await generateExerciseAbility('en', 'Conversions', exercise, (prompt, parse) => {
      assert.match(prompt, /"sourceConcept":\{"title":"Converting DNA & RNA distances","description":"Explain and apply conversions\."\}/);
      assert.match(prompt, /"task":"Convert/);
      assert.match(prompt, /"ability":\{"i":"","t":3,"q":\[/);
      return Promise.resolve(parse(JSON.stringify({
        abilities: [{ exerciseId: 42, skillIndex: 0, ability: {
          i: '', t: 3,
          q: [
            { h: 'Convert <kx>2</kx> km to m.', a: '<kx>2000</kx> m', p: '', i: '' },
            { h: 'Convert <kx>4</kx> km to m.', a: '<kx>4000</kx> m', p: '', i: '' }
          ]
        }, imagePrompts: [{ changesImage: false, p: '', i: '' }, { changesImage: false, p: '', i: '' }] }]
      })));
    }, concept);

    assert.equal(generated.length, 1);
    assert.equal(generated[0].ability.h, concept.title);
  });

  it('ignores an unsolicited AI title and preserves even a long source Concept title verbatim', (): void => {
    const exercise = { description: 'Convert units.', id: 42, title: 'Fallback exercise title', solution: 'Multiply.' } as Exercise;
    const concept = {
      title: 'An unusually long Original Concept Title That Must Be Kept Exactly As Written Regardless Of Any Length Limits Or Sentence Case Formatting',
      description: 'The concept scope for this practice.'
    };
    const response = JSON.stringify({
      abilities: [{ exerciseId: 42, skillIndex: 0, ability: {
        h: 'A completely invented model title', i: '', t: 3,
        q: [
          { h: 'Convert <kx>2</kx> km to m.', a: '<kx>2000</kx> m', p: '', i: '' },
          { h: 'Convert <kx>4</kx> km to m.', a: '<kx>4000</kx> m', p: '', i: '' }
        ]
      }, imagePrompts: [{ changesImage: false, p: '', i: '' }, { changesImage: false, p: '', i: '' }] }]
    });

    assert.equal(parseGeneratedAtomicAbility(response, exercise, concept)[0].ability.h, concept.title);
    assert.equal(parseGeneratedAtomicAbility(response, exercise)[0].ability.h, exercise.title);
  });

  it('requires exactly one Ability blueprint for each source Exercise', (): void => {
    assert.throws(() => parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 7,
        skills: [
          { input: 'a plotted point', method: 'read its coordinates from the axes', operation: 'read coordinates', output: 'an ordered pair', questionVisual: 'required', solutionVisual: 'none', title: 'Read coordinates of a plotted point' },
          { input: 'two ordered pairs', method: 'subtract corresponding coordinates', operation: 'calculate coordinate differences', output: 'horizontal and vertical differences', questionVisual: 'none', solutionVisual: 'none', title: 'Calculate coordinate differences' }
        ]
      }]
    }), [7]), /exactly one Ability definition/i);

    const result = parseAbilityBlueprints(JSON.stringify({
      plans: [{
        exerciseId: 7,
        skills: [{ input: 'a plotted point and target x-value', method: 'read the point and compute the requested distance', operation: 'read coordinates and calculate horizontal distance', output: 'the requested coordinate-derived result', questionVisual: 'required', solutionVisual: 'none', title: 'Read a point and calculate horizontal distance' }]
      }]
    }), [7]);

    assert.equal(result.length, 1);
    assert.deepEqual(result.map(({ exerciseId, skillIndex }) => [exerciseId, skillIndex]), [[7, 0]]);
    assert.equal(result[0].questionVisual, 'required');
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

    assert.equal(assembleExerciseAbilityConversions(blueprints, abilities, distinctPlans).length, 1);

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
      () => assembleExerciseAbilityConversions(blueprints, abilities, duplicatePlans),
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
      description: 'Read the supplied value.',
      id: 11,
      solution: '4',
      title: 'Read value'
    } as Exercise;

    assert.throws(() => validateAbilityBlueprintEvidence(blueprints, [source]), /invented a question visual/i);
  });

  it('enforces source visual evidence without requiring a returned blueprint', (): void => {
    const source = {
      description: 'Read the supplied graph value.',
      id: 111,
      imageDescription: 'A graph with one marked value.',
      solution: 'Read the marked value.',
      title: 'Read graph'
    } as Exercise;
    const result = parseGeneratedAtomicAbility(JSON.stringify({
      abilities: [{
        exerciseId: 111,
        skillIndex: 0,
        ability: {
          i: '',
          q: [
            { a: '<kx>3</kx>', h: 'Read the value shown.', i: '', p: '' },
            { a: '<kx>7</kx>', h: 'Read the value shown.', i: '', p: '' }
          ],
          t: 3
        },
        imagePrompts: [
          { changesImage: false, i: 'Unneeded highlighted answer.', p: 'Graph with the mark at 3.' },
          { changesImage: true, i: 'Another unneeded answer visual.', p: 'Graph with the mark at 7.' }
        ]
      }]
    }), source);

    assert.equal(result.length, 1);
    assert.equal(result[0].ability.h, source.title);
    assert.deepEqual(result[0].imagePrompts, [
      { changesImage: false, i: '', p: 'Graph with the mark at 3.' },
      { changesImage: false, i: '', p: 'Graph with the mark at 7.' }
    ]);
  });

  it('rejects invented visuals for a text-only source without a blueprint', (): void => {
    const source = {
      description: 'Convert 25 centimeters to meters.',
      id: 112,
      solution: '0.25 m',
      title: 'Convert units'
    } as Exercise;

    assert.throws(() => parseGeneratedAtomicAbility(JSON.stringify({
      abilities: [{
        exerciseId: 112,
        skillIndex: 0,
        ability: {
          h: 'Convert centimeters to meters',
          i: '',
          q: [
            { a: '<kx>0.25</kx> m', h: 'Convert <kx>25</kx> cm to m.', i: '', p: '' },
            { a: '<kx>0.8</kx> m', h: 'Convert <kx>80</kx> cm to m.', i: '', p: '' }
          ],
          t: 3
        },
        imagePrompts: [
          { changesImage: false, i: '', p: 'Decorative ruler.' },
          { changesImage: false, i: '', p: '' }
        ]
      }]
    }), source), /text-only Ability must not create visual prompts/i);
  });

  it('uses one bounded semantic request per source Exercise without decomposing it', async (): Promise<void> => {
    const source = {
      description: 'Read a plotted point, then calculate the horizontal distance to x = 5.',
      id: 12,
      imageDescription: 'A coordinate plane with point A plotted.',
      solution: 'Read the x-coordinate, then subtract it from 5.',
      title: 'Coordinate task'
    } as Exercise;
    const generated = JSON.stringify({
      abilities: [
        {
          exerciseId: 12,
          skillIndex: 0,
          ability: { i: '', q: [{ a: '<kx>3</kx>', h: 'Read point A, then find its horizontal distance to <kx>x=5</kx>.', i: '', p: '' }, { a: '<kx>6</kx>', h: 'Read point B, then find its horizontal distance to <kx>x=3</kx>.', i: '', p: '' }], t: 3 },
          imagePrompts: [
            { changesImage: false, i: '', p: 'Coordinate plane from -5 to 5 with point A at (2,1), labeled A.' },
            { changesImage: false, i: '', p: 'Coordinate plane from -5 to 5 with point B at (-3,2), labeled B.' }
          ]
        }
      ]
    });
    const prompts: string[] = [];
    const options: Array<{ maxOutputTokens?: number; repairContext?: string; validationCycles?: number } | undefined> = [];
    let index = 0;
    const result = await runExerciseAbilityWorkflow('en', 'Coordinates', [source], async (prompt, parse, runOptions) => {
      prompts.push(prompt);
      options.push(runOptions);
      index++;

      return parse(generated);
    });

    assert.equal(index, 1);
    assert.equal(result.length, 1);
    assert.equal(result[0].imagePrompts?.[0].p.includes('(2,1)'), true);
    assert.match(prompts[0], /single pass/i);
    assert.match(prompts[0], /silently determine/i);
    assert.equal(prompts[0].includes('\"blueprint\":'), false);
    assert.equal(prompts[0].includes('then calculate the horizontal distance'), true);
    assert.equal(prompts.some((prompt) => /Draft plan:|Candidates:|Draft visual plans:/i.test(prompt)), false);
    assert.equal(options[0]?.validationCycles, 1);
    assert.equal(options[0]?.maxOutputTokens, 3_200);
  });

  it('keeps multi-source workflow requests source-bounded', async (): Promise<void> => {
    const sources = [21, 22].map((id) => ({
      description: `Convert ${id} centimeters to meters.`,
      id,
      solution: `Divide ${id} by 100.`,
      title: `Conversion ${id}`
    })) as Exercise[];
    const prompts: string[] = [];
    let call = 0;

    const result = await runExerciseAbilityWorkflow('en', 'Units', sources, async (prompt, parse) => {
      prompts.push(prompt);
      const id = sources[call].id as number;

      call++;

      return parse(JSON.stringify({ abilities: [{ exerciseId: id, skillIndex: 0, ability: { h: 'Convert centimeters to meters', i: '', q: [{ a: '<kx>0.25</kx> m', h: 'Convert <kx>25</kx> cm to m.', i: '', p: '' }, { a: '<kx>0.8</kx> m', h: 'Convert <kx>80</kx> cm to m.', i: '', p: '' }], t: 3 }, imagePrompts: [{ changesImage: false, i: '', p: '' }, { changesImage: false, i: '', p: '' }] }] }));
    });

    assert.equal(result.length, 2);
    assert.equal(prompts.length, 2);
    assert.equal(prompts[0].includes('"id":22'), false);
    assert.equal(prompts[1].includes('"id":21'), false);
  });

});
