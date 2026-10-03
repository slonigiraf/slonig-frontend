import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';

import { DEFAULT_SPEECH_MODEL, DEFAULT_SPEECH_VOICE, DEFAULT_TRANSCRIPTION_MODEL, synthesizeOpenRouterSpeech, transcribeOpenRouter } from './openRouter.js';

const originalFetch = globalThis.fetch;

afterEach((): void => {
  globalThis.fetch = originalFetch;
});

describe('OpenRouter audio transcription', (): void => {

  it('uses the current high-accuracy transcription model with deterministic decoding', async (): Promise<void> => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ text: 'hello' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    }) as typeof fetch;

    await transcribeOpenRouter(
      { apiKey: 'test-key' },
      new Blob(['audio'], { type: 'audio/webm' }),
      undefined,
      {
        keywords: ['ATP', 'mitochondria'],
        languages: ['ru', 'en'],
      },
    );

    assert.equal(DEFAULT_TRANSCRIPTION_MODEL, 'openai/gpt-transcribe');
    assert.equal(requestBody?.model, DEFAULT_TRANSCRIPTION_MODEL);
    assert.deepEqual(requestBody?.keywords, ['ATP', 'mitochondria']);
    assert.deepEqual(requestBody?.languages, ['ru', 'en']);
    assert.equal(requestBody?.language, undefined);
    assert.equal(requestBody?.temperature, 0);
  });
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


describe('OpenRouter tutor speech', (): void => {
  it('uses a current multilingual OpenRouter speech model and stable voice', async (): Promise<void> => {
    let requestBody: Record<string, unknown> | undefined;
    globalThis.fetch = (async (_input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(new Uint8Array([1, 2, 3]), {
        status: 200,
        headers: { 'content-type': 'audio/mpeg' },
      });
    }) as typeof fetch;

    const speech = await synthesizeOpenRouterSpeech({ apiKey: 'test-key' }, 'Hello learner.');

    assert.equal(DEFAULT_SPEECH_MODEL, 'x-ai/grok-voice-tts-1.0');
    assert.equal(DEFAULT_SPEECH_VOICE, 'eve');
    assert.equal(requestBody?.model, DEFAULT_SPEECH_MODEL);
    assert.equal(requestBody?.voice, DEFAULT_SPEECH_VOICE);
    assert.equal(requestBody?.response_format, 'mp3');
    assert.equal(speech.size, 3);
  });
});
