// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

/// <reference types="@polkadot/dev-test/globals.d.ts" />

import { strict as assert } from 'node:assert';

import { renderMathVisualSvg } from './mathVisuals.js';
import { generateOpenRouterVisual, OPENROUTER_IMAGE_MODEL, svgMarkupToDataUrl } from './openRouterImages.js';

function vectorPlan (label = 'A'): string {
  return JSON.stringify({
    format: 'vector',
    scene: {
      background: 'white',
      elements: [
        { id: 'axis', stroke: 'black', strokeWidth: 2, type: 'line', x1: 0, x2: 100, y1: 50, y2: 50 },
        { anchor: 'middle', fill: 'black', fontSize: 24, id: 'label', text: label, type: 'text', x: 50, y: 40 }
      ],
      height: 640,
      width: 960
    }
  });
}

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

  it('generates a structured vector scene, renders it deterministically, and verifies it', async (): Promise<void> => {
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
        json: async () => ({ choices: [{ message: { content: chatCall === 1 ? vectorPlan() : JSON.stringify({ errors: [], ok: true }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw the task visual.', 'some/text-model');

      // Node has no canvas, so tests exercise the SVG fallback. Production
      // browsers rasterize this deterministic SVG to PNG before returning it.
      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.equal(requests.length, 2);
      assert.deepEqual(requests.map(({ url }) => url), [
        'https://openrouter.ai/api/v1/chat/completions',
        'https://openrouter.ai/api/v1/chat/completions'
      ]);
      assert.equal(requests[0].body.model, 'some/text-model');
      assert.equal(requests[1].body.model, 'some/text-model');
      const firstMessages = requests[0].body.messages as Array<{ content?: string }>;

      assert.match(firstMessages[0].content ?? '', /DO NOT write SVG\/XML/i);
      assert.match(firstMessages[0].content ?? '', /structured vector/i);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('uses the raster endpoint only when the planner explicitly requires photographic imagery', async (): Promise<void> => {
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
            ? JSON.stringify({ format: 'raster' })
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
      const result = await generateOpenRouterVisual('test-key', 'Show a realistic photograph of the object.', 'some/text-model');

      assert.equal(result, 'data:image/png;base64,ZmFrZS1wbmc=');
      assert.deepEqual(requests.map(({ url }) => url), [
        'https://openrouter.ai/api/v1/chat/completions',
        'https://openrouter.ai/api/v1/images',
        'https://openrouter.ai/api/v1/chat/completions'
      ]);
      assert.equal(requests[1].body.model, OPENROUTER_IMAGE_MODEL);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('retries invalid structured math output instead of silently falling back to raster', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const requests: string[] = [];
    const generationPrompts: string[] = [];
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      const url = String(input);

      requests.push(url);
      assert.ok(url.endsWith('/chat/completions'));
      chatCall++;
      const body = JSON.parse(String(init?.body ?? '{}')) as { messages?: Array<{ content?: string | Array<unknown> }> };

      if (typeof body.messages?.[0]?.content === 'string') {
        generationPrompts.push(body.messages[0].content);
      }

      return {
        json: async () => ({ choices: [{ message: { content: chatCall === 1
          ? JSON.stringify({ format: 'vector', scene: { elements: [{ id: 'bad', type: 'path', d: 'M 0 0' }] } })
          : chatCall === 2
            ? vectorPlan()
            : JSON.stringify({ errors: [], ok: true }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Draw a number line.', 'some/text-model');

      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.equal(chatCall, 3);
      assert.equal(requests.filter((url) => url.endsWith('/images')).length, 0);
      assert.match(generationPrompts[1], /unsupported/i);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('does not fail a correct diagram for an unrequested line-style preference', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    let chatCall = 0;

    Object.defineProperty(globalThis, 'window', { configurable: true, value: { location: { origin: 'https://slonig.test' } } });
    globalThis.fetch = (async (_input: Parameters<typeof fetch>[0], _init?: Parameters<typeof fetch>[1]) => {
      chatCall++;

      return {
        json: async () => ({ choices: [{ message: { content: chatCall === 1
          ? vectorPlan()
          : JSON.stringify({
            errors: ['Horizontal dividing lines are dashed; solid lines would better represent equal partitioning.'],
            ok: false
          }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual(
        'test-key',
        'Draw a rectangle divided horizontally into three equal parts.',
        'some/text-model'
      );

      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.equal(chatCall, 2);
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
        ? vectorPlan('7')
        : chatCall === 2
          ? JSON.stringify({ errors: ['The required label is 8, not 7.'], ok: false })
          : chatCall === 3
            ? vectorPlan('8')
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

  it('patches the exact structured question scene for a changed solution visual', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const baseScene = {
      background: 'white',
      elements: [
        { id: 'baseLine', stroke: 'black', strokeWidth: 2, type: 'line' as const, x1: 0, x2: 100, y1: 50, y2: 50 },
        { anchor: 'middle' as const, fill: 'black', fontSize: 24, id: 'labelA', text: 'A', type: 'text' as const, x: 50, y: 40 }
      ],
      height: 640,
      width: 960
    };
    const rendered = renderMathVisualSvg(baseScene);
    const base = svgMarkupToDataUrl(rendered.svg) as string;
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
          ? JSON.stringify({ format: 'vector-patch', operations: [{ element: { fill: 'red', id: 'answerPoint', r: 4, stroke: 'red', strokeWidth: 2, type: 'circle', cx: 50, cy: 50 }, op: 'add' }] })
          : JSON.stringify({ errors: [], ok: true }) } }] }),
        ok: true
      } as Response;
    }) as typeof fetch;

    try {
      const result = await generateOpenRouterVisual('test-key', 'Add the required point.', 'some/text-model', 'solution', base);

      assert.match(result, /^data:image\/svg\+xml;base64,/);
      assert.match(generationInstruction, /vector-patch/i);
      assert.match(generationInstruction, /baseLine/);
      assert.match(generationInstruction, /labelA/);
      assert.match(qaInstruction, /REFERENCE QUESTION SCENE JSON/);
      assert.match(qaInstruction, /baseLine/);
      assert.match(qaInstruction, /GENERATED CANDIDATE SCENE JSON/);
      assert.match(qaInstruction, /answerPoint/);
    } finally {
      globalThis.fetch = originalFetch;

      if (originalWindow) {
        Object.defineProperty(globalThis, 'window', originalWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
    }
  });

  it('marks explicit raster solution prompts as worked-solution visuals', async (): Promise<void> => {
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
            ? JSON.stringify({ format: 'raster' })
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
      const result = await generateOpenRouterVisual('test-key', 'Draw the completed realistic object.', 'some/text-model', 'solution');

      assert.equal(result, 'data:image/png;base64,ZmFrZS1wbmc=');
      assert.match(rasterPrompt, /complete worked-solution visual/i);
      assert.match(rasterPrompt, /Draw the completed realistic object\./);
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
