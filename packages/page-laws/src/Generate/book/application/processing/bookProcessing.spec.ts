// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strict as assert } from 'node:assert';
import { describe, it } from 'node:test';

import { areAllBookPagesConceptsProcessed, countUnprocessedBookPages } from './bookProcessing.js';

describe('Concept processing page tracking', (): void => {
  const pages = [
    { conceptsProcessed: true, pageNumber: 1 },
    { conceptsProcessed: false, pageNumber: 2 },
    { conceptsProcessed: true, pageNumber: 3 }
  ];

  it('recognizes all processed pages, even when a page has zero Concepts', (): void => {
    assert.equal(areAllBookPagesConceptsProcessed(3, pages), false);
    assert.equal(countUnprocessedBookPages(3, pages), 1);
    assert.equal(areAllBookPagesConceptsProcessed(3, pages.map((page) => ({ ...page, conceptsProcessed: true }))), true);
  });

  it('does not require intentionally excluded pages to be processed', (): void => {
    assert.equal(areAllBookPagesConceptsProcessed(3, pages, [1, 3]), true);
    assert.equal(countUnprocessedBookPages(3, pages, [1, 3]), 0);
  });

  it('ignores duplicate page records and counts each missing page only once', (): void => {
    assert.equal(countUnprocessedBookPages(3, [...pages, pages[0]]), 1);
    assert.equal(areAllBookPagesConceptsProcessed(3, [...pages, pages[0]]), false);
  });

  it('rejects empty or invalid target page ranges', (): void => {
    assert.equal(areAllBookPagesConceptsProcessed(0, pages), false);
    assert.equal(countUnprocessedBookPages(0, pages), 0);
    assert.equal(areAllBookPagesConceptsProcessed(3, pages, [9]), false);
    assert.equal(countUnprocessedBookPages(3, pages, [9]), 0);
  });
});
