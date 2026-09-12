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

  it('prefers a safe SVG and verifies it before returning', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
      const url = String(input);

      requests.push({ body, url });
      chatCall++;

      return {
        json: async () => ({ choices: [{ message: { content: chatCall === 1
          ? JSON.stringify({ format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" /></svg>' })
          : JSON.stringify({ errors: [], ok: true }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the task visual.', 'some/text-model');

      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.equal(requests.length, 2);
      assert.deepEqual(requests.map(({ url }) => url), [
        'https://openrouter.ai/api/v1/chat/completions',
        'https://openrouter.ai/api/v1/chat/completions'
      ]);
      assert.equal(requests[0].body.model, 'some/text-model');
      assert.equal(requests[1].body.model, 'some/text-model');
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('falls back to the dedicated raster image endpoint and verifies the raster result', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const requests: Array<{ body: Record<string, unknown>; url: string }> = [];
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;

      requests.push({ body, url });

      if (url.endsWith('/chat/completions')) {
        chatCall++;

        return {
          json: async () => ({ choices: [{ message: { content: chatCall === 1
            ? JSON.stringify({ format: 'raster', svg: '' })
            : JSON.stringify({ errors: [], ok: true }) } }] }),
          ok: true
        } as Response;
      }

      return {
        json: async () => ({ data: [{ b64_json: 'ZmFrZS1wbmc=', media_type: 'image/png' }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the task visual.', 'some/text-model');

      assert.equal(result, 'data:image/png;base64,ZmFrZS1wbmc=');
      assert.deepEqual(requests.map(({ url }) => url), [
        'https://openrouter.ai/api/v1/chat/completions',
        'https://openrouter.ai/api/v1/images',
        'https://openrouter.ai/api/v1/chat/completions'
      ]);
      assert.equal(requests[1].body.model, OPENROUTER_IMAGE_MODEL);
      const qaMessages = requests[2].body.messages as Array<{ content?: Array<{ image_url?: { url?: string }; type?: string }> }>;

      assert.equal(qaMessages[0].content?.find(({ type }) => type === 'image_url')?.image_url?.url, result);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('falls back to raster when generated SVG is unsafe or malformed', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const requests: string[] = [];
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      const url = String(input);

      requests.push(url);

      if (url.endsWith('/chat/completions')) {
        chatCall++;

        return {
          json: async () => ({ choices: [{ message: { content: chatCall === 1
            ? JSON.stringify({ format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>' })
            : JSON.stringify({ errors: [], ok: true }) } }] }),
          ok: true
        } as Response;
      }

      return {
        json: async () => ({ data: [{ b64_json: 'ZmFrZS1qcGVn', media_type: 'image/jpeg' }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the task visual.', 'some/text-model');

      assert.equal(result, 'data:image/jpeg;base64,ZmFrZS1qcGVn');
      assert.deepEqual(requests, [
        'https://openrouter.ai/api/v1/chat/completions',
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

  it('regenerates a visual when semantic QA finds a concrete error', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const generationPrompts: string[] = [];
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string | Array<unknown> }> };

      chatCall++;

      if (typeof body.messages?.[0]?.content === 'string') {
        generationPrompts.push(body.messages[0].content);
      }

      const content = chatCall === 1
        ? JSON.stringify({ format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>7</text></svg>' })
        : chatCall === 2
          ? JSON.stringify({ errors: ['The required label is 8, not 7.'], ok: false })
          : chatCall === 3
            ? JSON.stringify({ format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg"><text>8</text></svg>' })
            : JSON.stringify({ errors: [], ok: true });

      return {
        json: async () => ({ choices: [{ message: { content } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Show a number line labeled 8.', 'some/text-model');

      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.equal(chatCall, 4);
      assert.match(generationPrompts[1], /required label is 8, not 7/i);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('allows SVG solution visuals to show the completed answer', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let svgInstruction = '';
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string | Array<unknown> }> };

      chatCall++;

      if (chatCall === 1 && typeof body.messages?.[0]?.content === 'string') {
        svgInstruction = body.messages[0].content;
      }

      return {
        json: async () => ({ choices: [{ message: { content: chatCall === 1
          ? JSON.stringify({ format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><line x1="1" y1="9" x2="9" y2="1" /></svg>' })
          : JSON.stringify({ errors: [], ok: true }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the completed construction.', 'some/text-model', 'solution');

      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.match(svgInstruction, /worked-solution visual/i);
      assert.match(svgInstruction, /show the complete correct/i);
      assert.doesNotMatch(svgInstruction, /do not reveal or encode the answer/i);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('uses the exact SVG question visual as the base for modified solution generation and QA', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const base = svgMarkupToDataUrl('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>A</text></svg>') as string;
    let generationInstruction = '';
    let qaInstruction = '';
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string | Array<{ text?: string; type?: string }> }> };

      chatCall++;
      const messageContent = body.messages?.[0]?.content;

      if (chatCall === 1 && typeof messageContent === 'string') {
        generationInstruction = messageContent;
      } else if (chatCall === 2 && Array.isArray(messageContent)) {
        qaInstruction = messageContent.map(({ text }) => text ?? '').join('\n');
      }

      return {
        json: async () => ({ choices: [{ message: { content: chatCall === 1
          ? JSON.stringify({ format: 'svg', svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><text>A</text><circle cx="5" cy="5" r="1" /></svg>' })
          : JSON.stringify({ errors: [], ok: true }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      await generateOpenRouterVisual('test-key', 'Add the required point.', 'some/text-model', 'solution', base);

      assert.match(generationInstruction, /STARTING SVG/);
      assert.match(generationInstruction, /<text>A<\/text>/);
      assert.match(qaInstruction, /REFERENCE QUESTION SVG/);
      assert.match(qaInstruction, /<text>A<\/text>/);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('marks raster fallback prompts as worked-solution visuals', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let rasterPrompt = '';
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);
      const body = JSON.parse(String(init?.body ?? '{}')) as { prompt?: string };

      if (url.endsWith('/chat/completions')) {
        chatCall++;

        return {
          json: async () => ({ choices: [{ message: { content: chatCall === 1
            ? JSON.stringify({ format: 'raster', svg: '' })
            : JSON.stringify({ errors: [], ok: true }) } }] }),
          ok: true
        } as Response;
      }

      rasterPrompt = body.prompt ?? '';

      return {
        json: async () => ({ data: [{ b64_json: 'ZmFrZS1wbmc=', media_type: 'image/png' }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the completed construction.', 'some/text-model', 'solution');

      assert.equal(result, 'data:image/png;base64,ZmFrZS1wbmc=');
      assert.match(rasterPrompt, /complete worked-solution visual/i);
      assert.match(rasterPrompt, /Draw the completed construction\./);
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
