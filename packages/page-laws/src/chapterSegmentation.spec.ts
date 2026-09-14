// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { chapterAssignmentsFromBoundaries, chapterEvidenceWindows, chapterWindowPrompt, deriveStructuralChapterCandidates, extractMathpixHeadingsFromLines, extractMmdHeadings, parseChapterBoundaries, stabilizeChapterBoundaries, type ChapterPageEvidence } from './chapterSegmentation.js';

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

  it('surfaces section-sign and uppercase-caption chapter-name signals from MMD', (): void => {
    assert.deepEqual(extractMmdHeadings('§ Foundations\nALGEBRAIC STRUCTURES\nMixed case body text\n§\nLINEAR EQUATIONS'), [
      { signal: 'section-sign', source: 'mmd', text: 'Foundations', type: 'section_header' },
      { signal: 'uppercase-caption', source: 'mmd', text: 'ALGEBRAIC STRUCTURES', type: 'section_header' },
      { signal: 'section-sign', source: 'mmd', text: 'LINEAR EQUATIONS', type: 'section_header' }
    ]);

    const prompt = chapterWindowPrompt([{ excerpt: '', headings: extractMmdHeadings('§ Foundations\nALGEBRAIC STRUCTURES'), pageNumber: 7 }]);

    assert.match(prompt, /signal=section-sign/);
    assert.match(prompt, /signal=uppercase-caption/);
    assert.match(prompt, /useful clue to the chapter NAME/);
  });

  it('uses a section-sign caption as the chapter name beside a numbered section anchor', (): void => {
    const evidence: ChapterPageEvidence[] = [
      { excerpt: '', headings: extractMmdHeadings('§ FOUNDATIONS'), pageNumber: 4 },
      { excerpt: '', headings: [{ confidence: 1, source: 'mathpix', text: '1.1 Numbers', type: 'section_header' }], pageNumber: 5 }
    ];

    assert.deepEqual(deriveStructuralChapterCandidates(evidence), [
      { confidence: 0.97, startPage: 4, title: 'FOUNDATIONS' }
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

  it('uses section-number continuity and split chapter headings to recover missed chapters', (): void => {
    const page = (pageNumber: number, headings: ChapterPageEvidence['headings']): ChapterPageEvidence => ({ excerpt: '', headings, pageNumber });
    const section = (text: string, line = 1): ChapterPageEvidence['headings'][number] => ({ confidence: 1, line, source: 'mathpix', text, type: 'section_header' });
    const evidence: ChapterPageEvidence[] = [
      page(1, [section('the Art of Problem Solving')]),
      page(2, []),
      page(3, [section('Acknowledgements'), section('Contests', 2)]),
      page(4, [section('Contents')]),
      page(5, [section('Follow the Rules')]),
      page(6, [section('1.1 Numbers')]),
      page(7, [section('1.2 Order of Operations')]),
      page(8, [section('x Marks the Spot')]),
      page(9, [section('2.1 Expressions')]),
      page(10, [section('CHAPTER'), section('3', 2), section('One-Variable Linear Equations', 3), section('3.1 Solving Linear Equations I', 4)]),
      page(11, []),
      page(12, [section('More Variables')]),
      page(13, []),
      page(14, [section('Multi-Variable Linear Equations'), section('5.1 Introduction to Two-Variable Linear Equations', 2)]),
      page(15, [])
    ];

    assert.deepEqual(deriveStructuralChapterCandidates(evidence).map(({ startPage, title }) => ({ startPage, title })), [
      { startPage: 5, title: 'Follow the Rules' },
      { startPage: 8, title: 'x Marks the Spot' },
      { startPage: 10, title: 'Chapter 3: One-Variable Linear Equations' },
      { startPage: 12, title: 'More Variables' },
      { startPage: 14, title: 'Multi-Variable Linear Equations' }
    ]);
  });

  it('keeps strong structural boundaries when model reconciliation skips them', (): void => {
    const structural = [
      { confidence: 0.97, startPage: 5, title: 'Follow the Rules' },
      { confidence: 0.97, startPage: 8, title: 'x Marks the Spot' },
      { confidence: 0.995, startPage: 10, title: 'Chapter 3: One-Variable Linear Equations' },
      { confidence: 0.94, startPage: 12, title: 'More Variables' },
      { confidence: 0.97, startPage: 14, title: 'Multi-Variable Linear Equations' }
    ];
    const model = [
      { confidence: 0.99, startPage: 5, title: 'Follow the Rules' },
      { confidence: 0.99, startPage: 8, title: 'x Marks the Spot' },
      { confidence: 0.99, startPage: 10, title: 'One-Variable Linear Equations' },
      { confidence: 0.99, startPage: 14, title: 'Multi-Variable Linear Equations' }
    ];

    assert.deepEqual(stabilizeChapterBoundaries(model, structural, 15).map(({ startPage }) => startPage), [5, 8, 10, 12, 14]);
  });
});
