// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { embedTikzSourceInSvg, extractTikzSourceFromSvg } from './tikz.js';

const SOURCE = `\\begin{tikzpicture}
  \\node {π ≤ 4 & x < y};
  \\draw (0,0) -- (1,1);
\\end{tikzpicture}`;

describe('TikZ SVG persistence', (): void => {
  it('stores UTF-8 TikZ source in SVG metadata and extracts it losslessly', (): void => {
    const svg = embedTikzSourceInSvg('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0L1 1"/></svg>', SOURCE);

    assert.match(svg, /<metadata id="slonig-tikz-source-v1"/);
    assert.equal(extractTikzSourceFromSvg(svg), SOURCE);
  });

  it('keeps unrelated SVG metadata and replaces only the app TikZ metadata', (): void => {
    const first = embedTikzSourceInSvg('<svg><metadata id="other">keep</metadata><circle r="1"/></svg>', SOURCE);
    const updatedSource = SOURCE.replace('(1,1)', '(2,2)');
    const second = embedTikzSourceInSvg(first, updatedSource);

    assert.match(second, /<metadata id="other">keep<\/metadata>/);
    assert.equal((second.match(/slonig-tikz-source-v1/g) ?? []).length, 1);
    assert.equal(extractTikzSourceFromSvg(second), updatedSource);
  });

  it('treats persisted metadata as authoritative even for alternative TikZ source forms', (): void => {
    const source = `\\tikz \\draw (0,0) -- (1,1);`;
    const svg = embedTikzSourceInSvg('<svg><line x2="1" y2="1"/></svg>', source);

    assert.equal(extractTikzSourceFromSvg(svg), source);
  });

  it('ignores ordinary SVGs without embedded TikZ source', (): void => {
    assert.equal(extractTikzSourceFromSvg('<svg><circle r="1"/></svg>'), undefined);
  });
});
