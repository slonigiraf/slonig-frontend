// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { areAllBookPagesConceptsProcessed, calculatePageSymbolStatistics, countUnprocessedBookPages, isWithinTwoStandardDeviations, MAX_EXERCISE_GENERATION_RETRIES, processExtractedChapterContent } from './bookProcessing.js';

describe('book processing pipeline', (): void => {

  it('calculates book page symbol statistics and identifies pages within two standard deviations', (): void => {
    const statistics = calculatePageSymbolStatistics(['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100), 'd'.repeat(200)]);

    assert.ok(statistics);
    assert.equal(statistics.mean, 125);
    assert.ok(Math.abs(statistics.standardDeviation - 43.30127018922193) < 1e-10);
    assert.equal(isWithinTwoStandardDeviations(100, statistics), true);
    assert.equal(isWithinTwoStandardDeviations(220, statistics), false);
  });

  it('treats equal-length pages as within two standard deviations when standard deviation is zero', (): void => {
    const statistics = calculatePageSymbolStatistics(['a'.repeat(50), 'b'.repeat(50)]);

    assert.ok(statistics);
    assert.equal(statistics.mean, 50);
    assert.equal(statistics.standardDeviation, 0);
    assert.equal(isWithinTwoStandardDeviations(50, statistics), true);
    assert.equal(isWithinTwoStandardDeviations(49, statistics), false);
  });

  it('includes zero-symbol recognized pages in the book mean and standard deviation', (): void => {
    const statistics = calculatePageSymbolStatistics(['', 'a'.repeat(100), 'b'.repeat(100)]);

    assert.ok(statistics);
    assert.ok(Math.abs(statistics.mean - (200 / 3)) < 1e-10);
    assert.ok(statistics.standardDeviation > 0);
  });

  it('treats a processed page with zero concepts as complete for the Exercises stage', (): void => {
    const pages = [
      { conceptsProcessed: true, pageNumber: 1 },
      { conceptsProcessed: true, pageNumber: 2 },
      { conceptsProcessed: true, pageNumber: 3 }
    ];

    assert.equal(areAllBookPagesConceptsProcessed(3, pages), true);
    assert.equal(countUnprocessedBookPages(3, pages), 0);
  });

  it('keeps Exercises locked only while a page is actually unprocessed', (): void => {
    const pages = [
      { conceptsProcessed: true, pageNumber: 1 },
      { conceptsProcessed: false, pageNumber: 2 },
      { conceptsProcessed: true, pageNumber: 3 }
    ];

    assert.equal(areAllBookPagesConceptsProcessed(3, pages), false);
    assert.equal(countUnprocessedBookPages(3, pages), 1);
  });

  it('generates one exercise per concept without sending or reconciling book exercises', async (): Promise<void> => {
    const prompts: string[] = [];
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Convert units', title: 'Conversion' }, { description: 'Compare fractions', title: 'Comparison' }],
        exercises: [
          { abilityMode: 'reasoning', description: 'Convert 2 km to m.', solution: '2000 m', title: 'Book exercise 1' },
          { abilityMode: 'reasoning', description: 'Find the missing angle.', solution: '60 degrees', title: 'Book exercise 2' }
        ],
        pageNumber: 1
      }]
    }, (prompt) => {
      prompts.push(prompt);

      if (prompts.length === 1) {
        assert.match(prompt, /exactly one complete exercise/i);
        assert.match(prompt, /Prefer abilityMode "transformation"/i);
        assert.match(prompt, /later be reused by changing 1-3 data-bearing words or values/i);
        assert.doesNotMatch(prompt, /bookExercises|bookExerciseIndex|overlappingBookExerciseIndexes/i);

        const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { concepts: Array<{ conceptIndex: number }> };

        assert.deepEqual(Object.keys(input), ['concepts']);
        assert.deepEqual(input.concepts.map(({ conceptIndex }) => conceptIndex), [0, 1]);

        return Promise.resolve(JSON.stringify({
          exercises: [
            { abilityMode: 'reasoning', conceptIndex: 0, description: 'Convert 3 km.', solution: '3000 m', title: 'Weaker candidate' },
            { abilityMode: 'transformation', conceptIndex: 0, description: 'Convert 3 km to m.', solution: '3000 m', title: 'Preferred candidate' },
            { abilityMode: 'transformation', conceptIndex: 1, description: 'Order <kx>1/2, 3/4</kx>.', solution: '<kx>1/2 < 3/4</kx>', title: 'Order fractions' }
          ]
        }));
      }

      throw new Error('Exercise generation must not make a second visual-correction request.');
    });

    assert.equal(prompts.length, 1);
    assert.equal(result.pages[0].exercises.length, 4);
    assert.deepEqual(result.pages[0].exercises.filter(({ source }) => source === 'book').map(({ title }) => title), ['Book exercise 1', 'Book exercise 2']);
    assert.equal(result.pages[0].exercises.filter(({ source }) => source === 'generated').length, 2);
    assert.deepEqual(result.pages[0].exercises.filter(({ source }) => source === 'generated').map(({ conceptIndex }) => conceptIndex), [0, 1]);
    assert.equal(result.pages[0].exercises.find(({ conceptIndex, source }) => source === 'generated' && conceptIndex === 0)?.abilityMode, 'transformation');
  });

  it('keeps every distinct source book exercise when there are no concepts', async (): Promise<void> => {
    let calls = 0;
    const duplicateBookExercise = { abilityMode: 'reasoning' as const, description: 'Compute <kx>2+2</kx>.', solution: '<kx>4</kx>', title: 'Compute' };
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [
        { concepts: [], exercises: [duplicateBookExercise], pageNumber: 1 },
        { concepts: [], exercises: [duplicateBookExercise], pageNumber: 2 }
      ]
    }, () => {
      calls++;

      return Promise.resolve('{}');
    });

    assert.equal(calls, 0);
    assert.equal(result.pages[0].exercises.length, 1);
    assert.equal(result.pages[1].exercises.length, 1);
    assert.equal(result.pages[0].exercises[0].source, 'book');
    assert.equal(result.pages[1].exercises[0].source, 'book');
  });

  it('stores Exercise visual descriptions without storing image bytes', async (): Promise<void> => {
    let request = 0;
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Read number lines', title: 'Number line' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      request++;
      assert.match(prompt, /single generation pass/i);
      assert.match(prompt, /text-only/i);
      assert.match(prompt, /merely illustrative/i);

      return Promise.resolve(JSON.stringify({
        exercises: [{
          abilityMode: 'perceptual observation',
          conceptIndex: 0,
          description: 'Read the marked value.',
          imageDescription: 'A horizontal number line from 0 to 10 with a single unlabeled point at 6.',
          solution: '6',
          solutionImageDescription: '',
          title: 'Read number line'
        }]
      }));
    });

    assert.equal(request, 1);
    assert.equal(result.pages[0].exercises.length, 1);
    assert.match(result.pages[0].exercises[0].imageDescription ?? '', /number line/i);
    assert.equal(result.pages[0].exercises[0].solutionImageDescription ?? '', '');
    assert.equal('solutionImageDescription' in result.pages[0].exercises[0], false);
    assert.equal('image' in result.pages[0].exercises[0], false);
    assert.equal('images' in result.pages[0].exercises[0], false);
  });

  it('designs a required solution visual in the same generation pass', async (): Promise<void> => {
    let requests = 0;
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Plot ordered pairs', title: 'Coordinate plotting' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      requests++;
      assert.match(prompt, /single generation pass/i);
      assert.match(prompt, /no second visual-design pass will run/i);
      assert.match(prompt, /solutionImageDescription/);
      assert.match(prompt, /draw, sketch, plot, graph, construct/i);

      return Promise.resolve(JSON.stringify({
        exercises: [{
          abilityMode: 'transformation',
          conceptIndex: 0,
          description: 'Plot <kx>(4,-2)</kx>.',
          imageDescription: '',
          solution: 'Plot right 4, down 2.',
          solutionImageDescription: 'A coordinate plane with the point (4,-2) plotted and labeled.',
          title: 'Plot point'
        }]
      }));
    });

    assert.equal(requests, 1);
    assert.match(result.pages[0].exercises[0].solutionImageDescription ?? '', /\(4,-2\)/);
  });

  it('keeps a text-only exercise text-only without a later visual correction pass', async (): Promise<void> => {
    let requests = 0;
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Convert kilometers to meters', title: 'Metric conversion' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      requests++;
      assert.match(prompt, /Visuals are exceptional/i);
      assert.match(prompt, /leave imageDescription empty/i);
      assert.match(prompt, /leave solutionImageDescription empty/i);
      assert.match(prompt, /no second visual-design pass will run/i);

      return Promise.resolve(JSON.stringify({
        exercises: [{
          abilityMode: 'transformation',
          conceptIndex: 0,
          description: 'Convert <kx>3</kx> km to m.',
          imageDescription: '',
          solution: '<kx>3\\times1000=3000</kx> m.',
          solutionImageDescription: '',
          title: 'Convert distance'
        }]
      }));
    });

    const generated = result.pages[0].exercises[0];

    assert.equal(requests, 1);
    assert.equal(generated.imageDescription ?? '', '');
    assert.equal(generated.solutionImageDescription ?? '', '');
    assert.equal('imageDescription' in generated, false);
    assert.equal('solutionImageDescription' in generated, false);
  });

  it('retries missing concepts together up to three times', async (): Promise<void> => {
    const prompts: string[] = [];
    const exercise = (conceptIndex: number): Record<string, unknown> => ({ abilityMode: 'transformation', conceptIndex, description: `Task ${conceptIndex}`, solution: `Solution ${conceptIndex}`, title: `Exercise ${conceptIndex}` });
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'A', title: 'Concept A' }, { description: 'B', title: 'Concept B' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      prompts.push(prompt);

      if (prompts.length === 1) {
        return Promise.resolve(JSON.stringify({ exercises: [exercise(0)] }));
      }

      if (prompts.length <= 3) {
        const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { concepts: Array<{ conceptIndex: number }> };

        assert.deepEqual(input.concepts.map(({ conceptIndex }) => conceptIndex), [1]);

        return Promise.resolve('{"exercises":[]}');
      }

      if (prompts.length === 4) {
        assert.match(prompt, /recovery attempt 3 of 3/i);

        return Promise.resolve(JSON.stringify({ exercises: [exercise(1)] }));
      }

      throw new Error('Unexpected exercise-generation request.');
    });

    assert.equal(MAX_EXERCISE_GENERATION_RETRIES, 3);
    assert.equal(prompts.length, 4);
    assert.deepEqual(result.pages[0].exercises.map(({ conceptIndex }) => conceptIndex), [0, 1]);
  });
});
