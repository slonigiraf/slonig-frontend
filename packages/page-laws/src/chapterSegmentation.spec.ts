// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chapterAssignmentsFromBoundaries, chapterEvidenceWindows, extractMathpixHeadingsFromLines, extractMmdHeadings, parseChapterBoundaries } from './chapterSegmentation.js';

describe('chapter segmentation', (): void => {
  it('keeps only usable Mathpix title and section-header line evidence', (): void => {
    assert.deepEqual(extractMathpixHeadingsFromLines({ pages: [{ lines: [
      { confidence: 0.98, conversion_output: true, line: 2, text: 'Chapter 4', type: 'title' },
      { confidence: 0.91, line: 5, text: '4.1 Fractions', type: 'section_header' },
      { conversion_output: false, line: 6, text: 'Hidden heading', type: 'section_header' },
      { line: 7, text: 'Chapter 5 ..... 99', type: 'table_of_contents_row' }
    ] }] }), [
      { confidence: 0.98, line: 2, text: 'Chapter 4', type: 'title' },
      { confidence: 0.91, line: 5, text: '4.1 Fractions', type: 'section_header' }
    ]);
  });

  it('extracts chapter and section headings from MMD', (): void => {
    assert.deepEqual(extractMmdHeadings('# Chapter 2\n## 2.1 Fractions\n\\section{Another section}'), [
      { source: 'mmd', text: 'Chapter 2', type: 'title' },
      { source: 'mmd', text: '2.1 Fractions', type: 'section_header' },
      { source: 'mmd', text: 'Another section', type: 'section_header' }
    ]);
  });

  it('creates overlapping evidence windows without losing the final pages', (): void => {
    const pages = Array.from({ length: 10 }, (_, index) => ({ bookId: 1, chapter: '', conceptsProcessed: false, pageMMD: `Page ${index + 1}`, pageNumber: index + 1 }));
    const windows = chapterEvidenceWindows(pages, 5, 2);

    assert.deepEqual(windows.map((window) => window.map(({ pageNumber }) => pageNumber)), [
      [1, 2, 3, 4, 5],
      [4, 5, 6, 7, 8],
      [7, 8, 9, 10]
    ]);
  });

  it('deduplicates boundary pages by confidence and adds front matter', (): void => {
    const parsed = parseChapterBoundaries(JSON.stringify({ chapters: [
      { confidence: 0.6, startPage: 8, title: 'Chapter 1' },
      { confidence: 0.9, startPage: 8, title: 'Chapter One' },
      { confidence: 0.8, startPage: 40, title: 'Chapter 2' }
    ] }), 100);

    assert.deepEqual(chapterAssignmentsFromBoundaries(parsed, 100), [
      { confidence: 1, startPage: 1, title: 'Front matter' },
      { confidence: 0.9, startPage: 8, title: 'Chapter One' },
      { confidence: 0.8, startPage: 40, title: 'Chapter 2' }
    ]);
  });
});
