// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { PDFDocumentProxy } from 'pdfjs-dist';

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { extractPdfOutlineChapterBoundaries } from './pdf.js';

function mockPdf (outline: unknown[], destinations: Record<string, unknown[]> = {}, pageIndexes: Record<string, number> = {}): PDFDocumentProxy {
  return {
    getDestination: (name: string) => Promise.resolve(destinations[name] ?? null),
    getOutline: () => Promise.resolve(outline),
    getPageIndex: (ref: { num?: number }) => Promise.resolve(pageIndexes[String(ref.num)] ?? -1),
    numPages: 100
  } as unknown as PDFDocumentProxy;
}

describe('PDF outline chapter metadata', (): void => {
  it('uses top-level bookmark titles and destinations as authoritative chapter boundaries', async (): Promise<void> => {
    const pdf = mockPdf([
      { dest: [{ gen: 0, num: 12 }, { name: 'XYZ' }, null, null, null], items: [{ dest: [18, { name: 'XYZ' }], title: '1.1 Nested section' }], title: 'Chapter 1  Foundations' },
      { dest: 'chapter-two', items: [], title: 'Chapter 2' }
    ], {
      'chapter-two': [{ gen: 0, num: 45 }, { name: 'Fit' }]
    }, {
      '12': 4,
      '45': 19
    });

    assert.deepEqual(await extractPdfOutlineChapterBoundaries(pdf), [
      { confidence: 1, startPage: 5, title: 'Chapter 1 Foundations' },
      { confidence: 1, startPage: 20, title: 'Chapter 2' }
    ]);
  });

  it('falls through to the shallowest child level when parent bookmarks have no destinations', async (): Promise<void> => {
    const pdf = mockPdf([{ items: [
      { dest: [4, { name: 'Fit' }], title: 'First' },
      { dest: [9, { name: 'Fit' }], title: 'Second' }
    ], title: 'Book' }]);

    assert.deepEqual(await extractPdfOutlineChapterBoundaries(pdf), [
      { confidence: 1, startPage: 5, title: 'First' },
      { confidence: 1, startPage: 10, title: 'Second' }
    ]);
  });

  it('expands part bookmarks but keeps chapter sections nested', async (): Promise<void> => {
    const pdf = mockPdf([
      { dest: [0, { name: 'Fit' }], title: 'Preface' },
      { dest: [3, { name: 'Fit' }], items: [
        { dest: [5, { name: 'Fit' }], items: [{ dest: [6, { name: 'Fit' }], title: '1.1 Section' }], title: 'Chapter 1' },
        { dest: [15, { name: 'Fit' }], title: 'Chapter 2' }
      ], title: 'Part I: Foundations' }
    ]);

    assert.deepEqual(await extractPdfOutlineChapterBoundaries(pdf), [
      { confidence: 1, startPage: 1, title: 'Preface' },
      { confidence: 1, startPage: 6, title: 'Chapter 1' },
      { confidence: 1, startPage: 16, title: 'Chapter 2' }
    ]);
  });

  it('uses chapters nested under a contents bookmark', async (): Promise<void> => {
    const pdf = mockPdf([{ dest: [0, { name: 'Fit' }], items: [
      { dest: [2, { name: 'Fit' }], title: 'Chapter 1' },
      { dest: [8, { name: 'Fit' }], title: 'Chapter 2' }
    ], title: 'Contents' }]);

    assert.deepEqual(await extractPdfOutlineChapterBoundaries(pdf), [
      { confidence: 1, startPage: 3, title: 'Chapter 1' },
      { confidence: 1, startPage: 9, title: 'Chapter 2' }
    ]);
  });

  it('ignores broken bookmarks and preserves the first title when two bookmarks share a page', async (): Promise<void> => {
    const pdf = mockPdf([
      { dest: 'missing', title: 'Broken' },
      { dest: [2, { name: 'Fit' }], title: 'Chapter A' },
      { dest: [2, { name: 'Fit' }], title: 'Alternate title' },
      { dest: [7, { name: 'Fit' }], title: 'Chapter B' }
    ]);

    assert.deepEqual(await extractPdfOutlineChapterBoundaries(pdf), [
      { confidence: 1, startPage: 3, title: 'Chapter A' },
      { confidence: 1, startPage: 8, title: 'Chapter B' }
    ]);
  });

  it('returns no chapter metadata when the PDF has no outline', async (): Promise<void> => {
    assert.deepEqual(await extractPdfOutlineChapterBoundaries(mockPdf([])), []);
  });

  it('reports an unreadable PDF outline', async (): Promise<void> => {
    const pdf = { getOutline: () => Promise.reject(new Error('Invalid outline')) } as unknown as PDFDocumentProxy;

    await assert.rejects(extractPdfOutlineChapterBoundaries(pdf), /Unable to read PDF bookmarks/);
  });

  it('finishes when malformed bookmarks contain a cycle', async (): Promise<void> => {
    const item: { dest?: unknown[]; items: unknown[]; title: string } = { items: [], title: 'Contents' };

    item.items.push(item, { dest: [3, { name: 'Fit' }], title: 'Chapter 1' });

    assert.deepEqual(await extractPdfOutlineChapterBoundaries(mockPdf([item])), [
      { confidence: 1, startPage: 4, title: 'Chapter 1' }
    ]);
  });
});
