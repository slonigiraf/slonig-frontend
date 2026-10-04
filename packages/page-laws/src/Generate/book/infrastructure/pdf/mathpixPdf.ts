// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { markdownImageReferences } from '../../domain/content/markdownImages.js';

const MATHPIX_POLL_INTERVAL_MS = 1000;
const MATHPIX_MAX_POLL_ATTEMPTS = 3600;
const PAGE_BREAK_PATTERN = /\\pagebreak[ \t]*(?:\r?\n)?/g;

export const MATHPIX_PDF_SLICE_SIZE = 40;

interface MathpixConversionStatus {
  error?: string;
  status?: string;
}

interface MathpixPdfStatus {
  conversion_status?: Record<string, MathpixConversionStatus>;
  error?: string;
  num_pages?: number;
  num_pages_completed?: number;
  status?: string;
}

interface MathpixStreamPage {
  page_idx?: number;
  pdf_selected_len?: number;
  text?: string;
}

interface MathpixLinesPage {
  page?: number;
  [key: string]: unknown;
}

export interface MathpixLinesDocument {
  pages?: MathpixLinesPage[];
  [key: string]: unknown;
}

export interface MathpixRecognizedPage {
  pageMMD: string;
  pageMMDZip: Blob;
}

export interface MathpixPdfRecognitionResult {
  lines: MathpixLinesDocument;
  pages: MathpixRecognizedPage[];
}

type MathpixProgressHandler = (completedPages: number) => void;
type MathpixExternalCallHandler = (provider: 'mmd' | 'pdfv3') => void;

export interface MathpixPdfSlice {
  endPage: number;
  startPage: number;
}

function abortError (): Error {
  const error = new Error('The operation was aborted.');

  error.name = 'AbortError';

  return error;
}

