// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isBookProcessingCommandReady } from './bookProcessingCommand.js';

const readyState = {
  ageSamplePageCount: 3,
  ageSampleTextCount: 3,
  conceptChapterCount: 2,
  isAssigningStandards: false,
  isDeduplicatingConcepts: false,
  isEmbeddingConcepts: false,
  isFixingConcepts: false,
  isGeneratingAllConcepts: false,
  isIdentifyingChapters: false,
  isMmdConversionComplete: true,
  isRecognizingAll: false,
  isRefiningChapters: false,
  isSortingConcepts: false,
  processingPage: undefined,
  totalPages: 12
};

describe('Book processing command readiness', (): void => {
  it('waits for metadata source conversion before language and subject commands', (): void => {
      assert.equal(isBookProcessingCommandReady('language', { ...readyState, isMmdConversionComplete: false }), false);
      assert.equal(isBookProcessingCommandReady('subject', readyState), true);
    });

  it('waits until every age sample page has text', (): void => {
      assert.equal(isBookProcessingCommandReady('age', { ...readyState, ageSampleTextCount: 2 }), false);
      assert.equal(isBookProcessingCommandReady('age', readyState), true);
    });

  it('blocks chapter/concept commands while reader processing is active', (): void => {
      assert.equal(isBookProcessingCommandReady('chapters', { ...readyState, processingPage: 4 }), false);
      assert.equal(isBookProcessingCommandReady('concepts', { ...readyState, isRecognizingAll: true }), false);
      assert.equal(isBookProcessingCommandReady('concepts', readyState), true);
    });

  it('requires concept chapters before fix-concepts and standards commands', (): void => {
      assert.equal(isBookProcessingCommandReady('fixConcepts', { ...readyState, conceptChapterCount: 0 }), false);
      assert.equal(isBookProcessingCommandReady('standards', { ...readyState, conceptChapterCount: 0 }), false);
      assert.equal(isBookProcessingCommandReady('standards', readyState), true);
    });
});
