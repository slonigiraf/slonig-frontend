import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { transcribeOpenRouter } from './openRouter.js';

const originalFetch = globalThis.fetch;

afterEach((): void => {
  globalThis.fetch = originalFetch;
});

describe('OpenRouter audio transcription', (): void => {
  it('retries one successful-but-empty transcription and returns the retry text', async (): Promise<void> => {
    let calls = 0;
    globalThis.fetch = (async (): Promise<Response> => {
      calls += 1;
      return new Response(JSON.stringify({ text: calls === 1 ? '   ' : '  spoken answer  ' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await transcribeOpenRouter(
      { apiKey: 'test-key' },
      new Blob(['audio'], { type: 'audio/webm' }),
    );

    assert.equal(result, 'spoken answer');
    assert.equal(calls, 2);
  });

  it('returns an empty string after two empty successful transcription responses', async (): Promise<void> => {
    let calls = 0;
    globalThis.fetch = (async (): Promise<Response> => {
      calls += 1;
      return new Response(JSON.stringify({ text: '' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    const result = await transcribeOpenRouter(
      { apiKey: 'test-key' },
      new Blob(['audio'], { type: 'audio/webm' }),
    );

    assert.equal(result, '');
    assert.equal(calls, 2);
  });
});
