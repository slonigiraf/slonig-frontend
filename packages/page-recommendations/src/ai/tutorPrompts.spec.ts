// Copyright 2021-2026 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StageType, type AlgorithmStage } from '../Teach/AlgorithmStage.js';
import { decisionPrompt, formatGeneratedStageMessage, generatedStagePrompt } from './tutorPrompts.js';
import type { AiSkill } from './lessonStore.js';

function nextStage(type: StageType, name: string): AlgorithmStage {
  return {
    getName: () => name,
    getType: () => type,
  } as unknown as AlgorithmStage;
}

function createSimilarStage(type: StageType): AlgorithmStage {
  const created = nextStage(StageType.provide_fake_solution, 'Yes');
  const repeat = nextStage(StageType.ask_to_repeat_similar_exercise, 'No');
  const previous = type === StageType.cycle_ask_to_create_similar_exercise
    ? {
      getMessages: () => [{ title: 'Repeat after me:', text: '', exercise: 'PREVIOUSLY_SHOWN_REPEAT_EXERCISE' }],
    } as unknown as AlgorithmStage
    : null;

  return {
    getActionHint: () => 'Has the student created a similar exercise?',
    getMessages: () => [{
      title: 'Create an exercise similar to this:',
      text: '',
      exercise: 'Given endpoint = "wss://alpha.example", write an Effect that connects, cleans up, and depends on endpoint.',
    }],
    getNext: () => [created, repeat],
    getPrevious: () => previous,
    getType: () => type,
  } as unknown as AlgorithmStage;
}

const skill: AiSkill = {
  id: 'effect-lifecycle',
  cid: 'effect-lifecycle-cid',
  title: 'React Effect lifecycle',
  description: 'Create an Effect with setup, cleanup, and the correct dependency.',
  questions: [
    {
      question: 'Shown DB example',
      answer: 'Shown answer',
    },
    {
      question: 'HIDDEN_DB_EXAMPLE_DO_NOT_USE_FOR_ORIGINALITY',
      answer: 'HIDDEN_DB_ANSWER',
    },
  ],
};

const studentExercise = 'Given url="http://example.com", write useEffect that connects to db, disconnects on cleanup and depends on url.';

describe('AI Tutor similar-exercise decisions', (): void => {
  for (const type of [
    StageType.begin_ask_to_create_similar_exercise,
    StageType.ask_to_create_similar_exercise,
    StageType.cycle_ask_to_create_similar_exercise,
  ]) {
    it(`acceptance rubric for ${type} allows a new parallel task instance`, (): void => {
      const prompt = decisionPrompt(skill, createSimilarStage(type), studentExercise, '', '', 0);

      assert.match(prompt, /same skill, solution pattern/i);
      assert.match(prompt, /changes concrete inputs, values, identifiers, resources/i);
      assert.match(prompt, /Close wording is allowed/i);
      assert.match(prompt, /programming\/lifecycle pattern counts as a valid similar exercise/i);
      assert.doesNotMatch(prompt, /lightly paraphrased.*NOT/i);
    });

    it(`does not expose hidden DB examples to ${type} originality grading`, (): void => {
      const prompt = decisionPrompt(skill, createSimilarStage(type), studentExercise, '', '', 0);

      assert.match(prompt, /wss:\/\/alpha\.example/);
      assert.match(prompt, /http:\/\/example\.com/);
      assert.doesNotMatch(prompt, /HIDDEN_DB_EXAMPLE_DO_NOT_USE_FOR_ORIGINALITY/);
      assert.doesNotMatch(prompt, /HIDDEN_DB_ANSWER/);
    });
  }

  it('keeps the actually shown repeat-after-me exercise in the cycle originality context', (): void => {
    const prompt = decisionPrompt(
      skill,
      createSimilarStage(StageType.cycle_ask_to_create_similar_exercise),
      studentExercise,
      '',
      '',
      0,
    );

    assert.match(prompt, /Previously shown stage instructions/);
    assert.match(prompt, /PREVIOUSLY_SHOWN_REPEAT_EXERCISE/);
    assert.match(prompt, /do not count merely repeating the exercise from the previous stage/i);
  });
});

describe('AI Tutor generated fake solution wording', (): void => {
  it('wraps a generated fake solution with the required wording', (): void => {
    const stage = nextStage(StageType.provide_fake_solution, 'Fake solution');

    assert.equal(
      formatGeneratedStageMessage(stage, '2 + 2 = 5.'),
      'I think the solution is: 2 + 2 = 5. Please, correct mistakes.',
    );
  });

  it('does not duplicate the wrapper if the model adds it anyway', (): void => {
    const stage = nextStage(StageType.provide_fake_solution, 'Fake solution');

    assert.equal(
      formatGeneratedStageMessage(stage, 'I think the solution is: 2 + 2 = 5. Please, correct mistakes.'),
      'I think the solution is: 2 + 2 = 5. Please, correct mistakes.',
    );
  });

  it('tells the model to return only the fake-solution body', (): void => {
    const stage = nextStage(StageType.provide_fake_solution, 'Fake solution');
    const prompt = generatedStagePrompt(skill, stage, studentExercise);

    assert.match(prompt, /Return only the wrong solution itself in message/i);
    assert.match(prompt, /UI adds the required wording around the solution/i);
  });
  it('requires language-tagged fenced code in both fake and correct solution prompts', (): void => {
    const fakeStage = nextStage(StageType.provide_fake_solution, 'Fake solution');
    const correctStage = nextStage(StageType.correct_fake_solution, 'Correct solution');

    for (const prompt of [
      generatedStagePrompt(skill, fakeStage, studentExercise),
      generatedStagePrompt(skill, correctStage, studentExercise),
    ]) {
      assert.match(prompt, /every code snippet in a fenced Markdown code block/i);
      assert.match(prompt, /opening fence MUST include the actual language identifier/i);
      assert.match(prompt, /Never return source code as plain prose, inline backticks, or an unlabeled/i);
    }
  });

  it('adds a detected language to an unlabeled fake-solution code fence', (): void => {
    const stage = nextStage(StageType.provide_fake_solution, 'Fake solution');
    const generated = '```\nconst total = items.length + 1;\n```';

    assert.equal(
      formatGeneratedStageMessage(stage, generated),
      'I think the solution is:\n```javascript\nconst total = items.length + 1;\n```\nPlease, correct mistakes.',
    );
  });

  it('does not render a standalone period after a language-tagged code fence', (): void => {
    const stage = nextStage(StageType.provide_fake_solution, 'Fake solution');
    const generated = '```javascript\nfunction Report() {\n  return null;\n}\n```';

    assert.equal(
      formatGeneratedStageMessage(stage, generated),
      'I think the solution is:\n```javascript\nfunction Report() {\n  return null;\n}\n```\nPlease, correct mistakes.',
    );
  });

  it('adds a detected language to an unlabeled correct-solution code fence', (): void => {
    const stage = nextStage(StageType.correct_fake_solution, 'Correct solution');
    const generated = 'Use this:\n```\ndef greet(name):\n    print(name)\n```\nNow repeat the correct solution from memory.';

    assert.equal(
      formatGeneratedStageMessage(stage, generated),
      'Use this:\n```python\ndef greet(name):\n    print(name)\n```\nNow repeat the correct solution from memory.',
    );
  });

  it('preserves an existing language tag on generated code fences', (): void => {
    const stage = nextStage(StageType.correct_fake_solution, 'Correct solution');
    const generated = '```typescript\nconst answer: number = 42;\n```';

    assert.equal(formatGeneratedStageMessage(stage, generated), generated);
  });

});
