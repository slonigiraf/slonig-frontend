// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT } from './constants.js';
import { conceptChaptersFromPages, parseGeneratedChapterConcepts } from './conceptRecognition.js';

describe('chapter concept recognition', (): void => {
  it('groups pages into whole chapters before AI processing', (): void => {
    assert.deepEqual(conceptChaptersFromPages([
      { chapter: 'One', chapterId: 10, pageNumber: 3 },
      { chapter: 'One', chapterId: 10, pageNumber: 4 },
      { chapter: 'Two', chapterId: 11, pageNumber: 5 }
    ]), [
      { chapterId: 10, pageNumbers: [3, 4], title: 'One' },
      { chapterId: 11, pageNumbers: [5], title: 'Two' }
    ]);
  });

  it('excludes pages whose deleted chapter was removed from later analysis', (): void => {
    assert.deepEqual(conceptChaptersFromPages([
      { chapter: 'Keep', chapterId: 10, pageNumber: 1 },
      { chapter: '', excludedFromAnalysis: true, pageNumber: 2 },
      { chapter: 'Keep', chapterId: 10, pageNumber: 3 }
    ]), [
      { chapterId: 10, pageNumbers: [1, 3], title: 'Keep' }
    ]);
  });

  it('keeps the earliest page when the model repeats a concept within a chapter', (): void => {
    const result = parseGeneratedChapterConcepts(JSON.stringify({ concepts: [
      { description: 'Later explanation', pageNumber: 8, title: 'Linear equation' },
      { description: 'First introduction', pageNumber: 6, title: ' Linear   equation ' },
      { description: 'Another concept', pageNumber: 7, title: 'Slope' }
    ] }), new Set([6, 7, 8]));

    assert.deepEqual(result.concepts, [
      { description: 'First introduction', pageNumber: 6, title: 'Linear   equation' },
      { description: 'Another concept', pageNumber: 7, title: 'Slope' }
    ]);
  });

  it('rejects a concept that points outside the supplied chapter pages', (): void => {
    assert.throws(() => parseGeneratedChapterConcepts(JSON.stringify({ concepts: [
      { description: 'Bad reference', pageNumber: 99, title: 'Concept' }
    ] }), new Set([1, 2, 3])), /invalid chapter concept data/);
  });
  it('builds one prompt containing every page in the chapter and requests first-page references', (): void => {
    const prompt = BOOK_CHAPTER_EXTRACTION_REQUEST_PROMPT('Algebra', [
      { imageNames: [], pageNumber: 6, text: 'First page text' },
      { imageNames: ['figure.png'], pageNumber: 7, text: 'Second page text' }
    ]);

    assert.match(prompt, /complete supplied chapter/i);
    assert.match(prompt, /smallest useful knowledge unit/i);
    assert.match(prompt, /minimal independently teachable/i);
    assert.match(prompt, /prefer producing several small concepts/i);
    assert.match(prompt, /A and B/i);
    assert.match(prompt, /Mean, median, and mode/i);
    assert.match(prompt, /Slope and y-intercept/i);
    assert.match(prompt, /definition together with a separate property/i);
    assert.match(prompt, /Do not emit a broad parent concept/i);
    assert.match(prompt, /Granularity comes before deduplication/i);
    assert.match(prompt, /Could a learner know one meaningful part/i);
    assert.match(prompt, /Favor over-splitting over under-splitting/i);
    assert.match(prompt, /earliest supplied page/i);
    assert.match(prompt, /--- page 6 ---/);
    assert.match(prompt, /--- page 7 ---/);
    assert.match(prompt, /"pageNumber":12/);
  });

});
