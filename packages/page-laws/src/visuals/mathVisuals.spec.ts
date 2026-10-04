// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { applyVisualPatch, extractMathVisualSpecFromSvg, parseVisualPlan, renderMathVisualSvg, visualSceneBounds } from './mathVisuals.js';

describe('Deterministic math visual renderer', (): void => {
  it('computes a padded viewBox that contains long labels', (): void => {
    const plan = parseVisualPlan({
      format: 'vector',
      scene: {
        elements: [
          { id: 'line', type: 'line', x1: 0, y1: 50, x2: 100, y2: 50 },
          { id: 'label', type: 'text', x: 100, y: 50, text: '−12.75 cm', fontSize: 28 }
        ]
      }
    });

    assert.equal(plan.format, 'vector');

    if (plan.format !== 'vector') {
      return;
    }

    const rendered = renderMathVisualSvg(plan.scene);
    const bounds = visualSceneBounds(rendered.scene);
    const [x, y, width, height] = rendered.scene.viewBox as [number, number, number, number];

    assert.ok(bounds.left > x);
    assert.ok(bounds.top > y);
    assert.ok(bounds.right < x + width);
    assert.ok(bounds.bottom < y + height);
    assert.match(rendered.svg, /preserveAspectRatio="xMidYMid meet"/);
  });

  it('embeds the normalized scene in SVG metadata for exact later patching', (): void => {
    const rendered = renderMathVisualSvg({
      background: 'white',
      elements: [{ id: 'point', type: 'circle', cx: 10, cy: 20, r: 4 }],
      height: 640,
      width: 960
    });
    const extracted = extractMathVisualSpecFromSvg(rendered.svg);

    assert.deepEqual(extracted, rendered.scene);
  });

  it('rejects duplicate ids and unsupported arbitrary SVG/path primitives', (): void => {
    assert.throws(() => parseVisualPlan({
      format: 'vector',
      scene: {
        elements: [
          { id: 'same', type: 'circle', cx: 0, cy: 0, r: 2 },
          { id: 'same', type: 'circle', cx: 10, cy: 10, r: 2 }
        ]
      }
    }), /Duplicate visual element id/);

    assert.throws(() => parseVisualPlan({
      format: 'vector',
      scene: { elements: [{ id: 'freeform', type: 'path', d: 'M 0 0 L 10 10' }] }
    }), /unsupported/);
  });

  it('keeps the base viewBox fixed for patches and rejects newly clipped content', (): void => {
    const base = renderMathVisualSvg({
      elements: [
        { id: 'line', type: 'line', x1: 0, y1: 0, x2: 100, y2: 0 },
        { id: 'label', type: 'text', x: 50, y: -10, text: 'A' }
      ],
      height: 640,
      width: 960
    }).scene;
    const patched = applyVisualPatch(base, [{
      element: { id: 'answer', type: 'circle', cx: 50, cy: 0, r: 4 },
      op: 'add'
    }]);
    const rerendered = renderMathVisualSvg(patched);

    assert.deepEqual(rerendered.scene.viewBox, base.viewBox);

    const clipped = applyVisualPatch(base, [{
      element: { id: 'farAway', type: 'circle', cx: 10000, cy: 10000, r: 4 },
      op: 'add'
    }]);

    assert.throws(() => renderMathVisualSvg(clipped), /clipped by the preserved viewBox/);
  });

  it('requires changed solution scenes to be patch operations', (): void => {
    assert.throws(() => parseVisualPlan({
      format: 'vector',
      scene: { elements: [{ id: 'point', type: 'circle', cx: 0, cy: 0, r: 3 }] }
    }, true), /must return vector-patch/);
  });
});
