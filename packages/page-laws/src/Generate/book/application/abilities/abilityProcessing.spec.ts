// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type OpenAI from 'openai';

import { abilityRepairInput, answerTikzRequestPrompt, exerciseNeedsCompletedFigure, requestAbilityRepairResult, tikzCompileRepairPrompt, tikzDetectedProblemsRepairPrompt, tikzFixReviewPrompt, tikzRequestPrompt, type ImageFixTarget, type StoredAbility } from './abilityProcessing.js';

describe('Ability repair source evidence', (): void => {
  it('sends the linked Concept directly with no Exercise or embedding pre-check', (): void => {
    const record: StoredAbility = { ability: null, content: '{}', id: 'ability-concept', moduleId: 'book-1-concept-3' };
    const concept = { title: 'Multiply equal groups', description: 'Use multiplication to count a rectangular array.' };
    const input = abilityRepairInput('en', [record], 'Arrays', 10, new Map([[3, concept]])) as {
      abilities: Array<{ sourceConcept?: typeof concept; sourceExercise?: unknown; embeddingValidation?: unknown }>;
    };

    assert.deepEqual(input.abilities[0].sourceConcept, concept);
    assert.equal(input.abilities[0].sourceExercise, undefined);
    assert.equal(input.abilities[0].embeddingValidation, undefined);
  });
  it('does not retain an Exercise-backed Ability source path', (): void => {
    const record: StoredAbility = { ability: null, content: '{}', id: 'ability-old', moduleId: 'book-1-exercise-7' };
    const input = abilityRepairInput('en', [record], 'Arrays', 10, new Map([[3, { title: 'Concept', description: 'Direct only' }]])) as {
      abilities: Array<{ sourceConcept?: unknown; sourceExercise?: unknown; embeddingValidation?: unknown }>;
    };

    assert.equal(input.abilities[0].sourceConcept, undefined);
    assert.equal(input.abilities[0].sourceExercise, undefined);
    assert.equal(input.abilities[0].embeddingValidation, undefined);
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

  it('flags long existing text and retries when the audit omits mandatory brevity repairs', async (): Promise<void> => {
    const record = createRecord('long-question');
    const longQuestion = Array.from({ length: 24 }, (_, index) => `word${index}`).join(' ');

    record.ability!.q[0].h = longQuestion;
    const input = abilityRepairInput('en', [record]) as { brevityIssues: Array<{ exerciseIndex: number; field: string; index: number; maxWords: number }> };

    assert.deepEqual(input.brevityIssues.map(({ exerciseIndex, field, index, maxWords }) => ({ exerciseIndex, field, index, maxWords })), [
      { exerciseIndex: 0, field: 'h', index: 0, maxWords: 21 }
    ]);

    const repaired = createAbility();
    const prompts: string[] = [];
    let calls = 0;
    const client = { chat: { completions: { create: async (request: { messages: Array<{ content: string }> }) => {
      prompts.push(request.messages[1].content);
      calls++;

      return response(calls === 1
        ? { duplicatePairs: [], reviews: [] }
        : { duplicatePairs: [], reviews: [{ index: 0, hasErrors: true, errors: ['Question too long'], ability: repaired }] });
    } } } } as unknown as OpenAI;
    const result = await requestAbilityRepairResult(client, 'test-model', 'system', input, [record]);

    assert.equal(calls, 2);
    assert.equal(result.reviews[0].ability?.q[0].h, repaired.q[0].h);
    assert.equal(result.unresolvedReviews, undefined);
    assert.match(prompts[1], /Mandatory brevity repair missing/);
  });

  it('keeps a verbose Ability without unresolved errors when shortening retries fail', async (): Promise<void> => {
    const record = createRecord('long-question');

    record.ability!.q[0].h = Array.from({ length: 24 }, () => 'word').join(' ');
    const client = { chat: { completions: { create: async () => response({ duplicatePairs: [], reviews: [] }) } } } as unknown as OpenAI;
    const result = await requestAbilityRepairResult(client, 'test-model', 'system', abilityRepairInput('en', [record]), [record]);

    assert.equal(result.reviews.length, 0);
    assert.equal(result.unresolvedReviews, undefined); // Not a stage-blocking error.
    assert.equal(record.ability!.q[0].h.split(' ').length, 24); // Persisted text is untouched.
  });

  it('rejects still-overlong repair proposals and keeps the original after retries', async (): Promise<void> => {
    const record = createRecord('long-question');
    const before = JSON.stringify(record.ability);

    record.ability!.q[0].h = Array.from({ length: 26 }, (_, index) => `token${index}`).join(' ');
    const original = JSON.stringify(record.ability);
    const attempted = JSON.parse(original) as NonNullable<StoredAbility['ability']>;

    attempted.q[0].h = Array.from({ length: 23 }, (_, index) => `short${index}`).join(' ');
    let calls = 0;
    const client = { chat: { completions: { create: async () => {
      calls++;

      return response({ duplicatePairs: [], reviews: [{ index: 0, hasErrors: true, errors: ['Too verbose'], ability: attempted }] });
    } } } } as unknown as OpenAI;
    const result = await requestAbilityRepairResult(client, 'test-model', 'system', abilityRepairInput('en', [record]), [record]);

    assert.ok(calls > 1);
    assert.equal(result.reviews.length, 0); // Proposed replacement fails the brevity gate.
    assert.equal(result.unresolvedReviews, undefined);
    assert.equal(JSON.stringify(record.ability), original);
    assert.notEqual(before, original);
  });

  it('treats a no-op brevity diagnosis as nonblocking after retries', async (): Promise<void> => {
    const record = createRecord('long-question');

    record.ability!.q[0].h = Array.from({ length: 24 }, () => 'word').join(' ');
    const client = { chat: { completions: { create: async () => response({ duplicatePairs: [], reviews: [{
      index: 0, hasErrors: true, errors: ['Question is too verbose'], ability: record.ability
    }] }) } } } as unknown as OpenAI;
    const result = await requestAbilityRepairResult(client, 'test-model', 'system', abilityRepairInput('en', [record]), [record]);

    assert.deepEqual(result.reviews, []);
    assert.equal(result.unresolvedReviews, undefined);
  });

  it('preserves successful chapter fixes when another Ability cannot be shortened', async (): Promise<void> => {
    const batch = [createRecord('verbose'), createRecord('correctable')];

    batch[0].ability!.q[0].a = Array.from({ length: 28 }, () => 'explanation').join(' ');
    const repaired = createAbility();

    repaired.q[1].a = '<kx>4\times 2 = 8</kx>';
    const initial = { duplicatePairs: [], reviews: [{
      index: 1, hasErrors: true, errors: ['Missing calculation'], ability: repaired
    }] };
    let calls = 0;
    const client = { chat: { completions: { create: async () => {
      calls++;

      return response(calls === 1 ? initial : { duplicatePairs: [], reviews: [] });
    } } } } as unknown as OpenAI;
    const result = await requestAbilityRepairResult(client, 'test-model', 'system', abilityRepairInput('en', batch), batch);

    assert.equal(result.unresolvedReviews, undefined);
    assert.equal(result.reviews.length, 1);
    assert.equal(result.reviews[0].index, 1);
    assert.equal(result.reviews[0].ability?.q[1].a, repaired.q[1].a);
    assert.equal(batch[0].ability!.q[0].a.split(' ').length, 28);
  });

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


describe('separate question and answer figure generation prompts', (): void => {
  const questionTikz = '\\begin{tikzpicture}\\draw (0,0)--(3,0);\\end{tikzpicture}';
  const ability = {
    h: 'Geometry', i: '', t: 3,
    q: [
      { h: 'Mark the midpoint on the segment.', a: 'At x=1.5', p: questionTikz, i: '', iPrompt: 'Show the midpoint' },
      { h: 'Find the length.', a: '3', p: '', i: '' }
    ]
  };

  it('omits solution text from question image generation', (): void => {
    const prompt = tikzRequestPrompt('en', ability, 0, 'Segment from (0,0) to (3,0)');

    assert.doesNotMatch(prompt, /Answer: At x=1.5/);
    assert.match(prompt, /must NOT show the final solution/);
  });

  it('reuses question TikZ as the geometry authority when generating an answer', (): void => {
    const prompt = answerTikzRequestPrompt('en', ability, 0, 'Show midpoint');

    assert.ok(prompt.includes(questionTikz));
    assert.match(prompt, /preserve its original objects, coordinates, scales, line styles/);
    assert.match(prompt, /Correct answer: At x=1.5/);
    assert.match(prompt, /Mark the midpoint on the segment/);
  });

  it('prefers native TikZ styling in question/answer generation and all image-fix prompts', (): void => {
    const stylingRule = 'Avoid LaTeX text-formatting macros (`\\underline`, `\\textbf`, `\\textit`, `\\textcolor`, `\\sout`, etc.). Use native TikZ node styles for fonts, sizes, and colors; draw underlines, strikethroughs, highlights, and borders geometrically. Preserve whitespace, avoid unsupported commands and package dependencies, and use separate named nodes when necessary. Prioritize correct rendering over code brevity.';
    const record: StoredAbility = { ability, content: JSON.stringify(ability), id: 'ability-geometry', moduleId: 'book-1-concept-3' };
    const target: ImageFixTarget = { ability, exerciseIndex: 0, field: 'p', imageId: 1, originalTikz: questionTikz, prompt: 'A segment', record };
    const preRender = { compiled: true, diagnostics: [], renderedSvg: '<svg/>', texInput: questionTikz };
    const review = { hasErrors: true, errors: ['Label overlap'], tikz: questionTikz };
    const prompts = [
      tikzRequestPrompt('en', ability, 0, 'A segment'),
      answerTikzRequestPrompt('en', ability, 0, 'Show midpoint'),
      tikzFixReviewPrompt('en', target, preRender),
      tikzCompileRepairPrompt('en', target, review, preRender),
      tikzDetectedProblemsRepairPrompt('en', target, review, preRender)
    ];

    for (const prompt of prompts) {
      assert.ok(prompt.includes(stylingRule), 'Every image and fix-image prompt must include the TikZ styling rule.');
    }
  });

  it('injects renderer-safe 3-D projection and measured-edge rules into every TikZ prompt', (): void => {
    const record: StoredAbility = { ability, content: JSON.stringify(ability), id: 'ability-geometry', moduleId: 'book-1-concept-3' };
    const target: ImageFixTarget = { ability, exerciseIndex: 0, field: 'p', imageId: 1, originalTikz: questionTikz, prompt: 'A stepped solid', record };
    const preRender = { compiled: true, diagnostics: [], renderedSvg: '<svg/>', texInput: questionTikz };
    const review = { hasErrors: true, errors: ['Bad geometry'], tikz: questionTikz };
    const prompts = [
      tikzRequestPrompt('en', ability, 0, 'A stepped solid'),
      answerTikzRequestPrompt('en', ability, 0, 'A stepped solid'),
      tikzFixReviewPrompt('en', target, preRender),
      tikzCompileRepairPrompt('en', target, review, preRender),
      tikzDetectedProblemsRepairPrompt('en', target, review, preRender)
    ];

    for (const prompt of prompts) {
      assert.match(prompt, /NEVER use 3-component coordinates/);
      assert.match(prompt, /precomputed ordinary 2-D coordinates/);
      assert.match(prompt, /visible exterior/);
      assert.match(prompt, /SAME 2-D translation offset/);
      assert.match(prompt, /EXACTLY ONE origin label \"0\"/);
    }
  });

  it('recognizes diagram-completion tasks but not ordinary word problems', (): void => {
    assert.equal(exerciseNeedsCompletedFigure('Shade the left half of the diagram.'), true);
    assert.equal(exerciseNeedsCompletedFigure('How many apples?'), false);
  });
});
