// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import type { Exercise } from '@slonigiraf/db';

import { abilityGenerationRequestPrompt, parseGeneratedAtomicAbility, generateExerciseAbility } from './abilityWorkflow.js';

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
      assert.match(prompt, /safe concrete inputs, contexts, spatial arrangements/);
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
      const result = await generateExerciseAbility('en', 'Coordinates', source, async (prompt, parse, runOptions) => {
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
});
