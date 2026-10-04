// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { strFromU8, strToU8, unzipSync } from 'fflate';

import { createMathpixPageMmdZip, mathpixPdfSlices, splitMathpixMmdByPage } from './mathpixPdf.js';

describe('Mathpix whole-PDF recognition helpers', (): void => {
  it('slices PDFs into 40-page Mathpix requests', (): void => {
    assert.deepEqual(mathpixPdfSlices(85), [
      { endPage: 40, startPage: 1 },
      { endPage: 80, startPage: 41 },
      { endPage: 85, startPage: 81 }
    ]);
  });

  it('splits the concatenated MMD while preserving blank pages', (): void => {
    assert.deepEqual(splitMathpixMmdByPage('First page\n\\pagebreak\n\n\\pagebreak\nThird page\n\\pagebreak\n', 3), [
      'First page',
      '',
      'Third page'
    ]);
  });

  it('splits one 40-page Mathpix result back into 40 page MMD documents', (): void => {
    const combined = Array.from({ length: 40 }, (_, index) => `Page ${index + 1}\n\\pagebreak\n`).join('');

    assert.deepEqual(splitMathpixMmdByPage(combined, 40), Array.from({ length: 40 }, (_, index) => `Page ${index + 1}`));
  });

  it('requires one Mathpix page break per PDF page', (): void => {
    assert.throws(
      () => splitMathpixMmdByPage('First page\n\\pagebreak\nSecond page', 2),
      /1 page breaks for a 2-page PDF/
    );
  });

  it('creates a self-contained ZIP containing only images referenced by one page', async (): Promise<void> => {
    const pageMmd = 'Diagram ![](./images/figure-2.png)';
    const archive = {
      'book/images/figure-1.png': strToU8('one'),
      'book/images/figure-2.png': strToU8('two'),
      'book/images/unused.png': strToU8('unused')
    };
    const blob = createMathpixPageMmdZip(pageMmd, archive, 'book/book.mmd');
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));

    assert.deepEqual(Object.keys(entries).sort(), ['images/figure-2.png', 'page.mmd']);
    assert.equal(strFromU8(entries['page.mmd']), pageMmd);
    assert.equal(strFromU8(entries['images/figure-2.png']), 'two');
  });
});
