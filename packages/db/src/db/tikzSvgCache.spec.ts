// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { Dexie } from 'dexie';
import { IDBKeyRange, indexedDB } from 'fake-indexeddb';

import { SlonigDB } from './index.js';
import { readTikzSvgCache, writeTikzSvgCache } from './TikzSvgCache.js';

Dexie.dependencies.indexedDB = indexedDB;
Dexie.dependencies.IDBKeyRange = IDBKeyRange;

describe('TikZ SVG cache in the main database', (): void => {
  it('keys entries by renderer version and TikZ source without importing any old cache', async (): Promise<void> => {
    const name = `slonig-tikz-cache-${Date.now()}-${Math.random()}`;
    const database = new SlonigDB(name);
    const oldCacheName = `slonig-tikz-svg-old-renderer-${Date.now()}-${Math.random()}`;
    const oldCache = new Dexie(oldCacheName);

    oldCache.version(1).stores({ renderedSvg: '&source,updatedAt' });

    try {
      await oldCache.table('renderedSvg').put({ source: 'some TikZ source', svg: '<svg>legacy</svg>', updatedAt: 1 });
      await database.open();
      assert.equal(database.verno, 98);
      assert.equal(await database.tikzSvgCache.count(), 0, 'standalone cache was not imported');
      assert.equal((await oldCache.table('renderedSvg').get('some TikZ source'))?.svg, '<svg>legacy</svg>');

      await writeTikzSvgCache(database, 'renderer@1', 'some TikZ source', '<svg>old</svg>');
      await writeTikzSvgCache(database, 'renderer@2', 'some TikZ source', '<svg>new</svg>');

      assert.equal(await readTikzSvgCache(database, 'renderer@1', 'some TikZ source'), '<svg>old</svg>');
      assert.equal(await readTikzSvgCache(database, 'renderer@2', 'some TikZ source'), '<svg>new</svg>');
      assert.equal(await readTikzSvgCache(database, 'renderer@3', 'some TikZ source'), undefined);
      assert.equal(await readTikzSvgCache(database, 'renderer@2', 'different source'), undefined);

      database.close();
      const reopened = new SlonigDB(name);

      try {
        assert.equal(await readTikzSvgCache(reopened, 'renderer@2', 'some TikZ source'), '<svg>new</svg>');
      } finally {
        reopened.close();
      }
    } finally {
      database.close();
      oldCache.close();
      await Dexie.delete(name);
      await Dexie.delete(oldCacheName);
    }
  });

  it('limits the persisted cache to 6000 rows across renderer versions', async (): Promise<void> => {
    const name = `slonig-tikz-cache-limit-${Date.now()}-${Math.random()}`;
    const database = new SlonigDB(name);

    try {
      // Fill to the limit without repeatedly counting all rows on each insert.
      await database.tikzSvgCache.bulkPut([
        { rendererId: 'old-renderer', source: 'old-source', svg: '<svg/>', updatedAt: 1 },
        ...Array.from({ length: 5999 }, (_, i) => ({
          rendererId: 'new-renderer', source: `source-${i}`, svg: `<svg>${i}</svg>`, updatedAt: i + 2
        }))
      ]);

      assert.equal(await database.tikzSvgCache.count(), 6000);
      await writeTikzSvgCache(database, 'new-renderer', 'source-5999', '<svg>5999</svg>');

      assert.equal(await database.tikzSvgCache.count(), 6000);
      assert.equal(await readTikzSvgCache(database, 'old-renderer', 'old-source'), undefined);
      assert.equal(await readTikzSvgCache(database, 'new-renderer', 'source-5999'), '<svg>5999</svg>');
      assert.equal(await readTikzSvgCache(database, 'new-renderer', 'source-5998'), '<svg>5998</svg>');
    } finally {
      database.close();
      await Dexie.delete(name);
    }
  });
});
