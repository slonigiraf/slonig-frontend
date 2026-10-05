// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { strFromU8, strToU8, unzipSync } from 'fflate';

import { createMathpixPageMmdZip, mathpixPdfSlices, recognizePdfWithMathpix, splitMathpixMmdByPage } from './mathpixPdf.js';

describe('Mathpix whole-PDF recognition helpers', (): void => {
  it('slices PDFs into 40-page Mathpix requests', (): void => {
    assert.deepEqual(mathpixPdfSlices(85), [
      { endPage: 40, startPage: 1 },
      { endPage: 80, startPage: 41 },
      { endPage: 85, startPage: 81 }
    ]);
  });

  it('splits the concatenated MMD while preserving blank pages', (): void => {
    assert.deepEqual(splitMathpixMmdByPage('First page\n\\pagebreak\n\n\\pagebreak\nThird page\n\\pagebreak\n', 3), [
      'First page',
      '',
      'Third page'
    ]);
  });

  it('splits one 40-page Mathpix result back into 40 page MMD documents', (): void => {
    const combined = Array.from({ length: 40 }, (_, index) => `Page ${index + 1}\n\\pagebreak\n`).join('');

    assert.deepEqual(splitMathpixMmdByPage(combined, 40), Array.from({ length: 40 }, (_, index) => `Page ${index + 1}`));
  });

  it('accepts a missing trailing Mathpix page break', (): void => {
    assert.deepEqual(splitMathpixMmdByPage('First page\n\\pagebreak\nSecond page', 2), [
      'First page',
      'Second page'
    ]);
  });

  it('still rejects results with too few page boundaries', (): void => {
    assert.throws(
      () => splitMathpixMmdByPage('First page\n\\pagebreak\nSecond and third page', 3),
      /1 page breaks for a 3-page PDF/
    );
  });

  it('creates a self-contained ZIP containing only images referenced by one page', async (): Promise<void> => {
    const pageMmd = 'Diagram ![](./images/figure-2.png)';
    const archive = {
      'book/images/figure-1.png': strToU8('one'),
      'book/images/figure-2.png': strToU8('two'),
      'book/images/unused.png': strToU8('unused')
    };
    const blob = createMathpixPageMmdZip(pageMmd, archive, 'book/book.mmd');
    const entries = unzipSync(new Uint8Array(await blob.arrayBuffer()));

    assert.deepEqual(Object.keys(entries).sort(), ['images/figure-2.png', 'page.mmd']);
    assert.equal(strFromU8(entries['page.mmd']), pageMmd);
    assert.equal(strFromU8(entries['images/figure-2.png']), 'two');
  });

  it('reconnects to a saved Mathpix pdf id without submitting the PDF again', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const calls: Array<{ method: string; url: string }> = [];

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      const method = init?.method ?? 'GET';

      calls.push({ method, url });

      if (url === 'https://api.mathpix.com/v3/pdf/saved-pdf/stream') {
        return new Response('', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/saved-pdf') {
        return Response.json({
          conversion_status: { 'mmd.zip': { status: 'error' } },
          num_pages: 1,
          num_pages_completed: 1,
          status: 'completed'
        });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/saved-pdf.mmd') {
        return new Response('Recovered page', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/saved-pdf.lines.json') {
        return Response.json({ pages: [] });
      }

      throw new Error(`Unexpected fetch: ${method} ${url}`);
    };

    try {
      const result = await recognizePdfWithMathpix(undefined, 'api-key', new File([], 'slice.pdf'), 1, undefined, undefined, undefined, { pdfId: 'saved-pdf' });

      assert.equal(result.pages[0]?.pageMMD, 'Recovered page');
      assert.equal(calls.some(({ method, url }) => method === 'POST' && url === 'https://api.mathpix.com/v3/pdf'), false);
      assert.equal(calls.some(({ url }) => url === 'https://api.mathpix.com/v3/pdf/saved-pdf'), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('retries transient Mathpix rate limits while reconnecting to a saved PDF job', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    let statusCalls = 0;

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === 'https://api.mathpix.com/v3/pdf/rate-limited-pdf/stream') {
        return new Response('', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/rate-limited-pdf') {
        statusCalls++;

        if (statusCalls === 1) {
          return Response.json({
            error: 'Too many requests',
            error_info: { id: 'rate_limit_exceeded' }
          }, {
            headers: { 'Retry-After': '0' },
            status: 429
          });
        }

        return Response.json({
          conversion_status: { 'mmd.zip': { status: 'error' } },
          num_pages: 1,
          num_pages_completed: 1,
          status: 'completed'
        });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/rate-limited-pdf.mmd') {
        return new Response('Recovered after rate limit', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/rate-limited-pdf.lines.json') {
        return Response.json({ pages: [] });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      const result = await recognizePdfWithMathpix(undefined, 'api-key', new File([], 'slice.pdf'), 1, undefined, undefined, undefined, { pdfId: 'rate-limited-pdf' });

      assert.equal(result.pages[0]?.pageMMD, 'Recovered after rate limit');
      assert.equal(statusCalls, 2);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('waits briefly for final streamed pages when concatenated MMD is missing page breaks', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const encoder = new TextEncoder();

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === 'https://api.mathpix.com/v3/pdf/stream-race-pdf/stream') {
        const body = new ReadableStream<Uint8Array>({
          start (controller) {
            controller.enqueue(encoder.encode('data: {"page_idx":1,"pdf_selected_len":2,"text":"Stream page one"}\n\n'));
            setTimeout(() => {
              controller.enqueue(encoder.encode('data: {"page_idx":2,"pdf_selected_len":2,"text":"Stream page two"}\n\n'));
              controller.close();
            }, 20);
          }
        });

        return new Response(body, { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/stream-race-pdf') {
        return Response.json({
          conversion_status: { 'mmd.zip': { status: 'error' } },
          num_pages: 2,
          num_pages_completed: 2,
          status: 'completed'
        });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/stream-race-pdf.mmd') {
        return new Response('Concatenated output without any page break marker', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/stream-race-pdf.lines.json') {
        return Response.json({ pages: [] });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      const result = await recognizePdfWithMathpix(undefined, 'api-key', new File([], 'slice.pdf'), 2, undefined, undefined, undefined, { pdfId: 'stream-race-pdf' });

      assert.deepEqual(result.pages.map(({ pageMMD }) => pageMMD), ['Stream page one', 'Stream page two']);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('recovers page boundaries from per-page MMD lines when a completed job has too few page breaks', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    const requested: string[] = [];

    globalThis.fetch = async (input: RequestInfo | URL): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      requested.push(url);

      if (url === 'https://api.mathpix.com/v3/pdf/missing-breaks-pdf/stream') {
        return new Response('', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/missing-breaks-pdf') {
        return Response.json({
          conversion_status: { 'mmd.zip': { status: 'error' } },
          num_pages: 3,
          num_pages_completed: 3,
          status: 'completed'
        });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/missing-breaks-pdf.mmd') {
        return new Response('Page one\n\\pagebreak\nPage two and page three were merged', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/missing-breaks-pdf.lines.json') {
        return Response.json({ pages: [{ page: 1, lines: [] }, { page: 2, lines: [] }, { page: 3, lines: [] }] });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/missing-breaks-pdf.lines.mmd.json') {
        return Response.json({
          pages: [
            { page: 1, lines: [{ text: 'Recovered page one' }] },
            { page: 2, lines: [] },
            { page: 3, lines: [{ text: 'Recovered page three' }] }
          ]
        });
      }

      throw new Error(`Unexpected fetch: ${url}`);
    };

    try {
      const result = await recognizePdfWithMathpix(undefined, 'api-key', new File([], 'slice.pdf'), 3, undefined, undefined, undefined, { pdfId: 'missing-breaks-pdf' });

      assert.deepEqual(result.pages.map(({ pageMMD }) => pageMMD), ['Recovered page one', '', 'Recovered page three']);
      assert.equal(requested.includes('https://api.mathpix.com/v3/pdf/missing-breaks-pdf.lines.mmd.json'), true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('exposes a new pdf id before it starts waiting for Mathpix', async (): Promise<void> => {
    const originalFetch = globalThis.fetch;
    let persistedPdfId: string | undefined;

    globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;

      if (url === 'https://api.mathpix.com/v3/pdf' && init?.method === 'POST') {
        return Response.json({ pdf_id: 'new-pdf' });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/new-pdf/stream') {
        return new Response('', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/new-pdf') {
        assert.equal(persistedPdfId, 'new-pdf', 'the caller must be able to persist the id before polling starts');

        return Response.json({
          conversion_status: { 'mmd.zip': { status: 'error' } },
          num_pages: 1,
          num_pages_completed: 1,
          status: 'completed'
        });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/new-pdf.mmd') {
        return new Response('Fresh page', { status: 200 });
      }

      if (url === 'https://api.mathpix.com/v3/pdf/new-pdf.lines.json') {
        return Response.json({ pages: [] });
      }

      throw new Error(`Unexpected fetch: ${init?.method ?? 'GET'} ${url}`);
    };

    try {
      const result = await recognizePdfWithMathpix(undefined, 'api-key', new File([], 'slice.pdf'), 1, undefined, undefined, undefined, {
        onPdfId: async (pdfId) => {
          persistedPdfId = pdfId;
        }
      });

      assert.equal(result.pages[0]?.pageMMD, 'Fresh page');
      assert.equal(persistedPdfId, 'new-pdf');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