function delay (ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) {
    return Promise.reject(abortError());
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
      reject(abortError());
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export function mathpixPdfSlices (totalPages: number, sliceSize = MATHPIX_PDF_SLICE_SIZE): MathpixPdfSlice[] {
  if (!Number.isInteger(totalPages) || totalPages <= 0 || !Number.isInteger(sliceSize) || sliceSize <= 0) {
    return [];
  }

  const slices: MathpixPdfSlice[] = [];

  for (let startPage = 1; startPage <= totalPages; startPage += sliceSize) {
    slices.push({
      endPage: Math.min(totalPages, startPage + sliceSize - 1),
      startPage
    });
  }

  return slices;
}

function normalizeArchivePath (value: string): string {
  return value
    .replace(/\\/g, '/')
    .replace(/^\.\//, '')
    .replace(/^\//, '')
    .replace(/\/{2,}/g, '/');
}

function decodeImageReference (value: string): string {
  let decoded = value.trim().replace(/\\/g, '/').split(/[?#]/, 1)[0];

  try {
    decoded = decodeURIComponent(decoded);
  } catch {
    // Keep the original reference when a malformed escape sequence is present.
  }

  return normalizeArchivePath(decoded);
}

function archiveBasename (value: string): string {
  const normalized = normalizeArchivePath(value);

  return normalized.slice(normalized.lastIndexOf('/') + 1);
}

function isRemoteImageReference (value: string): boolean {
  return /^(?:data:image\/|blob:|https?:\/\/)/i.test(value.trim());
}

function safePageZipPath (value: string): string | undefined {
  const output: string[] = [];

  for (const segment of decodeImageReference(value).split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      output.pop();
      continue;
    }

    output.push(segment);
  }

  return output.length ? output.join('/') : undefined;
}

function findArchiveEntry (entries: Record<string, Uint8Array>, reference: string, mmdEntryName?: string): Uint8Array | undefined {
  const normalizedReference = decodeImageReference(reference).toLocaleLowerCase();
  const referenceBasename = archiveBasename(normalizedReference);
  const mmdDirectory = mmdEntryName?.includes('/')
    ? normalizeArchivePath(mmdEntryName).slice(0, normalizeArchivePath(mmdEntryName).lastIndexOf('/'))
    : '';
  const relativeToMmd = mmdDirectory
    ? `${mmdDirectory}/${normalizeArchivePath(reference)}`.toLocaleLowerCase()
    : normalizedReference;

  const match = Object.entries(entries).find(([name]) => {
    const normalizedName = normalizeArchivePath(name).toLocaleLowerCase();

    return normalizedName === normalizedReference ||
      normalizedName === relativeToMmd ||
      normalizedName.endsWith(`/${normalizedReference}`) ||
      archiveBasename(normalizedName) === referenceBasename;
  });

  return match?.[1];
}

function findMmdEntry (entries: Record<string, Uint8Array>): [string, Uint8Array] | undefined {
  return Object.entries(entries)
    .filter(([name]) => name.toLocaleLowerCase().endsWith('.mmd'))
    .sort(([left], [right]) => left.length - right.length)[0];
}

export function splitMathpixMmdByPage (mmd: string, totalPages: number): string[] {
  if (!Number.isInteger(totalPages) || totalPages <= 0) {
    return [];
  }

  const parts = mmd.split(PAGE_BREAK_PATTERN);
  const pageBreakCount = parts.length - 1;

  if (pageBreakCount < totalPages) {
    if (totalPages === 1 && pageBreakCount === 0) {
      return [mmd.trim()];
    }

    throw new Error(`Mathpix returned ${pageBreakCount} page breaks for a ${totalPages}-page PDF.`);
  }

  return parts.slice(0, totalPages).map((part) => part.trim());
}

export function createMathpixPageMmdZip (pageMmd: string, entries: Record<string, Uint8Array> = {}, mmdEntryName?: string): Blob {
  const output: Record<string, Uint8Array> = {
    'page.mmd': strToU8(pageMmd)
  };

  for (const reference of markdownImageReferences(pageMmd)) {
    if (isRemoteImageReference(reference)) {
      continue;
    }

    const outputName = safePageZipPath(reference);
    const bytes = outputName ? findArchiveEntry(entries, reference, mmdEntryName) : undefined;

    if (outputName && bytes) {
      output[outputName] = bytes;
    }
  }

  return new Blob([zipSync(output, { level: 0 })], { type: 'application/zip' });
}

function isAbortError (error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function parseStreamEvent (data: string): MathpixStreamPage | undefined {
  try {
    const parsed = JSON.parse(data) as MathpixStreamPage;

    return Number.isInteger(parsed.page_idx) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

async function streamMathpixPages (pdfId: string, headers: Record<string, string>, signal: AbortSignal, streamedPages: Map<number, string>, onProgress?: MathpixProgressHandler, onExternalCall?: MathpixExternalCallHandler): Promise<void> {
  onExternalCall?.('pdfv3');
  const response = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}/stream`, {
    headers: { ...headers, Accept: 'text/event-stream' },
    signal
  });

  if (!response.ok || !response.body) {
    throw new Error('Unable to stream Mathpix PDF recognition progress.');
  }

  const decoder = new TextDecoder();
  const reader = response.body.getReader();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();

    buffer += decoder.decode(value, { stream: !done });

    const lines = buffer.split(/\r?\n/);

    buffer = done ? '' : lines.pop() ?? '';

    for (const line of lines) {
      if (!line.startsWith('data:')) {
        continue;
      }

      const page = parseStreamEvent(line.slice(5).trim());

      if (page?.page_idx !== undefined) {
        streamedPages.set(page.page_idx, page.text ?? '');
        onProgress?.(streamedPages.size);
      }
    }

    if (done) {
      return;
    }
  }
}

async function waitForMathpixPdf (pdfId: string, headers: Record<string, string>, onProgress?: MathpixProgressHandler, onExternalCall?: MathpixExternalCallHandler, signal?: AbortSignal): Promise<MathpixPdfStatus> {
  for (let attempt = 0; attempt < MATHPIX_MAX_POLL_ATTEMPTS; attempt++) {
    onExternalCall?.('pdfv3');
    const response = await fetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, { headers, signal });
    const status = await response.json() as MathpixPdfStatus;

    if (!response.ok) {
      throw new Error(status.error || 'Unable to check Mathpix PDF recognition.');
    }

    if (Number.isFinite(status.num_pages_completed)) {
      onProgress?.(status.num_pages_completed ?? 0);
    }

    if (status.status === 'error') {
      throw new Error(status.error || 'Mathpix could not recognize the PDF.');
    }

    const zipStatus = status.conversion_status?.['mmd.zip'];
    const zipFinished = !zipStatus || zipStatus.status === 'completed' || zipStatus.status === 'error';

    if (status.status === 'completed' && zipFinished) {
      return status;
    }

    await delay(MATHPIX_POLL_INTERVAL_MS, signal);
  }

  throw new Error('Mathpix timed out while recognizing the PDF.');
}

function pageMmdFromStream (streamedPages: Map<number, string>, totalPages: number): string[] | undefined {
  const pages = Array.from({ length: totalPages }, (_, index) => streamedPages.get(index + 1));

  return pages.every((page): page is string => page !== undefined)
    ? pages.map((page) => page.replace(PAGE_BREAK_PATTERN, '').trim())
    : undefined;
}

function splitWithStreamFallback (mmd: string, streamedPages: Map<number, string>, totalPages: number): string[] {
  try {
    return splitMathpixMmdByPage(mmd, totalPages);
  } catch (error) {
    const streamed = pageMmdFromStream(streamedPages, totalPages);

    if (streamed) {
      return streamed;
    }

    throw error;
  }
}

export async function recognizePdfWithMathpix (appId: string | undefined, apiKey: string, file: File, totalPages: number, onProgress?: MathpixProgressHandler, onExternalCall?: MathpixExternalCallHandler, signal?: AbortSignal): Promise<MathpixPdfRecognitionResult> {
  const headers: Record<string, string> = { app_key: apiKey };

  if (appId?.trim()) {
    headers.app_id = appId.trim();
  }
  const body = new FormData();

  body.append('file', file, file.name);
  body.append('options_json', JSON.stringify({
    conversion_formats: { 'mmd.zip': true },
    include_page_breaks: true,
    streaming: true
  }));

  onExternalCall?.('pdfv3');
  const response = await fetch('https://api.mathpix.com/v3/pdf', {
    body,
    headers,
    method: 'POST',
    signal
  });
  const result = await response.json() as { error?: string; pdf_id?: string };

  if (!response.ok || !result.pdf_id) {
    throw new Error(result.error || 'Mathpix could not start PDF recognition.');
  }

  const streamedPages = new Map<number, string>();
  const streamAbort = new AbortController();
  const abortStream = (): void => streamAbort.abort();

  signal?.addEventListener('abort', abortStream, { once: true });
  const streamPromise = streamMathpixPages(result.pdf_id, headers, streamAbort.signal, streamedPages, onProgress, onExternalCall)
    .catch((error: unknown) => {
      if (!isAbortError(error)) {
        console.warn('Mathpix page streaming failed; continuing with status polling.', error);
      }
    });

  let status: MathpixPdfStatus;

  try {
    status = await waitForMathpixPdf(result.pdf_id, headers, onProgress, onExternalCall, signal);
  } finally {
    streamAbort.abort();
    await streamPromise;
    signal?.removeEventListener('abort', abortStream);
  }

  if (status.num_pages !== undefined && status.num_pages !== totalPages) {
    throw new Error(`Mathpix reported ${status.num_pages} pages for a ${totalPages}-page PDF.`);
  }

  onExternalCall?.('mmd');
  onExternalCall?.('pdfv3');
  const [mmdResponse, linesResponse] = await Promise.all([
    fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.mmd`, { headers, signal }),
    fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.lines.json`, { headers, signal })
  ]);

  if (!mmdResponse.ok) {
    throw new Error('Unable to download the MMD text from Mathpix.');
  }

  const mmd = await mmdResponse.text();
  const pageMmd = splitWithStreamFallback(mmd, streamedPages, totalPages);
  let lines: MathpixLinesDocument = {};

  if (linesResponse.ok) {
    try {
      lines = await linesResponse.json() as MathpixLinesDocument;
    } catch {
      // MMD output remains usable if optional line metadata cannot be parsed.
    }
  }

  const zipStatus = status.conversion_status?.['mmd.zip'];
  let archiveEntries: Record<string, Uint8Array> = {};
  let archiveMmdEntryName: string | undefined;
  let archivePageMmd: string[] | undefined;

  if (zipStatus?.status === 'completed') {
    onExternalCall?.('mmd');
    const zipResponse = await fetch(`https://api.mathpix.com/v3/pdf/${result.pdf_id}.mmd.zip`, { headers, signal });

    if (zipResponse.ok) {
      try {
        archiveEntries = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
        const mmdEntry = findMmdEntry(archiveEntries);

        if (mmdEntry) {
          archiveMmdEntryName = mmdEntry[0];
          archivePageMmd = splitMathpixMmdByPage(strFromU8(mmdEntry[1]), totalPages);
        }
      } catch (error) {
        console.warn('Mathpix MMD ZIP could not be split by page; creating text-only page ZIPs.', error);
        archiveEntries = {};
        archiveMmdEntryName = undefined;
        archivePageMmd = undefined;
      }
    }
  }

  return {
    lines,
    pages: pageMmd.map((page, index) => ({
      pageMMD: page,
      pageMMDZip: createMathpixPageMmdZip(archivePageMmd?.[index] ?? page, archiveEntries, archiveMmdEntryName)
    }))
  };
}
