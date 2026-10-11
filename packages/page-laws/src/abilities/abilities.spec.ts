// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import type { GeneratedAbility } from './abilities.js';

import { strict as assert } from 'node:assert';

import { parseAbilityRepairResult, parseAbilityRepairReviews, parseGeneratedAbilities, parseStoredAbility, prepareAbilityForPublishing, withAbilityVisualError, withAbilityVisualSource } from './abilities.js';
import { ABILITY_GENERATION_INSTRUCTIONS_PROMPT, FIX_ABILITIES_PROMPT, SKILL_LIST_PROMPT, SOURCES_TO_SKILLS_PROMPT } from '../Generate/book/infrastructure/ai/prompts/abilities.js';

function createSkill (): GeneratedAbility {
  return {
    h: 'Convert whole kilometers to meters',
    i: '',
    q: [
      { a: '<kx>2 \\times 1000 = 2000</kx> m.', h: 'Convert <kx>2</kx> km to m.', i: '', p: '' },
      { a: '<kx>5 \\times 1000 = 5000</kx> m.', h: 'Convert <kx>5</kx> km to m.', i: '', p: '' }
    ],
    t: 3
  };
}

describe('generated abilities', (): void => {
  it('requires supported markup in both Ability generation and Fix abilities prompts', (): void => {
    for (const prompt of [ABILITY_GENERATION_INSTRUCTIONS_PROMPT, FIX_ABILITIES_PROMPT]) {
      assert.match(prompt, /ONLY permitted HTML-like markup is <kx>/);
      assert.match(prompt, /<code>\.\.\.<\/code>/);
      assert.match(prompt, /Do not generate any other HTML\/XML tags/);
    }
    assert.match(FIX_ABILITIES_PROMPT, /Treat unsupported HTML tags in Ability\.h, q\[\]\.h, or q\[\]\.a as formatting errors/);
  });

  it('rejects unsupported HTML tags in generated questions, answers and titles without validating image prompts', (): void => {
    const original = createSkill();
    const withTag = (field: 'h' | 'a', value: string): GeneratedAbility => ({
      ...original,
      q: [{ ...original.q[0], [field]: value }, original.q[1]]
    });

    assert.throws(() => parseGeneratedAbilities(JSON.stringify([withTag('h', 'Convert <b>two</b> km.')])), /unsupported HTML tag/);
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([withTag('a', '<br>')])), /unsupported HTML tag/);
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([{ ...original, h: '<strong>Bad title</strong>' }])), /unsupported HTML tag/);
    assert.deepEqual(parseGeneratedAbilities(JSON.stringify([{ ...original, q: [
      { ...original.q[0], pPrompt: 'Draw <circle> and label it' }, original.q[1]
    ] }]))[0].q[0].pPrompt, 'Draw <circle> and label it');
    assert.deepEqual(parseStoredAbility(JSON.stringify(withTag('a', '<b>Legacy</b>'))).q[0].a, '<b>Legacy</b>');
  });

  it('rejects unsupported markup in Fix abilities corrections', (): void => {
    const candidate = createSkill();

    candidate.q[0].a = '<i>incorrect</i>';
    assert.throws(() => parseAbilityRepairReviews(JSON.stringify({ reviews: [{
      ability: candidate, errors: ['Unsupported tag'], hasErrors: true, index: 0
    }] }), [createSkill()]), /unsupported HTML tag/);
  });

  it('preserves the original skill and exercise fields without adding metadata', (): void => {
    const skill = createSkill();
    const [parsed] = parseGeneratedAbilities(JSON.stringify([skill]), 1);

    assert.deepEqual(parsed, skill);
    assert.deepEqual(Object.keys(parsed).sort(), ['h', 'i', 'q', 't']);
    assert.deepEqual(Object.keys(parsed.q[0]).sort(), ['a', 'h', 'i', 'p']);
  });

  it('accepts image-only answers but rejects exercises with no text answer or solution image', (): void => {
    const imageOnly = createSkill();

    imageOnly.q[0].a = '';
    imageOnly.q[0].i = 'Draw the completed number line from zero to ten, marking the solved result.';
    assert.deepEqual(parseGeneratedAbilities(JSON.stringify([imageOnly]), 1)[0].q[0], imageOnly.q[0]);
    assert.deepEqual(parseStoredAbility(JSON.stringify(imageOnly)).q[0], imageOnly.q[0]);

    imageOnly.q[0].i = '';
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([imageOnly]), 1), /text answer or solution image/);
  });

  it('accepts image-only answers while their image exists only as a persisted prompt', (): void => {
    const imageOnly = createSkill();

    imageOnly.q[0].a = '';
    imageOnly.q[0].i = '';
    imageOnly.q[0].iPrompt = 'A correct, completely labeled solution diagram for exercise one.';

    assert.deepEqual(parseGeneratedAbilities(JSON.stringify([imageOnly]), 1)[0].q[0], imageOnly.q[0]);
    // Hydrating a not-yet-generated Image id returns i="" and iPrompt with
    // the preserved image prompt. The Ability must stay valid at this stage.
    assert.deepEqual(parseStoredAbility(JSON.stringify(imageOnly)).q[0], imageOnly.q[0]);

    imageOnly.q[0].iPrompt = '';
    assert.throws(() => parseStoredAbility(JSON.stringify(imageOnly)), /Exercise 1.*text answer.*solution image prompt/);
  });

  it('normalizes omitted blank fields for a model-produced image-only solution', (): void => {
    const modelOutput = {
      abilities: [{
        h: 'Draw a correct number line',
        i: '',
        q: [
          { h: 'Mark the correct position on the line.', iPrompt: 'Draw the correct completed number line.' },
          { h: 'Mark a different position on the line.', a: 'The point is at 5.', p: '', i: '' }
        ],
        t: 3
      }]
    };
    const [ability] = parseGeneratedAbilities(JSON.stringify(modelOutput), 1);

    assert.deepEqual(ability.q[0], { a: '', h: modelOutput.abilities[0].q[0].h, i: '', iPrompt: modelOutput.abilities[0].q[0].iPrompt, p: '' });
    assert.deepEqual(ability.q[1], { a: 'The point is at 5.', h: modelOutput.abilities[0].q[1].h, i: '', p: '' });
    assert.deepEqual(parseStoredAbility(JSON.stringify(ability)), ability);

    // Some structured model responses use null rather than an empty string.
    const nullableImageOnly = JSON.parse(JSON.stringify(modelOutput)) as typeof modelOutput;
    (nullableImageOnly.abilities[0].q[0] as Record<string, unknown>).a = null;
    (nullableImageOnly.abilities[0].q[0] as Record<string, unknown>).i = null;
    (nullableImageOnly.abilities[0].q[0] as Record<string, unknown>).p = null;
    assert.equal(parseGeneratedAbilities(JSON.stringify(nullableImageOnly), 1)[0].q[0].a, '');

    modelOutput.abilities[0].q[0].iPrompt = '';
    assert.throws(() => parseGeneratedAbilities(JSON.stringify(modelOutput), 1), /Exercise 1.*solution image prompt/);
  });

  it('enforces separate image prompts for new generation without rejecting legacy stored visual data', (): void => {
    const generated = createSkill();

    generated.q[0] = { ...generated.q[0], pPrompt: 'Starting diagram', iPrompt: '' };
    generated.q[1] = { ...generated.q[1], a: '', pPrompt: 'Unfinished figure', iPrompt: 'Completed figure' };

    const options = { visualPromptsOnly: true };
    const [parsed] = parseGeneratedAbilities(JSON.stringify([generated]), 1, options);

    assert.deepEqual(parsed, generated);
    assert.deepEqual(Object.keys(parsed.q[0]).sort(), ['a', 'h', 'i', 'iPrompt', 'p', 'pPrompt']);

    const legacy = JSON.parse(JSON.stringify(generated)) as GeneratedAbility;

    legacy.q[0].p = 'Older prompt in p';
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([legacy]), 1, options), /image data fields and must be empty/);
    assert.equal(parseStoredAbility(JSON.stringify(legacy)).q[0].p, 'Older prompt in p');

    generated.q[0].pPrompt = undefined;
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([generated]), 1, options), /pPrompt and iPrompt are required strings/);
  });

  it('persists explicit TikZ compile state with the visual and clears it only when the source changes', (): void => {
    const original = createSkill().q[0];
    const failed = withAbilityVisualError({ ...original, p: '\\begin{tikzpicture}bad\\end{tikzpicture}' }, 'p', true);
    const unchanged = withAbilityVisualSource(failed, 'p', failed.p);
    const changed = withAbilityVisualSource(failed, 'p', '\\begin{tikzpicture}fixed\\end{tikzpicture}');

    assert.equal(failed.pError, true);
    assert.equal(unchanged.pError, true);
    assert.equal(changed.pError, undefined);
    assert.equal(withAbilityVisualError(failed, 'p', false).pError, false);
  });

  it('reads persisted TikZ success and error states from stored Ability JSON', (): void => {
    const ability = createSkill();

    ability.q[0].pError = false;
    ability.q[1].iError = true;

    const parsed = parseStoredAbility(JSON.stringify(ability));

    assert.equal(parsed.q[0].pError, false);
    assert.equal(parsed.q[1].iError, true);
  });

  it('parses indexed Ability repair reviews and only returns a replacement for errors', (): void => {
    const original = createSkill();
    const fixed = { ...createSkill(), q: [
      { ...createSkill().q[0], a: '<kx>2 \\times 1000 = 2000</kx> m.' },
      { ...createSkill().q[1], a: '<kx>5 \\times 1000 = 5000</kx> m.' }
    ] };

    fixed.q[1].a = '<kx>5 \\times 1000 = 5000</kx> m from <kx>5</kx> km.';

    const reviews = parseAbilityRepairReviews(JSON.stringify({ reviews: [
      { errors: [], hasErrors: false, index: 0 },
      { ability: fixed, errors: ['The second solution omitted its source unit.'], hasErrors: true, index: 1 }
    ] }), [original, original]);

    assert.deepEqual(reviews[0], { errors: [], hasErrors: false, index: 0 });
    assert.equal(reviews[1].hasErrors, true);
    assert.deepEqual(reviews[1].ability, fixed);
  });

  it('does not rewrite learner-facing number markup automatically', (): void => {
    const original = createSkill();

    original.h = 'Convert 2 distances';
    original.q[0].h = 'Convert 2 km to m.';
    original.q[0].pPrompt = 'Draw 2 road signs.';

    const untouched = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: []
    }), [original], ['ability-1']);

    assert.deepEqual(untouched.reviews, []);

    const fixed = { ...original, q: original.q.map((exercise) => ({ ...exercise })) };

    fixed.h = 'Convert <kx>2</kx> distances';
    fixed.q[0].h = 'Convert <kx>2</kx> km to m.';

    const [review] = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        ability: fixed,
        errors: ['The learner-facing number is not marked as KaTeX.'],
        hasErrors: true,
        index: 0
      }]
    }), [original], ['ability-1']).reviews;

    assert.equal(review.ability?.q[0].h, 'Convert <kx>2</kx> km to m.');
    assert.equal(review.ability?.q[0].pPrompt, 'Draw 2 road signs.');
  });

  it('does not treat digits embedded in gene or other alphanumeric identifiers as standalone numbers', (): void => {
    const original = createSkill();

    original.h = 'Compare TP53 and BRCA1';
    original.q[0].h = 'Identify H1N1 from the description.';
    original.q[0].a = 'H1N1';
    original.q[1].h = 'Compare BRCA1 with TP53.';
    original.q[1].a = 'BRCA1';

    const result = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: []
    }), [original], ['ability-1']);

    assert.deepEqual(result.reviews, []);
  });

  it('preserves identifier and math markup instead of applying regex cleanup', (): void => {
    const generated = createSkill();

    generated.h = 'Compare <kx>TP53</kx> and BRCA<kx>1</kx>';
    generated.q[0].h = 'Evaluate <kx>x-6</kx> and identify H<kx>1</kx>N<kx>1</kx>.';
    generated.q[0].a = '<kx>x-6</kx>';

    const [parsedGenerated] = parseGeneratedAbilities(JSON.stringify([generated]), 1);

    assert.equal(parsedGenerated.h, generated.h);
    assert.equal(parsedGenerated.q[0].h, generated.q[0].h);
    assert.equal(parsedGenerated.q[0].a, generated.q[0].a);

    const original = createSkill();

    original.h = 'Compare TP<kx>53</kx> with BRCA<kx>1</kx>';

    const result = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: []
    }), [original], ['ability-1']);

    assert.deepEqual(result.reviews, []);
  });

  it('does not auto-wrap standalone numbers with regex', (): void => {
    const original = createSkill();

    original.h = 'Compare TP53 in 2 samples';
    original.q[0].h = 'Find BRCA1 in 3 samples.';
    original.q[0].a = 'BRCA1 appears in 3 samples.';

    const result = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: []
    }), [original], ['ability-1']);

    assert.deepEqual(result.reviews, []);
  });

  it('preserves learner-facing text in a corrected Ability payload', (): void => {
    const original = createSkill();
    const corrected = { ...original, q: original.q.map((exercise) => ({ ...exercise })) };

    corrected.q[0].h = 'Convert 2 kilometers to meters.';

    const [review] = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{
        ability: corrected,
        errors: ['The first task wording needed correction.'],
        hasErrors: true,
        index: 0
      }]
    }), [original], ['ability-1']).reviews;

    assert.equal(review.ability?.q[0].h, 'Convert 2 kilometers to meters.');
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
    ability.q[0].pError = true;
    ability.q[0].iError = true;
    ability.q[0].pPrompt = 'Question image prompt';
    ability.q[0].iPrompt = 'Answer image prompt';
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
    assert.equal(localAbility.q[0].pError, true);
    assert.equal(localAbility.q[0].iError, true);
    assert.equal(localAbility.q[0].pPrompt, 'Question image prompt');
    assert.equal(localAbility.q[0].iPrompt, 'Answer image prompt');
    assert.equal(publishAbility.q[0].p, 'bafy-question');
    assert.equal(publishAbility.q[0].i, 'bafy-answer');
    assert.equal(publishAbility.q[0].pError, undefined);
    assert.equal(publishAbility.q[0].iError, undefined);
    assert.equal(publishAbility.q[0].pPrompt, undefined);
    assert.equal(publishAbility.q[0].iPrompt, undefined);
    assert.equal(ability.q[0].p, 'data:image/png;base64,cXVlc3Rpb24=');
    assert.equal(ability.q[0].i, 'data:image/png;base64,YW5zd2Vy');
    assert.deepEqual(pinned.sort(), [ability.q[0].i, ability.q[0].p].sort());
  });

  it('tells the repair model which fields are writable and routes visual-only faults to the appropriate image QA stage', (): void => {
    assert.match(FIX_ABILITIES_PROMPT, /IMPORTANT FIX-ABILITIES WRITE CONTRACT/);
    assert.match(FIX_ABILITIES_PROMPT, /q\[\]\.pPrompt and q\[\]\.iPrompt are image metadata/);
    assert.match(FIX_ABILITIES_PROMPT, /Fix question images or Fix answer images stage handles it/);
    assert.match(FIX_ABILITIES_PROMPT, /MUST actually correct at least one writable learner-facing field/);
  });

  it('preserves existing Ability linkage fields while applying a repair', (): void => {
    const original = {
      ...createSkill(),
      i: 'ability-link',
      q: createSkill().q.map((exercise, index) => ({ ...exercise, i: `exercise-link-${index}`, iError: index === 1, p: `prompt-link-${index}`, pError: index === 0 }))
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
    assert.equal(review.ability?.q[0].pError, true);
    assert.equal(review.ability?.q[1].iError, true);
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

  it('does not sentence-case away a valid Concept title correction during repair', (): void => {
    const original = createSkill();
    const corrected = { ...original, h: 'Convert Whole Kilometers To Meters' };
    const parsed = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{ ability: corrected, errors: ['Title differs from source Concept.'], hasErrors: true, index: 0 }]
    }), [original], ['ability-1']);

    assert.equal(parsed.reviews[0].ability?.h, corrected.h);
  });

  it('collects an unchanged AI diagnosis without treating it as a successful fix', (): void => {
    const original = createSkill();
    const changedImageOnly = {
      ...original,
      q: original.q.map((exercise) => ({ ...exercise, i: 'replacement that must not overwrite linked image', p: 'another replacement' }))
    };
    const corrected = { ...original, q: original.q.map((exercise) => ({ ...exercise })) };

    corrected.q[1].a = 'Corrected answer.';
    const parsed = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [
        { ability: changedImageOnly, errors: ['The figure has an incorrect orientation.'], hasErrors: true, index: 0 },
        { ability: corrected, errors: ['Incorrect answer.'], hasErrors: true, index: 1 }
      ]
    }), [original, original], ['first', 'second'], { collectUnchangedRepairs: true });

    assert.deepEqual(parsed.unresolvedReviews, [{ errors: ['The figure has an incorrect orientation.'], index: 0 }]);
    assert.equal(parsed.reviews.length, 1);
    assert.equal(parsed.reviews[0].index, 1);
    assert.equal(parsed.reviews[0].ability?.q[1].a, 'Corrected answer.');
    assert.equal(parsed.reviews[0].ability?.q[0].p, original.q[0].p);
    assert.throws(() => parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{ ability: changedImageOnly, errors: ['Image-only issue'], hasErrors: true, index: 0 }]
    }), [original], ['first']), /did not change any persistable field/);
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

  it('does not discard an otherwise valid Ability solely because its two question texts are identical', (): void => {
    const duplicatedPair = {
      ...createSkill(),
      h: 'Read a value from a diagram',
      q: [
        { a: '<kx>3</kx>', h: 'Read the value shown.', i: '', p: '' },
        { a: '<kx>7</kx>', h: 'Read the value shown.', i: '', p: '' }
      ]
    };

    assert.deepEqual(parseGeneratedAbilities(JSON.stringify([duplicatedPair])), [duplicatedPair]);
    assert.deepEqual(parseGeneratedAbilities(JSON.stringify([duplicatedPair]), 1, { allowIdenticalQuestionText: true }), [duplicatedPair]);
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

  it('rejects generated or repaired Ability text that exceeds the learner-facing size budget', (): void => {
    const verbose = createSkill();

    verbose.q[0].a = Array.from({ length: 39 }, () => 'word').join(' ');
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([verbose])), /too verbose/i);

    const original = createSkill();
    assert.throws(() => parseAbilityRepairReviews(JSON.stringify({ reviews: [{
      ability: verbose,
      errors: ['Answer is too verbose.'],
      hasErrors: true,
      index: 0
    }] }), [original]), /too verbose/i);
  });

  it('enforces the tighter 21-word question and 25-word answer budgets', (): void => {
    const ability = createSkill();

    ability.q[0].h = Array.from({ length: 22 }, () => 'word').join(' ');
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([ability])), /maximum 21 words/i);

    ability.q[0].h = Array.from({ length: 21 }, () => 'word').join(' ');
    ability.q[0].a = Array.from({ length: 26 }, () => 'word').join(' ');
    assert.throws(() => parseGeneratedAbilities(JSON.stringify([ability])), /maximum 25 words/i);

    ability.q[0].a = Array.from({ length: 25 }, () => 'word').join(' ');
    assert.equal(parseGeneratedAbilities(JSON.stringify([ability]))[0].q[0].a, ability.q[0].a);

    // Detailed diagram descriptions must not be shortened by text-length gates.
    ability.q[0].pPrompt = Array.from({ length: 100 }, () => 'visual').join(' ');
    assert.equal(parseGeneratedAbilities(JSON.stringify([ability]))[0].q[0].pPrompt, ability.q[0].pPrompt);
  });

  it('rejects Task 1/Task 2 placeholders during generation and requires Fix abilities to replace them', (): void => {
    for (const placeholder of ['Task 1', ' task   2 ']) {
      const generated = createSkill();

      generated.q[0].h = placeholder;
      assert.throws(() => parseGeneratedAbilities(JSON.stringify([generated])), /placeholder/i);
    }

    const original = createSkill();

    original.q[0].h = 'Task 1';
    assert.throws(() => parseAbilityRepairResult(JSON.stringify({ duplicatePairs: [], reviews: [] }), [original], ['ability-1']), /must replace placeholder/i);

    const fixed = createSkill();
    const repaired = parseAbilityRepairResult(JSON.stringify({
      duplicatePairs: [],
      reviews: [{ ability: fixed, errors: ['Placeholder task title.'], hasErrors: true, index: 0 }]
    }), [original], ['ability-1']);

    assert.equal(repaired.reviews[0].ability?.q[0].h, fixed.q[0].h);
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
        template.q.forEach((exercise) => assert.deepEqual(Object.keys(exercise).sort(), ['a', 'h', 'i', 'iPrompt', 'p', 'pPrompt']));
      });
    });
  }

  it('requires compact reusable exercise templates', (): void => {
    assert.match(SKILL_LIST_PROMPT, /reusable template pattern/i);
    assert.match(SKILL_LIST_PROMPT, /later be reused by changing 1-3 data-bearing words or values/i);
    assert.match(SKILL_LIST_PROMPT, /do not generate, propose, compare, or output extra alternate/i);
    assert.match(SKILL_LIST_PROMPT, /fewer words/i);
    assert.match(SKILL_LIST_PROMPT, /Templatability, self-containment/i);
  });

  it('requires direct Concept-linked Abilities to preserve learning objectives', (): void => {
    assert.match(FIX_ABILITIES_PROMPT, /sourceConcept as the PRIMARY authority/i);
    assert.match(FIX_ABILITIES_PROMPT, /formal structure of mathematical representations/i);
    assert.match(FIX_ABILITIES_PROMPT, /preserve the Concept's learning objective/i);
  });

  it('generates one language-constrained skill per source item', (): void => {
    assert.match(SOURCES_TO_SKILLS_PROMPT, /exactly one/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /abstractly/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /Do not include, copy, or depend on specific examples/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /ISO 639-1 language code/i);
    assert.match(SOURCES_TO_SKILLS_PROMPT, /"skills"/);
  });

  it('requires the direct Concept Ability repair to detect errors, preserve titles and review duplicates', (): void => {
    assert.match(FIX_ABILITIES_PROMPT, /factual/i);
    assert.match(FIX_ABILITIES_PROMPT, /logical/i);
    assert.match(FIX_ABILITIES_PROMPT, /grammatical/i);
    assert.match(FIX_ABILITIES_PROMPT, /KaTeX/i);
    assert.match(FIX_ABILITIES_PROMPT, /sourceConcept as the PRIMARY authority/i);
    assert.match(FIX_ABILITIES_PROMPT, /Copy sourceConcept.title exactly/i);
    assert.match(FIX_ABILITIES_PROMPT, /Abilities link directly to Concepts/i);
    assert.match(FIX_ABILITIES_PROMPT, /Never rename Abilities to make titles unique/i);
    assert.match(FIX_ABILITIES_PROMPT, /duplicatePairs/i);
    assert.match(FIX_ABILITIES_PROMPT, /keptAbilityId/i);
    assert.match(FIX_ABILITIES_PROMPT, /deletedAbilityId/i);
    assert.match(FIX_ABILITIES_PROMPT, /Task 1/i);
    assert.match(FIX_ABILITIES_PROMPT, /Task 2/i);
    assert.match(FIX_ABILITIES_PROMPT, /Do not use q\[\]\.p as a fallback/i);
    assert.match(FIX_ABILITIES_PROMPT, /combined text-plus-visual task/i);
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
