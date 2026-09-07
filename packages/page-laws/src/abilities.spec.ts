// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import type { GeneratedAbility } from './abilities.js';

import { strict as assert } from 'node:assert';

import { createAbilityFromExerciseVariation, parseAbilityRepairResult, parseAbilityRepairReviews, parseExerciseTemplateVariations, parseGeneratedAbilities, parseGeneratedExerciseAbilities, parseStoredAbility } from './abilities.js';
import { conceptsToSkillsPrompt, divideExerciseTemplatesPrompt, fixAbilitiesPrompt, skillListPrompt, skillsToExercisesPrompt, skillsToExerciseTemplatesPrompt, sourcesToSkillsPrompt } from './constants.js';

function createSkill (): GeneratedAbility {
  return {
    h: 'Convert whole kilometers to meters',
    i: '',
    q: [
      { a: '2 × 1000 = 2000 m.', h: 'Convert 2 km to m.', i: '', p: '' },
      { a: '5 × 1000 = 5000 m.', h: 'Convert 5 km to m.', i: '', p: '' }
    ],
    t: 3
  };
}

describe('generated abilities', (): void => {
  it('preserves the original skill and exercise fields without adding metadata', (): void => {
    const skill = createSkill();
    const [parsed] = parseGeneratedAbilities(JSON.stringify([skill]), 1);

    assert.deepEqual(parsed, skill);
    assert.deepEqual(Object.keys(parsed).sort(), ['h', 'i', 'q', 't']);
    assert.deepEqual(Object.keys(parsed.q[0]).sort(), ['a', 'h', 'i', 'p']);
  });

  it('parses indexed Ability repair reviews and only returns a replacement for errors', (): void => {
    const original = createSkill();
    const fixed = { ...createSkill(), q: [
      { ...createSkill().q[0], a: '2 × 1000 = 2000 m.' },
      { ...createSkill().q[1], a: '5 × 1000 = 5000 m.' }
    ] };

    fixed.q[1].a = '5 km × 1000 = 5000 m.';

    const reviews = parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { errors: [], hasErrors: false, index: 0 },
      { ability: fixed, errors: ['The second solution omitted its source unit.'], hasErrors: true, index: 1 }
    ] }), [original, original]);

    assert.deepEqual(reviews[0], { errors: [], hasErrors: false, index: 0 });
    assert.equal(reviews[1].hasErrors, true);
    assert.deepEqual(reviews[1].ability, fixed);
  });

  it('parses chapter duplicate Ability pairs and rejects unsafe deletion pairs', (): void => {
    const original = createSkill();
    const result = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedAbilityId: 'ability-2', keptAbilityId: 'ability-1' }],
      reviews: []
    }), [original, original], ['ability-1', 'ability-2']);

    assert.deepEqual(result, { duplicatePairs: [{ deletedAbilityId: 'ability-2', keptAbilityId: 'ability-1' }], reviews: [] });
    assert.throws(() => parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedAbilityId: 'other-chapter-id', keptAbilityId: 'ability-1' }],
      reviews: []
    }), [original, original], ['ability-1', 'ability-2']));
    assert.throws(() => parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [
        { deletedAbilityId: 'ability-2', keptAbilityId: 'ability-1' },
        { deletedAbilityId: 'ability-2', keptAbilityId: 'ability-1' }
      ],
      reviews: []
    }), [original, original], ['ability-1', 'ability-2']));
    assert.throws(() => parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [{ deletedAbilityId: 'ability-1', keptAbilityId: 'ability-2' }],
      reviews: []
    }), [original, original], ['ability-1', 'ability-2']));
  });

  it('accepts partial Ability repair responses and treats omitted indexes as unchanged', (): void => {
    const original = createSkill();
    const fixed = { ...createSkill(), q: createSkill().q.map((exercise) => ({ ...exercise })) };

    fixed.q[0].a = 'Corrected answer.';

    const reviews = parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { ability: fixed, errors: ['The first answer was incorrect.'], hasErrors: true, index: 2 }
    ] }), [original, original, original, original, original]);

    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].index, 2);
    assert.equal(reviews[0].hasErrors, true);
    assert.deepEqual(parseAbilityRepairReviews(JSON.stringify({ reviews: [] }), [original, original]), []);
  });

  it('ignores extra out-of-range Ability reviews without rejecting the requested batch', (): void => {
    const original = createSkill();
    const fixed = { ...createSkill(), q: createSkill().q.map((exercise) => ({ ...exercise })) };

    fixed.q[1].a = 'Corrected answer.';

    const reviews = parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { ability: fixed, errors: ['The second answer was incorrect.'], hasErrors: true, index: 1 },
      { errors: [], hasErrors: false, index: 5 }
    ] }), [original, original, original, original, original]);

    assert.equal(reviews.length, 1);
    assert.equal(reviews[0].index, 1);
  });

  it('preserves existing Ability linkage fields while applying a repair', (): void => {
    const original = {
      ...createSkill(),
      i: 'ability-link',
      q: createSkill().q.map((exercise, index) => ({ ...exercise, i: `exercise-link-${index}`, p: `prompt-link-${index}` }))
    };
    const candidate = {
      ...createSkill(),
      i: 'ai-must-not-change-this',
      q: createSkill().q.map((exercise) => ({ ...exercise, a: `${exercise.a} Corrected.`, i: 'changed', p: 'changed' }))
    };
    const [review] = parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { ability: candidate, errors: ['Answers need correction.'], hasErrors: true, index: 0 }
    ] }), [original]);

    assert.equal(review.ability?.i, original.i);
    assert.equal(review.ability?.q[0].i, original.q[0].i);
    assert.equal(review.ability?.q[0].p, original.q[0].p);
    assert.match(review.ability?.q[0].a ?? '', /Corrected/);
  });

  it('requires malformed stored Ability JSON to be identified and repaired', (): void => {
    const fixed = createSkill();

    assert.throws(() => parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { errors: [], hasErrors: false, index: 0 }
    ] }), [null]));

    assert.deepEqual(parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { ability: fixed, errors: ['Stored Ability JSON is malformed.'], hasErrors: true, index: 0 }
    ] }), [null])[0].ability, fixed);
  });

  it('rejects contradictory or ineffective Ability repairs', (): void => {
    const original = createSkill();

    assert.throws(() => parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { errors: ['Problem found.'], hasErrors: false, index: 0 }
    ] }), [original]));
    assert.throws(() => parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { ability: original, errors: ['Problem found.'], hasErrors: true, index: 0 }
    ] }), [original]));
    assert.throws(() => parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { errors: [], hasErrors: false, index: 0 },
      { errors: [], hasErrors: false, index: 0 }
    ] }), [original, original]));
  });

  it('keeps valid partial Exercise-to-Ability conversions keyed by source Exercise id', (): void => {
    const first = createSkill();
    const third = { ...createSkill(), h: 'A third exercise skill' };
    const parsed = parseGeneratedExerciseAbilities(JSON.stringify({
      abilities: [
        { ability: first, exerciseId: 11 },
        { ability: { ...createSkill(), q: [] }, exerciseId: 12 },
        { ability: third, exerciseId: 13 }
      ]
    }), [11, 12, 13]);

    assert.deepEqual(parsed, [
      { ability: first, exerciseId: 11 },
      { ability: third, exerciseId: 13 }
    ]);
  });

  it('accepts positional partial legacy Ability arrays so omitted trailing Exercises can be retried', (): void => {
    const first = createSkill();
    const second = { ...createSkill(), h: 'A second exercise skill' };

    assert.deepEqual(parseGeneratedExerciseAbilities(JSON.stringify([first, second]), [21, 22, 23]), [
      { ability: first, exerciseId: 21 },
      { ability: second, exerciseId: 22 }
    ]);
  });

  it('ignores duplicate and unexpected Exercise ids instead of corrupting pairings', (): void => {
    const first = createSkill();
    const duplicate = { ...createSkill(), h: 'Duplicate' };
    const unexpected = { ...createSkill(), h: 'Unexpected' };

    assert.deepEqual(parseGeneratedExerciseAbilities(JSON.stringify({ abilities: [
      { exerciseId: 31, ability: first },
      { exerciseId: 31, ability: duplicate },
      { exerciseId: 99, ability: unexpected }
    ] }), [31, 32]), [{ ability: first, exerciseId: 31 }]);
  });

  it('accepts concrete nonmathematical exercises for one human skill', (): void => {
    const skill = {
      ...createSkill(),
      h: 'Identify the verb in a simple subject-verb sentence',
      q: [
        { a: 'The verb is "sing".', h: 'Identify the verb in "Birds sing".', i: '', p: '' },
        { a: 'The verb is "bark".', h: 'Identify the verb in "Dogs bark".', i: '', p: '' }
      ]
    };

    assert.deepEqual(parseGeneratedAbilities(JSON.stringify([skill])), [skill]);
  });

  for (const length of [0, 1, 3]) {
    it(`rejects a skill containing ${length} exercises`, (): void => {
      const skill = createSkill();

      skill.q = Array.from({ length }, (_, index) => skill.q[index % 2]);

      assert.throws(() => parseGeneratedAbilities(JSON.stringify([skill])));
    });
  }

  it('rejects missing, blank, and incorrectly typed skill fields', (): void => {
    const skill = createSkill();
    const invalid = [
      null,
      [],
      {},
      { ...skill, h: undefined },
      { ...skill, h: ' \n ' },
      { ...skill, i: undefined },
      { ...skill, i: 1 },
      { ...skill, t: '3' },
      { ...skill, t: 2 },
      { ...skill, q: {} }
    ];

    invalid.forEach((value) => assert.throws(() => parseGeneratedAbilities(JSON.stringify([value]))));
  });

  it('rejects missing, blank, and incorrectly typed exercise fields', (): void => {
    const skill = createSkill();
    const [first, second] = skill.q;
    const invalid = [
      null,
      [],
      {},
      { ...first, h: undefined },
      { ...first, h: '\t ' },
      { ...first, a: undefined },
      { ...first, a: ' \n ' },
      { ...first, a: 2000 },
      { ...first, p: undefined },
      { ...first, p: null },
      { ...first, i: undefined },
      { ...first, i: false }
    ];

    invalid.forEach((value) => assert.throws(() => parseGeneratedAbilities(JSON.stringify([{ ...skill, q: [value, second] }]))));
  });

  it('rejects repeated questions even when their answers differ', (): void => {
    const skill = createSkill();

    skill.q[1].h = skill.q[0].h;

    assert.throws(() => parseGeneratedAbilities(JSON.stringify([skill])));

    skill.q[1].h = '  Convert\n 2\t km to m.  ';

    assert.throws(() => parseGeneratedAbilities(JSON.stringify([skill])));
  });

  it('accepts an array or a transport envelope and preserves concept order', (): void => {
    const skills = [createSkill(), { ...createSkill(), h: 'A second concept' }];

    assert.deepEqual(parseGeneratedAbilities(JSON.stringify(skills), 2), skills);
    assert.deepEqual(parseGeneratedAbilities(JSON.stringify({ templates: skills }), 2), skills);
    assert.throws(() => parseGeneratedAbilities(JSON.stringify(skills), 1));
    assert.throws(() => parseGeneratedAbilities(JSON.stringify(skills), 3));
  });

  it('rejects empty, malformed, and unsupported response containers', (): void => {
    const invalid = ['', '{', 'null', '[]', '{}', '{"templates":[]}', '{"templates":{}}', JSON.stringify(createSkill())];

    invalid.forEach((content) => assert.throws(() => parseGeneratedAbilities(content)));
  });

  it('rejects the entire batch when a later template is invalid', (): void => {
    const skills = [createSkill(), { ...createSkill(), q: [] }];

    assert.throws(() => parseGeneratedAbilities(JSON.stringify(skills), 2));
  });

  it('preserves correctly escaped KaTeX in questions and answers', (): void => {
    const skill = {
      ...createSkill(),
      h: 'Add fractions with like denominators',
      q: [
        { a: '<kx>\\frac{3}{7}</kx>', h: 'Calculate <kx>\\frac{1}{7}+\\frac{2}{7}</kx>.', i: '', p: '' },
        { a: '<kx>\\frac{5}{7}</kx>', h: 'Calculate <kx>\\frac{2}{7}+\\frac{3}{7}</kx>.', i: '', p: '' }
      ]
    };

    assert.deepEqual(parseGeneratedAbilities(JSON.stringify([skill])), [skill]);
  });

  for (const [name, prompt] of Object.entries({ conceptsToSkillsPrompt, skillListPrompt })) {
    it(`accepts the original JSON array example in ${name}`, (): void => {
      const example = prompt.match(/^\[[\s\S]*?^\]/m)?.[0];

      assert(example, 'The prompt should include a JSON array example.');

      const templates = parseGeneratedAbilities(example);

      assert(templates.length > 0);
      templates.forEach((template) => {
        assert.deepEqual(Object.keys(template).sort(), ['h', 'i', 'q', 't']);
        assert.equal(template.q.length, 2);
        template.q.forEach((exercise) => assert.deepEqual(Object.keys(exercise).sort(), ['a', 'h', 'i', 'p']));
      });
    });
  }

  it('generates one language-constrained skill per source item', (): void => {
    assert.match(sourcesToSkillsPrompt, /exactly one/i);
    assert.match(sourcesToSkillsPrompt, /abstractly/i);
    assert.match(sourcesToSkillsPrompt, /Do not include, copy, or depend on specific examples/i);
    assert.match(sourcesToSkillsPrompt, /ISO 639-1 language code/i);
    assert.match(sourcesToSkillsPrompt, /"skills"/);
  });

  it('generates one transformation ExerciseTemplate per supplied skill block', (): void => {
    assert.match(skillsToExerciseTemplatesPrompt, /bookLanguage and blocks/i);
    assert.match(skillsToExerciseTemplatesPrompt, /exactly one exercise/i);
    assert.match(skillsToExerciseTemplatesPrompt, /exactly one output exercise per skill/i);
    assert.match(skillsToExerciseTemplatesPrompt, /transformation/i);
    assert.match(skillsToExerciseTemplatesPrompt, /step by step/i);
    assert.match(skillsToExerciseTemplatesPrompt, /linked concepts and exampleExercises/i);
    assert.match(skillsToExerciseTemplatesPrompt, /Match the structure, terminology, tone, and difficulty/i);
    assert.match(skillsToExerciseTemplatesPrompt, /strictly in bookLanguage/i);
    assert.match(skillsToExerciseTemplatesPrompt, /corresponding supplied skill\.id/i);
    assert.match(skillsToExerciseTemplatesPrompt, /<kx>/i);
    assert.doesNotMatch(skillsToExerciseTemplatesPrompt, /"title"/i);
  });

  it('divides multistep ExerciseTemplates without replacing their parents', (): void => {
    assert.match(divideExerciseTemplatesPrompt, /Do not change or return the parent/i);
    assert.match(divideExerciseTemplatesPrompt, /one additional, self-contained child/i);
    assert.match(divideExerciseTemplatesPrompt, /multiple substantive steps/i);
    assert.match(divideExerciseTemplatesPrompt, /empty templates array is valid/i);
    assert.doesNotMatch(divideExerciseTemplatesPrompt, /"title"/i);
  });

  it('requires the repair stage to detect all error classes and return indexed fixes', (): void => {
    assert.match(fixAbilitiesPrompt, /factual/i);
    assert.match(fixAbilitiesPrompt, /logical/i);
    assert.match(fixAbilitiesPrompt, /grammatical/i);
    assert.match(fixAbilitiesPrompt, /KaTeX/i);
    assert.match(fixAbilitiesPrompt, /hasErrors/i);
    assert.match(fixAbilitiesPrompt, /errors/i);
    assert.match(fixAbilitiesPrompt, /reviews/i);
    assert.match(fixAbilitiesPrompt, /partial reviews array/i);
    assert.match(fixAbilitiesPrompt, /duplicatePairs/i);
    assert.match(fixAbilitiesPrompt, /keptAbilityId/i);
    assert.match(fixAbilitiesPrompt, /deletedAbilityId/i);
    assert.match(fixAbilitiesPrompt, /earliest supplied index/i);
    assert.match(fixAbilitiesPrompt, /omit correct Abilities/i);
    assert.match(fixAbilitiesPrompt, /<kx>/i);
  });

  it('asks AI for one recalculated variation per chapter ExerciseTemplate', (): void => {
    assert.match(skillsToExercisesPrompt, /exerciseTemplates from one chapter/i);
    assert.match(skillsToExercisesPrompt, /exactly one similar ExerciseTemplate variation/i);
    assert.match(skillsToExercisesPrompt, /Vary the concrete arguments or task parameters/i);
    assert.match(skillsToExercisesPrompt, /Recalculate the solution/i);
    assert.match(skillsToExercisesPrompt, /correspond by array position/i);
    assert.match(skillsToExercisesPrompt, /Do not copy database IDs/i);
    assert.match(skillsToExercisesPrompt, /Do not return Abilities/i);
    assert.match(skillsToExercisesPrompt, /constructed locally in the browser/i);
    assert.match(fixAbilitiesPrompt, /different concrete input parameters/i);
  });

  it('pairs an AI variation with its original and uses the Skill title locally', (): void => {
    const original = { id: 7, skillId: 4, solution: '<kx>2 \\times 1000 = 2000</kx> m.', text: 'Convert <kx>2</kx> km to m.' };
    const [variation] = parseExerciseTemplateVariations(JSON.stringify({
      variations: [{ solution: '<kx>5 \\times 1000 = 5000</kx> m.', text: 'Convert <kx>5</kx> km to m.' }]
    }), [original]);
    const template = createAbilityFromExerciseVariation('Convert whole kilometers to meters', original, variation);

    assert.equal(template.h, 'Convert whole kilometers to meters');
    assert.deepEqual(template.q, [
      { a: original.solution, h: original.text, i: '', p: '' },
      { a: variation.solution, h: variation.text, i: '', p: '' }
    ]);
    assert.equal(template.t, 3);
  });

  it('assigns relationships locally and rejects incomplete or unchanged variations', (): void => {
    const original = { id: 7, skillId: 4, solution: 'Answer 1', text: 'Question 1' };
    const [variation] = parseExerciseTemplateVariations(JSON.stringify({ variations: [{ solution: 'Answer 2', text: 'Question 2' }] }), [original]);

    assert.equal(variation.sourceExerciseTemplateId, original.id);
    assert.equal(variation.skillId, original.skillId);
    assert.throws(() => parseExerciseTemplateVariations(JSON.stringify({ variations: [{ solution: original.solution, text: original.text }] }), [original]));
    assert.throws(() => parseExerciseTemplateVariations(JSON.stringify({ variations: [{ text: 'Question 2' }] }), [original]));
    assert.equal(parseExerciseTemplateVariations(JSON.stringify({ variations: [{ solution: original.solution, text: 'Question 2' }] }), [original])[0].solution, original.solution);
  });

  it('accepts common AI envelope variants without weakening content validation', (): void => {
    const original = { id: 7, skillId: 4, solution: 'Answer 1', text: 'Question 1' };
    const varied = { solution: 'Answer 2', text: 'Question 2' };

    assert.equal(parseExerciseTemplateVariations(JSON.stringify({ exerciseTemplates: [varied] }), [original])[0].text, varied.text);
    assert.equal(parseExerciseTemplateVariations(JSON.stringify({ templates: [varied] }), [original])[0].solution, varied.solution);
    assert.equal(parseExerciseTemplateVariations(JSON.stringify([varied]), [original])[0].sourceExerciseTemplateId, original.id);
  });
});

describe('stored abilities', (): void => {
  it('continues to display legacy object and array records', (): void => {
    const skill = createSkill();

    skill.i = 'legacy-skill-image';
    skill.q[0].p = 'legacy-question-image';
    skill.q[0].i = 'legacy-answer-image';
    skill.q[1].h = skill.q[0].h;

    assert.deepEqual(parseStoredAbility(JSON.stringify(skill)), skill);
    assert.deepEqual(parseStoredAbility(JSON.stringify([skill])), skill);
    assert.deepEqual(parseStoredAbility('```json\n' + JSON.stringify(skill) + '\n```'), skill);
  });

  it('rejects corrupt stored records', (): void => {
    assert.throws(() => parseStoredAbility('not JSON'));
    assert.throws(() => parseStoredAbility(JSON.stringify({ ...createSkill(), q: [{}] })));
  });
});
