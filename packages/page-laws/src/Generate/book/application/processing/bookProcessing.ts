// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0


export interface PageConceptProcessingState {
  conceptsProcessed?: boolean;
  pageNumber: number;
}

function conceptProcessingTargetPages (totalPages: number, includedPageNumbers?: Iterable<number>): Set<number> {
  if (!Number.isSafeInteger(totalPages) || totalPages <= 0) {
    return new Set();
  }

  if (includedPageNumbers) {
    return new Set(Array.from(includedPageNumbers).filter((pageNumber) => Number.isSafeInteger(pageNumber) && pageNumber >= 1 && pageNumber <= totalPages));
  }

  return new Set(Array.from({ length: totalPages }, (_, index) => index + 1));
}

export function areAllBookPagesConceptsProcessed (totalPages: number, pages: PageConceptProcessingState[], includedPageNumbers?: Iterable<number>): boolean {
  const targetPageNumbers = conceptProcessingTargetPages(totalPages, includedPageNumbers);

  if (!targetPageNumbers.size) {
    return false;
  }

  const processedPageNumbers = new Set(pages.flatMap(({ conceptsProcessed, pageNumber }) => conceptsProcessed && targetPageNumbers.has(pageNumber) ? [pageNumber] : []));

  return processedPageNumbers.size === targetPageNumbers.size;
}

export function countUnprocessedBookPages (totalPages: number, pages: PageConceptProcessingState[], includedPageNumbers?: Iterable<number>): number {
  const targetPageNumbers = conceptProcessingTargetPages(totalPages, includedPageNumbers);
  const processedPageNumbers = new Set(pages.flatMap(({ conceptsProcessed, pageNumber }) => conceptsProcessed && targetPageNumbers.has(pageNumber) ? [pageNumber] : []));

  return Math.max(0, targetPageNumbers.size - processedPageNumbers.size);
}

