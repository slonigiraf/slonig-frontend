// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { areAllBookPagesConceptsProcessed, calculatePageSymbolStatistics, countUnprocessedBookPages, exerciseAbilityModes, GENERATED_EXERCISES_PER_CONCEPT, isWithinTwoStandardDeviations, MAX_EXERCISE_GENERATION_RETRIES, processExtractedChapterContent } from './bookProcessing.js';

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

  it('refines concepts, generates and merges exercises, then splits only the merged exercises', async (): Promise<void> => {
    const prompts: string[] = [];

    const runAi = (prompt: string): Promise<string> => {
      prompts.push(prompt);

      if (prompts.length === 1) {
        assert.doesNotMatch(prompt, /Book exercise/);

        return Promise.resolve(JSON.stringify({ concepts: [
          { description: 'First refinement', inputIndex: 0, title: 'Refined A' },
          { description: 'Second refinement', inputIndex: 0, title: 'Refined B' }
        ] }));
      }

      if (prompts.length === 2) {
        assert.match(prompt, /Refined A/);
        assert.match(prompt, /Refined B/);
        assert.doesNotMatch(prompt, /Book exercise/);

        return Promise.resolve(JSON.stringify({ concepts: [
          { description: 'Atomic A', inputIndex: 0, title: 'Atomic A' },
          { description: 'Atomic B', inputIndex: 1, title: 'Atomic B' }
        ] }));
      }

      if (prompts.length === 3) {
        assert.match(prompt, /Atomic A/);
        assert.match(prompt, /Atomic B/);
        assert.doesNotMatch(prompt, /Broad concept/);

        return Promise.resolve(JSON.stringify({ exercises: Array.from({ length: 8 }, (_, index) => ({
          abilityMode: exerciseAbilityModes[index % exerciseAbilityModes.length],
          conceptIndex: Math.floor(index / 4),
          description: `Generated task ${index}`,
          solution: `Generated solution ${index}`,
          title: `Generated ${index}`
        })) }));
      }

      const parsed = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: Array<{ abilityMode: string; description: string; inputIndex: number; solution: string; title: string }> };

      assert.equal(parsed.exercises.length, 9);
      assert.ok(parsed.exercises.some(({ title }) => title === 'Book exercise'));
      assert.ok(parsed.exercises.some(({ title }) => title === 'Generated 0'));

      return Promise.resolve(JSON.stringify({ exercises: parsed.exercises }));
    };

    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Broad description', title: 'Broad concept' }],
        exercises: [{ abilityMode: 'reasoning', description: 'Complete book task', solution: 'Book solution', title: 'Book exercise' }],
        pageNumber: 1
      }]
    }, runAi);

    assert.equal(GENERATED_EXERCISES_PER_CONCEPT, 4);
    assert.equal(prompts.length, 6);
    assert.deepEqual(result.pages[0].concepts.map(({ title }) => title), ['Atomic A', 'Atomic B']);
    assert.equal(result.pages[0].exercises.length, 9);
    assert.equal(result.pages[0].exercises.filter(({ source }) => source === 'book').length, 1);
    assert.equal(result.pages[0].exercises.filter(({ source }) => source === 'generated').length, 8);
    assert.deepEqual(new Set(result.pages[0].exercises.filter(({ source }) => source === 'generated').map(({ conceptIndex }) => conceptIndex)), new Set([0, 1]));
    assert.ok(result.pages[0].exercises.every(({ abilityMode }) => exerciseAbilityModes.includes(abilityMode as typeof exerciseAbilityModes[number])));
  });

  it('stores Exercise visual descriptions without storing image bytes', async (): Promise<void> => {
    const prompts: string[] = [];
    const runAi = (prompt: string): Promise<string> => {
      prompts.push(prompt);

      if (prompts.length <= 2) {
        return Promise.resolve(JSON.stringify({ concepts: [{ description: 'Atomic', inputIndex: 0, title: 'Concept' }] }));
      }

      if (prompts.length === 3) {
        assert.match(prompt, /text-only/i);
        assert.match(prompt, /merely illustrative/i);

        return Promise.resolve(JSON.stringify({ exercises: [{
          abilityMode: 'perceptual observation',
          conceptIndex: 0,
          description: 'Read the marked value from the number line.',
          imageDescription: 'A horizontal number line from 0 to 10 with a single unlabeled point at 6.',
          solution: 'The marked value is 6.',
          solutionImageDescription: '',
          title: 'Read the number line'
        }] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: unknown[] };

      return Promise.resolve(JSON.stringify({ exercises: input.exercises }));
    };
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Atomic', title: 'Concept' }],
        exercises: [],
        pageNumber: 1
      }]
    }, runAi);

    assert.equal(result.pages[0].exercises.length, 1);
    assert.match(result.pages[0].exercises[0].imageDescription ?? '', /number line/i);
    assert.equal(result.pages[0].exercises[0].solutionImageDescription, '');
    assert.equal('image' in result.pages[0].exercises[0], false);
    assert.equal('images' in result.pages[0].exercises[0], false);
  });

  it('preserves a required solution-image description for a drawing result', async (): Promise<void> => {
    let request = 0;
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Plot ordered pairs', title: 'Coordinate plotting' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      request++;

      if (request <= 2) {
        return Promise.resolve(JSON.stringify({ concepts: [{ description: 'Plot ordered pairs', inputIndex: 0, title: 'Coordinate plotting' }] }));
      }

      if (request === 3) {
        assert.match(prompt, /solutionImageDescription/);
        assert.match(prompt, /draw, sketch, plot, graph, construct/i);

        return Promise.resolve(JSON.stringify({ exercises: [{
          abilityMode: 'generation',
          conceptIndex: 0,
          description: 'Plot the point <kx>(2,3)</kx> on a coordinate plane.',
          imageDescription: '',
          solution: 'Place the point two units right and three units up from the origin.',
          solutionImageDescription: 'A coordinate plane with x- and y-axes and the point (2,3) correctly plotted and labeled.',
          title: 'Plot an ordered pair'
        }] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: unknown[] };

      return Promise.resolve(JSON.stringify({ exercises: input.exercises }));
    });

    assert.equal(result.pages[0].exercises[0].imageDescription, '');
    assert.match(result.pages[0].exercises[0].solutionImageDescription ?? '', /point \(2,3\)/i);
    assert.equal('image' in result.pages[0].exercises[0], false);
    assert.equal('images' in result.pages[0].exercises[0], false);
  });

  it('does not let split/refinement erase an existing required solution image description', async (): Promise<void> => {
    let request = 0;
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Plot ordered pairs', title: 'Coordinate plotting' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      request++;

      if (request <= 2) {
        return Promise.resolve(JSON.stringify({ concepts: [{ description: 'Plot ordered pairs', inputIndex: 0, title: 'Coordinate plotting' }] }));
      }

      if (request === 3) {
        return Promise.resolve(JSON.stringify({ exercises: [{
          abilityMode: 'generation',
          conceptIndex: 0,
          description: 'Plot the point <kx>(4,-2)</kx> on a coordinate plane.',
          imageDescription: '',
          solution: 'Move four units right and two units down, then plot the point.',
          solutionImageDescription: 'A coordinate plane with the point (4,-2) plotted and labeled.',
          title: 'Plot a point'
        }] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: Array<Record<string, unknown>> };

      if (request <= 5) {
        assert.match(prompt, /NEVER erase an existing nonempty solutionImageDescription/i);

        return Promise.resolve(JSON.stringify({ exercises: input.exercises.map((exercise) => ({ ...exercise, solutionImageDescription: '' })) }));
      }

      assert.match(prompt, /dedicated solution-visual audit/i);
      assert.match(prompt, /NEVER return an empty replacement/i);

      return Promise.resolve(JSON.stringify({ reviews: [{ inputIndex: 0, requiresSolutionImage: true, solutionImageDescription: '' }] }));
    });

    assert.match(result.pages[0].exercises[0].solutionImageDescription ?? '', /\(4,-2\)/);
  });

  it('requires generation and refinement prompts to classify visual-output answers', async (): Promise<void> => {
    const prompts: string[] = [];

    await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Geometric construction', title: 'Construct a perpendicular bisector' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      prompts.push(prompt);

      if (prompts.length <= 2) {
        return Promise.resolve(JSON.stringify({ concepts: [{ description: 'Geometric construction', inputIndex: 0, title: 'Construct a perpendicular bisector' }] }));
      }

      if (prompts.length === 3) {
        assert.match(prompt, /EXPECTED ANSWER FORMAT/i);
        assert.match(prompt, /draw, sketch, plot, graph, construct/i);
        assert.match(prompt, /solutionImageDescription MUST be nonempty/i);

        return Promise.resolve(JSON.stringify({ exercises: [{
          abilityMode: 'generation',
          conceptIndex: 0,
          description: 'Construct the perpendicular bisector of segment AB.',
          imageDescription: '',
          solution: 'Use equal-radius arcs from A and B and connect their intersections.',
          solutionImageDescription: 'Segment AB with equal-radius construction arcs and the completed perpendicular bisector through the two arc intersections.',
          title: 'Construct a perpendicular bisector'
        }] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: unknown[] };

      if (prompts.length <= 5) {
        assert.match(prompt, /visual-output exercise/i);

        return Promise.resolve(JSON.stringify({ exercises: input.exercises }));
      }

      assert.match(prompt, /dedicated solution-visual audit/i);
      assert.match(prompt, /requiresSolutionImage MUST be true/i);

      return Promise.resolve(JSON.stringify({ reviews: [{ inputIndex: 0, requiresSolutionImage: true, solutionImageDescription: 'Segment AB with equal-radius construction arcs and the completed perpendicular bisector through the two arc intersections.' }] }));
    });
  });

  it('fills a missing solution image description in the dedicated final visual audit', async (): Promise<void> => {
    let request = 0;
    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Graph linear functions', title: 'Graphing' }],
        exercises: [],
        pageNumber: 1
      }]
    }, (prompt) => {
      request++;

      if (request <= 2) {
        return Promise.resolve(JSON.stringify({ concepts: [{ description: 'Graph linear functions', inputIndex: 0, title: 'Graphing' }] }));
      }

      if (request === 3) {
        return Promise.resolve(JSON.stringify({ exercises: [{
          abilityMode: 'generation',
          conceptIndex: 0,
          description: 'Graph <kx>y=2x+1</kx>.',
          imageDescription: '',
          solution: 'Plot the intercept (0,1), use slope 2 to plot (1,3), and draw the line through the points.',
          solutionImageDescription: '',
          title: 'Graph a line'
        }] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: unknown[] };

      if (request <= 5) {
        return Promise.resolve(JSON.stringify({ exercises: input.exercises }));
      }

      assert.match(prompt, /dedicated solution-visual audit/i);

      return Promise.resolve(JSON.stringify({ reviews: [{
        inputIndex: 0,
        requiresSolutionImage: true,
        solutionImageDescription: 'A coordinate plane with the completed line y=2x+1 passing through the labeled points (0,1) and (1,3).'
      }] }));
    });

    assert.match(result.pages[0].exercises[0].solutionImageDescription ?? '', /y=2x\+1/i);
  });

  it('retains prior results when a split pass is empty', async (): Promise<void> => {
    let request = 0;

    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'Atomic', title: 'Concept' }],
        exercises: [],
        pageNumber: 1
      }]
    }, () => Promise.resolve(request++ < 2 ? '{}' : JSON.stringify({ exercises: [] })));

    assert.deepEqual(result.pages[0].concepts, [{ description: 'Atomic', title: 'Concept' }]);
    assert.deepEqual(result.pages[0].exercises, []);
  });

  it('retries missing concepts together up to three times', async (): Promise<void> => {
    const prompts: string[] = [];
    const exercise = (conceptIndex: number): Record<string, unknown> => ({ abilityMode: 'reasoning', conceptIndex, description: `Task ${conceptIndex}`, solution: `Solution ${conceptIndex}`, title: `Exercise ${conceptIndex}` });

    const runAi = (prompt: string): Promise<string> => {
      prompts.push(prompt);

      if (prompts.length <= 2) {
        return Promise.resolve('{}');
      }

      if (prompts.length === 3) {
        return Promise.resolve(JSON.stringify({ exercises: [exercise(0)] }));
      }

      if (prompts.length <= 5) {
        const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { concepts: Array<{ conceptIndex: number }> };

        assert.deepEqual(input.concepts.map(({ conceptIndex }) => conceptIndex), [1]);

        return Promise.resolve('{"exercises":[]}');
      }

      if (prompts.length === 6) {
        assert.match(prompt, /recovery attempt 3 of 3/i);

        return Promise.resolve(JSON.stringify({ exercises: [exercise(1)] }));
      }

      const input = JSON.parse(prompt.slice(prompt.lastIndexOf('\n') + 1)) as { exercises: unknown[] };

      return Promise.resolve(JSON.stringify({ exercises: input.exercises }));
    };

    const result = await processExtractedChapterContent({
      chapter: 'Chapter',
      pages: [{
        concepts: [{ description: 'A', title: 'Concept A' }, { description: 'B', title: 'Concept B' }],
        exercises: [],
        pageNumber: 1
      }]
    }, runAi);

    assert.equal(MAX_EXERCISE_GENERATION_RETRIES, 3);
    assert.equal(prompts.length, 9);
    assert.deepEqual(result.pages[0].exercises.map(({ conceptIndex }) => conceptIndex), [0, 1]);
  });
});
