// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TitleSaveQueue } from './titleSaveQueue.js';

describe('Course name autosave queue', () => {
  it('saves edited names and ignores unchanged values', async () => {
    const titles: string[] = [];
    const queue = new TitleSaveQueue('Original');
    const save = async (title: string): Promise<void> => { titles.push(title); };

    await queue.enqueue('New Name', save, () => assert.fail('Unexpected save failure'));
    await queue.enqueue('New Name', save, () => assert.fail('Unexpected save failure'));
    assert.deepEqual(titles, ['New Name']);
    assert.equal(queue.savedTitle, 'New Name');
  });

  it('serializes overlapping saves; the last edit wins', async () => {
    const titles: string[] = [];
    const queue = new TitleSaveQueue('Original');
    let releaseFirst: (() => void) | undefined;
    const firstStarted = new Promise<void>((resolve) => {
      void queue.enqueue('First Edit', async (title) => {
        resolve();
        await new Promise<void>((release) => { releaseFirst = release; });
        titles.push(title);
      }, () => assert.fail('Unexpected save failure'));
    });

    await firstStarted;
    const second = queue.enqueue('Final Edit', async (title) => { titles.push(title); }, () => assert.fail('Unexpected save failure'));

    assert.deepEqual(titles, []);
    releaseFirst?.();
    await second;
    assert.deepEqual(titles, ['First Edit', 'Final Edit']);
    assert.equal(queue.savedTitle, 'Final Edit');
  });

  it('reports a failed write and allows the next edit to save', async () => {
    const errors: unknown[] = [];
    const titles: string[] = [];
    const queue = new TitleSaveQueue('Original');

    await queue.enqueue('Failed Edit', async () => { throw new Error('Storage error'); }, (error) => { errors.push(error); });
    assert.equal(queue.savedTitle, 'Original');
    await queue.enqueue('Recovered Edit', async (title) => { titles.push(title); }, (error) => { errors.push(error); });
    assert.equal(errors.length, 1);
    assert.deepEqual(titles, ['Recovered Edit']);
    assert.equal(queue.savedTitle, 'Recovered Edit');
  });

  it('never writes an empty title and accepts a separately saved AI title', async () => {
    const titles: string[] = [];
    const queue = new TitleSaveQueue('Original');

    await queue.enqueue('   ', async (title) => { titles.push(title); }, () => assert.fail('Unexpected save failure'));
    queue.adoptSavedTitle('Fixed by AI');
    await queue.enqueue('Fixed by AI', async (title) => { titles.push(title); }, () => assert.fail('Unexpected save failure'));
    assert.deepEqual(titles, []);
  });
});
