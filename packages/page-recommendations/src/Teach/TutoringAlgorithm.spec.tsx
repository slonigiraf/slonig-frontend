// Copyright 2021-2026 @slonigiraf/app-recommendations authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { Skill } from '@slonigiraf/slonig-components';

import { StageType } from './AlgorithmStage.js';
import { TutoringAlgorithm } from './TutoringAlgorithm.js';

const skill: Skill = {
  i: 'skill-1',
  h: 'Addition',
  q: [
    { h: '2 + 2 = ?', a: '4', p: '', i: '' },
    { h: '3 + 3 = ?', a: '6', p: '', i: '' },
  ],
};

const t = (key: string): string => key;

function algorithm(variation: 'regular' | 'ai_tutor'): TutoringAlgorithm {
  return new TutoringAlgorithm({
    variation,
    studentName: 'student',
    stake: '0',
    canIssueBadge: false,
    skill,
    hasTuteeUsedSlonig: true,
    t,
  });
}

describe('TutoringAlgorithm AI Tutor entry check', (): void => {
  it('starts AI Tutor by asking the student to solve an exercise', (): void => {
    const begin = algorithm('ai_tutor').getBegin();

    assert.equal(begin.getType(), StageType.begin_ask_to_solve_exercise);
    assert.deepEqual(
      begin.getNext().map((stage) => stage.getType()),
      [StageType.next_skill, StageType.begin_ask_to_create_similar_exercise],
    );
  });

  it('sends an incorrect AI Tutor pre-check into the existing regular tutoring path', (): void => {
    const begin = algorithm('ai_tutor').getBegin();
    const tutoringBegin = begin.getNext()[1];

    assert.equal(tutoringBegin.getType(), StageType.begin_ask_to_create_similar_exercise);
    assert.deepEqual(
      tutoringBegin.getNext().map((stage) => stage.getType()),
      [StageType.skip, StageType.provide_fake_solution, StageType.ask_to_repeat_similar_exercise],
    );
  });

  it('keeps the human regular tutoring entry point unchanged', (): void => {
    assert.equal(algorithm('regular').getBegin().getType(), StageType.begin_ask_to_create_similar_exercise);
  });
});
