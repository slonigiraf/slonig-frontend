// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { resolveSharedChapterIndex } from './chapterSelection.js';

describe('shared chapter selection', (): void => {
  const chapters = [
    { id: 10, title: 'Introduction' },
    { id: 20, title: 'Fractions' },
    { id: 30, title: 'Geometry' }
  ];

  it('matches a chapter by id before using the stored index', (): void => {
    assert.equal(resolveSharedChapterIndex({ chapterId: 30, index: 0, title: 'Geometry' }, chapters), 2);
  });

  it('matches by title when a view does not expose chapter ids', (): void => {
    assert.equal(resolveSharedChapterIndex({ chapterId: 20, index: 0, title: 'Fractions' }, chapters.map(({ title }) => ({ title }))), 1);
  });

  it('falls back to a clamped index when identity is unavailable', (): void => {
    assert.equal(resolveSharedChapterIndex({ index: 99 }, chapters), 2);
    assert.equal(resolveSharedChapterIndex({ index: 1 }, []), 0);
  });
});
