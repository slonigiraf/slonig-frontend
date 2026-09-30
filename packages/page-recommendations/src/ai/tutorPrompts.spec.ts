// Copyright 2021-2026 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { StageType, type AlgorithmStage } from '../Teach/AlgorithmStage.js';
import { decisionPrompt } from './tutorPrompts.js';
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
