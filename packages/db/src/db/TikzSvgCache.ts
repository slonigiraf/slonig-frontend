// Copyright 2021-2026 @slonigiraf/db authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { SlonigDB } from './index.js';

/** A regenerable TikZ preview. Renderer identity is part of the primary key,
 * so SVGs compiled by an older renderer are never reused after an upgrade. */
export interface TikzSvgCacheEntry {
  rendererId: string;
  source: string;
  svg: string;
  updatedAt: number;
}

const TIKZ_SVG_CACHE_LIMIT = 6000;

export async function readTikzSvgCache(database: SlonigDB, rendererId: string, source: string): Promise<string | undefined> {
  return (await database.tikzSvgCache.get([rendererId, source]))?.svg;
}

export async function writeTikzSvgCache(database: SlonigDB, rendererId: string, source: string, svg: string): Promise<void> {
  await database.transaction('rw', database.tikzSvgCache, async () => {
    await database.tikzSvgCache.put({ rendererId, source, svg, updatedAt: Date.now() });

    // Keep all renderer versions within the same total bound. An evicted SVG
    // is regenerated on demand, so nothing irreplaceable is lost.
    const excess = (await database.tikzSvgCache.count()) - TIKZ_SVG_CACHE_LIMIT;

    if (excess > 0) {
      const oldest = await database.tikzSvgCache.orderBy('updatedAt').limit(excess).toArray();

      await database.tikzSvgCache.bulkDelete(oldest.map(({ rendererId: version, source: key }) => [version, key] as [string, string]));
    }
  });
}
