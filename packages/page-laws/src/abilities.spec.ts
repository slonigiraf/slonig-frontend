// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import type { GeneratedAbility } from './abilities.js';

import { strict as assert } from 'node:assert';

import { parseAbilityRepairResult, parseAbilityRepairReviews, parseGeneratedAbilities, parseGeneratedExerciseAbilities, parseStoredAbility, prepareAbilityForPublishing } from './abilities.js';
import { FIX_ABILITIES_PROMPT, SKILL_LIST_PROMPT, SOURCES_TO_SKILLS_PROMPT } from './constants.js';

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

function noImagePrompts (): Array<{ changesImage: boolean; i: string; p: string }> {
  return [
    { changesImage: false, i: '', p: '' },
    { changesImage: false, i: '', p: '' }
  ];
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

  it('keeps Ability images local while preparing an IPFS-only publish copy', async (): Promise<void> => {
    const ability = createSkill();

    ability.q[0].p = 'data:image/png;base64,cXVlc3Rpb24=';
    ability.q[0].i = 'data:image/png;base64,YW5zd2Vy';
    const pinned: string[] = [];
    const { localAbility, publishAbility } = await prepareAbilityForPublishing(ability, `0x${'12'.repeat(32)}`, async (value) => {
      if (!value.startsWith('data:image/')) {
        return value;
      }

      pinned.push(value);

      return value.includes('cXVlc3Rpb24=') ? 'bafy-question' : 'bafy-answer';
    });

    assert.equal(localAbility.q[0].p, 'data:image/png;base64,cXVlc3Rpb24=');
    assert.equal(localAbility.q[0].i, 'data:image/png;base64,YW5zd2Vy');
    assert.equal(publishAbility.q[0].p, 'bafy-question');
    assert.equal(publishAbility.q[0].i, 'bafy-answer');
    assert.equal(ability.q[0].p, 'data:image/png;base64,cXVlc3Rpb24=');
    assert.equal(ability.q[0].i, 'data:image/png;base64,YW5zd2Vy');
    assert.deepEqual(pinned.sort(), [ability.q[0].i, ability.q[0].p].sort());
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
        { ability: first, exerciseId: 11, imagePrompts: noImagePrompts() },
        { ability: { ...createSkill(), q: [] }, exerciseId: 12, imagePrompts: noImagePrompts() },
        { ability: third, exerciseId: 13, imagePrompts: noImagePrompts() }
      ]
    }), [11, 12, 13]);

    assert.deepEqual(parsed, [
      { ability: first, exerciseId: 11, imagePrompts: noImagePrompts() },
      { ability: third, exerciseId: 13, imagePrompts: noImagePrompts() }
    ]);
  });

  it('preserves validated image-generation prompts for Exercise-to-Ability conversion', (): void => {
    const ability = createSkill();
    const imagePrompts = [
      { changesImage: false, i: '', p: 'A number line from 0 to 10 with a point at 4.' },
      { changesImage: true, i: 'The completed number line with the answer highlighted.', p: 'A number line from 0 to 12 with a point at 7.' }
    ];

    assert.deepEqual(parseGeneratedExerciseAbilities(JSON.stringify({ abilities: [
      { ability, exerciseId: 20, imagePrompts }
    ] }), [20]), [{ ability, exerciseId: 20, imagePrompts }]);
  });

  it('requires the AI to classify whether each Ability question changes an image', (): void => {
    const ability = createSkill();

    assert.deepEqual(parseGeneratedExerciseAbilities(JSON.stringify({ abilities: [{
      ability,
      exerciseId: 23,
      imagePrompts: [{ i: '', p: '' }, { i: '', p: '' }]
    }] }), [23]), []);

    assert.deepEqual(parseGeneratedExerciseAbilities(JSON.stringify({ abilities: [{
      ability,
      exerciseId: 23,
      imagePrompts: [
        { changesImage: true, i: '', p: 'A triangle with a missing altitude.' },
        { changesImage: false, i: '', p: 'A triangle to inspect.' }
      ]
    }] }), [23])[0]?.imagePrompts, [
      { changesImage: true, i: '', p: 'A triangle with a missing altitude.' },
      { changesImage: false, i: '', p: 'A triangle to inspect.' }
    ]);
  });

  it('normalizes common schema drift in Exercise-to-Ability conversions', (): void => {
    assert.deepEqual(parseGeneratedExerciseAbilities(JSON.stringify({ abilities: [{
      ability: {
        questions: [
          { answer: '2 × 1000 = 2000 m.', question: 'Convert 2 km to m.' },
          { answer: '5 × 1000 = 5000 m.', question: 'Convert 5 km to m.' }
        ],
        title: 'Convert whole kilometers to meters',
        type: '3'
      },
      exerciseId: 24,
      imagePrompts: [{ modifiesImage: false, prompt: '' }, { editsImage: false, prompt: '' }]
    }] }), [24]), [{
      ability: createSkill(),
      exerciseId: 24,
      imagePrompts: [{ changesImage: false, i: '', p: '' }, { changesImage: false, i: '', p: '' }]
    }]);
  });

  it('salvages the first two distinct complete questions from an oversized conversion', (): void => {
    const parsed = parseGeneratedExerciseAbilities(JSON.stringify({ abilities: [{
      ability: {
        h: 'Convert whole kilometers to meters',
        q: [
          { a: '2 × 1000 = 2000 m.', h: 'Convert 2 km to m.' },
          { a: '2 × 1000 = 2000 m.', h: 'Convert 2 km to m.' },
          { a: '5 × 1000 = 5000 m.', h: 'Convert 5 km to m.' }
        ]
      },
      exerciseId: 25,
      imagePrompts: noImagePrompts()
    }] }), [25]);

    assert.deepEqual(parsed, [{ ability: createSkill(), exerciseId: 25, imagePrompts: noImagePrompts() }]);
  });

  it('rejects positional legacy conversions when visual decisions are required', (): void => {
    const first = createSkill();

    assert.deepEqual(parseGeneratedExerciseAbilities(JSON.stringify([first]), [21], true), []);
    assert.equal(parseGeneratedExerciseAbilities(JSON.stringify([{
      ability: first,
      exerciseId: 21,
      imagePrompts: noImagePrompts()
    }]), [21], true).length, 1);
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
      { exerciseId: 31, ability: first, imagePrompts: noImagePrompts() },
      { exerciseId: 31, ability: duplicate, imagePrompts: noImagePrompts() },
      { exerciseId: 99, ability: unexpected, imagePrompts: noImagePrompts() }
    ] }), [31, 32]), [{ ability: first, exerciseId: 31, imagePrompts: noImagePrompts() }]);
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

  for (const [name, prompt] of Object.entries({ SKILL_LIST_PROMPT })) {
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

  it('requires compact reusable exercise templates', (): void => {
    assert.match(SKILL_LIST_PROMPT, /reusable template pattern/i);
    assert.match(SKILL_LIST_PROMPT, /later be reused by changing 1-3 data-bearing words or values/i);
    assert.match(SKILL_LIST_PROMPT, /do not generate, propose, compare, or output extra alternate/i);
    assert.match(SKILL_LIST_PROMPT, /fewer than 7 words/i);
    assert.match(SKILL_LIST_PROMPT, /Templatability, self-containment/i);
  });

  it('generates one language-constrained skill per source item', (): void => {
    assert.match(SOURCES_TO_SKILLS_PROMPT, /exactly one/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /abstractly/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /Do not include, copy, or depend on specific examples/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /ISO 639-1 language code/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /"skills"/);
  });

  it('requires the repair stage to detect all error classes and return indexed fixes', (): void => {
    assert.match(FIX_ABILITIES_PROMPT, /factual/i);
    assert.match(FIX_ABILITIES_PROMPT, /logical/i);
    assert.match(FIX_ABILITIES_PROMPT, /grammatical/i);
    assert.match(FIX_ABILITIES_PROMPT, /KaTeX/i);
    assert.match(FIX_ABILITIES_PROMPT, /question image present/i);
    assert.match(FIX_ABILITIES_PROMPT, /preserve the image dependency/i);
    assert.match(FIX_ABILITIES_PROMPT, /hasErrors/i);
    assert.match(FIX_ABILITIES_PROMPT, /errors/i);
    assert.match(FIX_ABILITIES_PROMPT, /reviews/i);
    assert.match(FIX_ABILITIES_PROMPT, /partial reviews array/i);
    assert.match(FIX_ABILITIES_PROMPT, /duplicatePairs/i);
    assert.match(FIX_ABILITIES_PROMPT, /keptAbilityId/i);
    assert.match(FIX_ABILITIES_PROMPT, /deletedAbilityId/i);
    assert.match(FIX_ABILITIES_PROMPT, /earliest supplied index/i);
    assert.match(FIX_ABILITIES_PROMPT, /omit correct Abilities/i);
    assert.match(FIX_ABILITIES_PROMPT, /<kx>/i);
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
