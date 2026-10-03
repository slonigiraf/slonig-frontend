import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { skillTranscriptionKeywords, transcriptionLanguages } from './transcriptionHints.js';

const skill = {
  id: 'biology-atp',
  cid: 'cid',
  title: 'Cellular energy and ATP',
  description: 'Recognize biochemical energy vocabulary.',
  questions: [
    {
      question: 'Which molecule is the main energy carrier in cells?',
      answer: 'Adenosine triphosphate (ATP)',
    },
    {
      question: 'Name the organelle associated with oxidative phosphorylation.',
      answer: 'Mitochondria',
    },
    {
      question: 'Write the concentration as <kx>6.02 × 10^23</kx> particles.',
      answer: '<kx>6.02 × 10^23</kx>',
    },
  ],
};

describe('AI tutor transcription hints', (): void => {
  it('extracts expected scientific vocabulary and notation from the skill', (): void => {
    const keywords = skillTranscriptionKeywords(skill);

    assert.ok(keywords.includes('ATP'));
    assert.ok(keywords.includes('Adenosine'));
    assert.ok(keywords.includes('triphosphate'));
    assert.ok(keywords.includes('Mitochondria'));
    assert.ok(keywords.includes('6.02'));
    assert.ok(keywords.includes('10^23'));
    assert.ok(keywords.every((keyword) => !/[<>\r\n]/.test(keyword)));
  });

  it('allows the detected lesson language and English without duplicates', (): void => {
    assert.deepEqual(transcriptionLanguages('ru'), ['ru', 'en']);
    assert.deepEqual(transcriptionLanguages('en'), ['en']);
    assert.deepEqual(transcriptionLanguages(undefined), ['en']);
  });
});
