// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { generateOpenRouterVisual, OPENROUTER_IMAGE_MODEL, svgMarkupToDataUrl } from './openRouterImages.js';

describe('Ability visual generation', (): void => {
  it('encodes a self-contained SVG as an image data URL', (): void => {
    const result = svgMarkupToDataUrl('<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>');

    assert.match(result ?? '', /^data:image\/svg\+xml;base64,/);
  });

  it('accepts the standard SVG namespace used by standalone generated SVGs', (): void => {
    const result = svgMarkupToDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>');

    assert.match(result ?? '', /^data:image\/svg\+xml;base64,/);
  });

  it('rejects SVG that embeds external or executable content', (): void => {
    assert.equal(svgMarkupToDataUrl('<svg><script>alert(1)</script></svg>'), undefined);
    assert.equal(svgMarkupToDataUrl('<svg><image href="https://example.com/a.png" /></svg>'), undefined);
  });

  it('uses the dedicated image endpoint before the selected text model', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const requests: Array<{ body: Record<string, unknown>; url: string }> = [];

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      requests.push({ body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>, url: String(input) });

      return {
        json: async () => ({ data: [{ b64_json: 'ZmFrZS1wbmc=', media_type: 'image/png' }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the task visual.', 'some/text-model');

      assert.equal(result, 'data:image/png;base64,ZmFrZS1wbmc=');
      assert.equal(requests.length, 1);
      assert.equal(requests[0].url, 'https://openrouter.ai/api/v1/images');
      assert.equal(requests[0].body.model, OPENROUTER_IMAGE_MODEL);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('falls back to safe SVG when the dedicated image endpoint fails', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const requests: string[] = [];

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);
      requests.push(url);

      if (url.endsWith('/images')) {
        return {
          json: async () => ({ error: { message: 'temporary image failure' } }),
          ok: false
        } as Response;
      }

      return {
        json: async () => ({ choices: [{ message: { content: JSON.stringify({
          format: 'svg',
          svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>'
        }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the task visual.', 'some/text-model');

      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.deepEqual(requests, [
        'https://openrouter.ai/api/v1/images',
        'https://openrouter.ai/api/v1/chat/completions'
      ]);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });
});
