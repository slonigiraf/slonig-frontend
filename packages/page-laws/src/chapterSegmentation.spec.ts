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
    assert.match(prompt, /strong chapter-name evidence/);
    assert.match(prompt, /ONLY section_header entries/);
  });

  it('uses a section-sign caption as the chapter name beside a numbered section anchor', (): void => {
    const evidence: ChapterPageEvidence[] = [
      { excerpt: '', headings: extractMmdHeadings('§ FOUNDATIONS'), pageNumber: 4 },
      { excerpt: '', headings: [{ confidence: 1, source: 'mathpix', text: '1.1 Numbers', type: 'section_header' }], pageNumber: 5 }
    ];

    assert.deepEqual(deriveStructuralChapterCandidates(evidence), [
      { confidence: 0.995, startPage: 4, title: 'FOUNDATIONS' }
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

  it('does not infer chapters from OCR-lost § markers once § section_headers define chapters', (): void => {
    const page = (pageNumber: number, headings: ChapterPageEvidence['headings']): ChapterPageEvidence => ({ excerpt: '', headings, pageNumber });
    const mathpix = (text: string, line = 1): ChapterPageEvidence['headings'][number] => ({ confidence: 1, line, source: 'mathpix', text, type: 'section_header' });
    const mmd = (text: string): ChapterPageEvidence['headings'] => extractMmdHeadings(text);
    const evidence: ChapterPageEvidence[] = [
      page(3, [{ source: 'mmd', text: 'Россия в эпоху правления Александра 1', type: 'section_header' }]),
      page(4, [mathpix('1. Начало промышленного переворота'), ...mmd('§1 РОССИЯ И МИР НА РУБЕЖЕ XVIII-XIX вв.')]),
      page(5, [mathpix('2. Изменения в финансовой системе'), mathpix('3. Перемены в сельском хозяйстве', 2)]),
      page(6, [
        mathpix('Вопросы и задания для работы с текстом параграфа'),
        mathpix('Работаем с картой', 2),
        mathpix('Думаем, сравниваем, размышляем', 3),
        ...mmd('АЛЕКСАНДР І: НАЧАЛО ПРАВЛЕНИЯ. РЕФОРМЫ М. М. СПЕРАНСКОГО')
      ]),
      page(7, [mathpix('2. Негласный комитет')]),
      page(8, [
        mathpix('Думаем, сравниваем, размышляем'),
        ...mmd('ИЗ ПИСЬМА НАСЛЕДНИКА ПРЕСТОЛА (БУДУШЕГО ИМПЕРАТОРА АЛЕКСАНДРА І). 1797 г.\n\nИЗ ВОСПОМИНАНИЙ ПОПЕЧИТЕЛЯ САНКТ-ПЕТЕРБУРГСКОГО УЧЕБНОГО ОКРУГА Д. П. РУНИЧА')
      ]),
      page(9, mmd('**СОЦИАЛЬНО-ЭКОНОМИЧЕСКОЕ РАЗВИТИЕ РОССИИ В ПЕРВОЙ ЧЕТВЕРТИ XIX в.**')),
      page(10, mmd('4ОТЕЧЕСТВЕННАЯ ВОЙНА 1812 г.')),
      page(11, [mathpix('2. Начало войны. Планы и силы сторон'), mathpix('Какие государства были покорены Наполеоном до вторжения в Россию?', 2)]),
      page(12, [mathpix('Думаем, сравниваем, размышляем'), ...mmd('ЗАГРАНИЧНЫЕ ПОХОДЫ РУССКОЙ АРМИИ. ВНЕШНЯЯ ПОЛИТИКА АЛЕКСАНДРА I В 1813-1825 гг.')]),
      page(13, [mathpix('2. Смерть М. И. Кутузова'), mathpix('3. Завершение разгрома Наполеона', 2)])
    ];

    assert.deepEqual(deriveStructuralChapterCandidates(evidence).map(({ startPage, title }) => ({ startPage, title })), [
      { startPage: 4, title: 'РОССИЯ И МИР НА РУБЕЖЕ XVIII-XIX вв.' }
    ]);
  });

  it('joins split § number/title lines and wrapped uppercase captions', (): void => {
    assert.deepEqual(extractMmdHeadings('§ 3\nСОЦИАЛЬНО-ЭКОНОМИЧЕСКОЕ РАЗВИТИЕ\n\n**ЗАГРАНИЧНЫЕ ПОХОДЫ**\n**РУССКОЙ АРМИИ**'), [
      { signal: 'section-sign', source: 'mmd', text: '3 СОЦИАЛЬНО-ЭКОНОМИЧЕСКОЕ РАЗВИТИЕ', type: 'section_header' },
      { signal: 'uppercase-caption', source: 'mmd', text: 'ЗАГРАНИЧНЫЕ ПОХОДЫ РУССКОЙ АРМИИ', type: 'section_header' }
    ]);
  });


  it('does not promote non-§ captions inside a §-delimited sequence', (): void => {
    const page = (pageNumber: number, headings: ChapterPageEvidence['headings']): ChapterPageEvidence => ({ excerpt: '', headings, pageNumber });
    const section = (text: string): ChapterPageEvidence['headings'][number] => ({ confidence: 1, source: 'mathpix', text, type: 'section_header' });
    const evidence: ChapterPageEvidence[] = [
      page(1, extractMmdHeadings('§1 FIRST TOPIC')),
      page(2, extractMmdHeadings('SECOND TOPIC')),
      page(3, [section('2. Local item')]),
      page(4, extractMmdHeadings('ARCHIVE NOTE\n\nLETTER FROM AN AUTHOR')),
      page(5, extractMmdHeadings('THIRD TOPIC')),
      page(6, extractMmdHeadings('4FOURTH TOPIC'))
    ];

    assert.deepEqual(deriveStructuralChapterCandidates(evidence).map(({ startPage, title }) => ({ startPage, title })), [
      { startPage: 1, title: 'FIRST TOPIC' }
    ]);
  });

  it('allows only explicit § section_headers once § is the chapter delimiter', (): void => {
    const evidence: ChapterPageEvidence[] = [
      { excerpt: '', headings: [{ confidence: 1, source: 'mathpix', text: '§ 1 FIRST TOPIC', type: 'section_header' }], pageNumber: 1 },
      { excerpt: '', headings: [{ confidence: 1, source: 'mathpix', text: 'SECOND TOPIC', type: 'title' }], pageNumber: 2 },
      { excerpt: '', headings: [{ confidence: 1, source: 'mathpix', text: '2.1 Internal section', type: 'section_header' }], pageNumber: 3 },
      { excerpt: '', headings: [{ confidence: 1, source: 'mathpix', text: '§ 2 SECOND CHAPTER', type: 'section_header' }], pageNumber: 4 }
    ];
    const model = [
      { confidence: 0.999, startPage: 1, title: 'Model title 1' },
      { confidence: 0.999, startPage: 2, title: 'Wrong title chapter' },
      { confidence: 0.999, startPage: 3, title: 'Wrong numbered chapter' },
      { confidence: 0.999, startPage: 4, title: 'Model title 2' }
    ];

    assert.deepEqual(stabilizeChapterBoundaries(model, [], 4, evidence).map(({ startPage, title }) => ({ startPage, title })), [
      { startPage: 1, title: 'FIRST TOPIC' },
      { startPage: 4, title: 'SECOND CHAPTER' }
    ]);
  });

  it('does not infer an OCR-lost § marker before the book establishes a § scheme', (): void => {
    const evidence: ChapterPageEvidence[] = [
      { excerpt: '', headings: extractMmdHeadings('4FOURTH TOPIC'), pageNumber: 1 },
      { excerpt: '', headings: [{ confidence: 1, source: 'mathpix', text: '2. Local item', type: 'section_header' }], pageNumber: 2 }
    ];

    assert.deepEqual(deriveStructuralChapterCandidates(evidence), []);
  });

  it('keeps distinct structural chapters on adjacent pages', (): void => {
    const structural = [
      { confidence: 0.965, startPage: 9, title: 'Chapter Three' },
      { confidence: 0.985, startPage: 10, title: 'Chapter Four' }
    ];
    const model = [{ confidence: 0.99, startPage: 10, title: 'Chapter Four' }];

    assert.deepEqual(stabilizeChapterBoundaries(model, structural, 20).map(({ startPage }) => startPage), [9, 10]);
  });

  it('prefers a specific structural caption over a generic model title on the same page', (): void => {
    const structural = [{ confidence: 0.985, startPage: 10, title: 'ОТЕЧЕСТВЕННАЯ ВОЙНА 1812 г.' }];
    const model = [{ confidence: 0.99, startPage: 10, title: 'Chapter 4' }];

    assert.deepEqual(stabilizeChapterBoundaries(model, structural, 20), structural);
  });


  it('anchors a chapter from a standalone number and does not promote its 1.1 subsection', (): void => {
    const evidence: ChapterPageEvidence[] = [
      {
        excerpt: '',
        headings: [
          { confidence: 1, line: 1, source: 'mathpix', text: '1', type: 'section_header' },
          { confidence: 0.31, line: 2, source: 'mathpix', text: 'TEMbI Γ∧AB bl', type: 'section_header' },
          { confidence: 1, line: 3, source: 'mathpix', text: 'Познавая жизнь', type: 'section_header' },
          { source: 'mmd', text: 'Эволюция, ОСНОВНЫЕ Темы биологии методы научного исследования', type: 'section_header' }
        ],
        pageNumber: 4
      },
      {
        excerpt: '',
        headings: [{ source: 'mmd', text: '1.1. Изучая жизнь, мы выявляем ее основные признаки', type: 'section_header' }],
        pageNumber: 7
      }
    ];
    const structural = deriveStructuralChapterCandidates(evidence);

    assert.deepEqual(structural.map(({ startPage, title }) => ({ startPage, title })), [
      { startPage: 4, title: '1 Эволюция, ОСНОВНЫЕ Темы биологии методы научного исследования' }
    ]);
    assert.deepEqual(stabilizeChapterBoundaries([
      { confidence: 0.99, startPage: 7, title: '1.1. Изучая жизнь, мы выявляем ее основные признаки' }
    ], structural, 20, evidence).map(({ startPage, title }) => ({ startPage, title })), [
      { startPage: 4, title: '1 Эволюция, ОСНОВНЫЕ Темы биологии методы научного исследования' }
    ]);
  });

  it('does not create another chapter from an N.1 subsection after chapter N is already anchored', (): void => {
    const evidence: ChapterPageEvidence[] = [
      {
        excerpt: '',
        headings: [
          { confidence: 1, line: 1, source: 'mathpix', text: '2', type: 'section_header' },
          { source: 'mmd', text: 'Химическая основа жизни', type: 'section_header' }
        ],
        pageNumber: 10
      },
      {
        excerpt: '',
        headings: [
          { confidence: 1, source: 'mathpix', text: 'Элементы и соединения', type: 'section_header' },
          { source: 'mmd', text: '2.1. Вещество состоит из химических элементов в чистом виде и их сочетаний, называемых соединениями', type: 'section_header' }
        ],
        pageNumber: 13
      }
    ];
    const structural = deriveStructuralChapterCandidates(evidence);

    assert.deepEqual(stabilizeChapterBoundaries([
      { confidence: 0.99, startPage: 13, title: 'Элементы и соединения' }
    ], structural, 20, evidence).map(({ startPage, title }) => ({ startPage, title })), [
      { startPage: 10, title: '2 Химическая основа жизни' }
    ]);
  });

});
