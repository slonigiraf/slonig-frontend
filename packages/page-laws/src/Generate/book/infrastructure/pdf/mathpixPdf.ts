// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

import { markdownImageReferences } from '../../domain/content/markdownImages.js';

const MATHPIX_POLL_INTERVAL_MS = 5000;
const MATHPIX_MAX_POLL_ATTEMPTS = 720;
const MATHPIX_MAX_FETCH_ATTEMPTS = 6;
const MATHPIX_RETRY_BASE_DELAY_MS = 1000;
const MATHPIX_RETRY_MAX_DELAY_MS = 30_000;
const MATHPIX_STREAM_COMPLETION_GRACE_MS = 5000;
const MATHPIX_MAX_MISSING_INDEXED_PAGES = 2;
const PAGE_BREAK_PATTERN = /\\pagebreak[ \t]*(?:\r?\n)?/g;

export const MATHPIX_PDF_SLICE_SIZE = 40;
export const MATHPIX_PDF_SLICE_CONCURRENCY = 4;

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

interface MathpixLine {
  conversion_output?: boolean;
  text?: string;
  text_display?: string;
  [key: string]: unknown;
}

interface MathpixLinesPage {
  lines?: MathpixLine[];
  page?: number;
  [key: string]: unknown;
}

interface MathpixMmdLine {
  text?: string;
}

interface MathpixMmdLinesPage {
  lines?: MathpixMmdLine[];
  page?: number;
}

interface MathpixMmdLinesDocument {
  pages?: MathpixMmdLinesPage[];
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

export interface MathpixPdfResumeOptions {
  /** Existing remote Mathpix job to reconnect to instead of submitting again. */
  pdfId?: string;
  /** Called immediately after a new Mathpix job is accepted, before polling it. */
  onPdfId?: (pdfId: string) => Promise<void> | void;
}

export class MathpixPdfTerminalError extends Error {
  constructor (message: string) {
    super(message);
    this.name = 'MathpixPdfTerminalError';
  }
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

  if (totalPages === 1) {
    return [mmd.replace(PAGE_BREAK_PATTERN, '').trim()];
  }

  const parts = mmd.split(PAGE_BREAK_PATTERN);
  const pageBreakCount = parts.length - 1;

  // Never infer page identity from N - 1 separators. A missing separator in the
  // middle of the document is indistinguishable from a missing trailing marker
  // and silently shifts every later page. Numbered Mathpix outputs (SSE page_idx
  // or lines.mmd.json/lines.json page) are used before this fallback, so only
  // trust combined MMD when Mathpix emitted a marker for every source page.
  if (pageBreakCount < totalPages) {
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

function retryAfterMs (response: Response): number | undefined {
  const retryAfter = response.headers.get('retry-after');

  if (!retryAfter?.trim()) {
    return undefined;
  }

  const seconds = Number(retryAfter);

  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const retryDate = Date.parse(retryAfter);

  return Number.isNaN(retryDate) ? undefined : Math.max(0, retryDate - Date.now());
}

function isRetryableMathpixStatus (status: number): boolean {
  return status === 408 || status === 425 || status === 429 || (status >= 500 && status <= 599);
}

async function isNonRetryableMathpixQuota (response: Response): Promise<boolean> {
  if (response.status !== 429) {
    return false;
  }

  try {
    const body = await response.clone().json() as {
      error_info?: { id?: string; limit_name?: string };
    };
    const errorId = body.error_info?.id?.toLocaleLowerCase();
    const limitName = body.error_info?.limit_name?.toLocaleLowerCase();

    return errorId === 'quota_exceeded' || Boolean(limitName?.includes('monthly'));
  } catch {
    return false;
  }
}

function isRetryableFetchError (error: unknown): boolean {
  if (isAbortError(error)) {
    return false;
  }

  return error instanceof TypeError || (error instanceof Error && /(?:network|fetch|timed out|timeout)/i.test(error.message));
}

async function mathpixFetch (input: RequestInfo | URL, init: RequestInit, signal?: AbortSignal, onRequest?: () => void): Promise<Response> {
  let lastError: unknown;

  for (let attempt = 0; attempt < MATHPIX_MAX_FETCH_ATTEMPTS; attempt++) {
    if (signal?.aborted) {
      throw abortError();
    }

    try {
      onRequest?.();
      const response = await fetch(input, { ...init, ...(signal ? { signal } : {}) });

      if (!isRetryableMathpixStatus(response.status) || attempt === MATHPIX_MAX_FETCH_ATTEMPTS - 1 || await isNonRetryableMathpixQuota(response)) {
        return response;
      }

      const retryDelay = Math.min(
        MATHPIX_RETRY_MAX_DELAY_MS,
        retryAfterMs(response) ?? MATHPIX_RETRY_BASE_DELAY_MS * (2 ** attempt)
      );

      await delay(retryDelay, signal);
    } catch (error) {
      lastError = error;

      if (!isRetryableFetchError(error) || attempt === MATHPIX_MAX_FETCH_ATTEMPTS - 1) {
        throw error;
      }

      await delay(Math.min(MATHPIX_RETRY_MAX_DELAY_MS, MATHPIX_RETRY_BASE_DELAY_MS * (2 ** attempt)), signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Mathpix request failed after retries.');
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
  const response = await mathpixFetch(`https://api.mathpix.com/v3/pdf/${pdfId}/stream`, {
    headers: { ...headers, Accept: 'text/event-stream' },
    signal
  }, signal, () => onExternalCall?.('pdfv3'));

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
    const response = await mathpixFetch(`https://api.mathpix.com/v3/pdf/${pdfId}`, { headers, signal }, signal, () => onExternalCall?.('pdfv3'));
    const status = await response.json() as MathpixPdfStatus;

    if (!response.ok) {
      if (response.status === 404) {
        throw new MathpixPdfTerminalError(status.error || 'The saved Mathpix PDF job no longer exists.');
      }

      throw new Error(status.error || 'Unable to check Mathpix PDF recognition.');
    }

    if (Number.isFinite(status.num_pages_completed)) {
      onProgress?.(status.num_pages_completed ?? 0);
    }

    if (status.status === 'error') {
      throw new MathpixPdfTerminalError(status.error || 'Mathpix could not recognize the PDF.');
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

async function waitForStreamedPages (streamedPages: Map<number, string>, totalPages: number, signal?: AbortSignal): Promise<void> {
  const deadline = Date.now() + MATHPIX_STREAM_COMPLETION_GRACE_MS;

  while (streamedPages.size < totalPages && Date.now() < deadline) {
    await delay(Math.min(100, Math.max(1, deadline - Date.now())), signal);
  }
}

function pageMmdFromMmdLines (document: MathpixMmdLinesDocument, totalPages: number): string[] | undefined {
  const byPage = new Map<number, string>();

  for (const page of document.pages ?? []) {
    const pageNumber = page.page;

    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
      continue;
    }

    byPage.set(pageNumber, (page.lines ?? [])
      .map(({ text }) => text ?? '')
      .join('\n')
      .replace(PAGE_BREAK_PATTERN, '')
      .trim());
  }

  if (byPage.size < Math.max(1, totalPages - MATHPIX_MAX_MISSING_INDEXED_PAGES)) {
    return undefined;
  }

  // A completed Mathpix job can omit an entirely blank/unrecognized page from
  // the line document. Preserve the source PDF numbering by materializing that
  // missing index as an empty page instead of shifting the following pages.
  return Array.from({ length: totalPages }, (_, index) => byPage.get(index + 1) ?? '');
}

function pageMmdFromLines (document: MathpixLinesDocument, totalPages: number): string[] | undefined {
  const byPage = new Map<number, string>();

  for (const page of document.pages ?? []) {
    const pageNumber = page.page;

    if (typeof pageNumber !== 'number' || !Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > totalPages) {
      continue;
    }

    byPage.set(pageNumber, (page.lines ?? [])
      .filter(({ conversion_output }) => conversion_output !== false)
      .map(({ text, text_display }) => text_display ?? text ?? '')
      .join('\n')
      .replace(PAGE_BREAK_PATTERN, '')
      .trim());
  }

  if (byPage.size < Math.max(1, totalPages - MATHPIX_MAX_MISSING_INDEXED_PAGES)) {
    return undefined;
  }

  return Array.from({ length: totalPages }, (_, index) => byPage.get(index + 1) ?? '');
}

async function recoverPageMmd (pdfId: string, headers: Record<string, string>, lines: MathpixLinesDocument, totalPages: number, onExternalCall?: MathpixExternalCallHandler, signal?: AbortSignal): Promise<string[] | undefined> {
  const linesMmdResponse = await mathpixFetch(`https://api.mathpix.com/v3/pdf/${pdfId}.lines.mmd.json`, { headers, signal }, signal, () => onExternalCall?.('pdfv3'));

  if (linesMmdResponse.ok) {
    try {
      const mmdLines = await linesMmdResponse.json() as MathpixMmdLinesDocument;
      const recovered = pageMmdFromMmdLines(mmdLines, totalPages);

      if (recovered) {
        return recovered;
      }
    } catch {
      // Fall through to the current lines.json representation below.
    }
  }

  return pageMmdFromLines(lines, totalPages);
}

async function splitWithFallbacks (pdfId: string, headers: Record<string, string>, mmd: string, streamedPages: Map<number, string>, lines: MathpixLinesDocument, totalPages: number, onExternalCall?: MathpixExternalCallHandler, signal?: AbortSignal): Promise<string[]> {
  // Page numbering must come from an explicit Mathpix page index whenever
  // possible. Separator counts alone cannot tell whether a missing marker was
  // at the end or in the middle (which would shift every later page).
  const streamed = pageMmdFromStream(streamedPages, totalPages);

  if (streamed) {
    return streamed;
  }

  const recovered = await recoverPageMmd(pdfId, headers, lines, totalPages, onExternalCall, signal);

  if (recovered) {
    return recovered;
  }

  return splitMathpixMmdByPage(mmd, totalPages);
}

export async function recognizePdfWithMathpix (appId: string | undefined, apiKey: string, file: File, totalPages: number, onProgress?: MathpixProgressHandler, onExternalCall?: MathpixExternalCallHandler, signal?: AbortSignal, resume?: MathpixPdfResumeOptions): Promise<MathpixPdfRecognitionResult> {
  const headers: Record<string, string> = { app_key: apiKey };

  if (appId?.trim()) {
    headers.app_id = appId.trim();
  }

  let pdfId = resume?.pdfId?.trim();

  if (!pdfId) {
    const body = new FormData();

    body.append('file', file, file.name);
    body.append('options_json', JSON.stringify({
      conversion_formats: { 'mmd.zip': true },
      include_page_breaks: true,
      streaming: true
    }));

    const response = await mathpixFetch('https://api.mathpix.com/v3/pdf', {
      body,
      headers,
      method: 'POST',
      signal
    }, signal, () => onExternalCall?.('pdfv3'));
    const result = await response.json() as { error?: string; pdf_id?: string };

    if (!response.ok || !result.pdf_id) {
      throw new Error(result.error || 'Mathpix could not start PDF recognition.');
    }

    pdfId = result.pdf_id;
    await resume?.onPdfId?.(pdfId);
  }

  const streamedPages = new Map<number, string>();
  const streamAbort = new AbortController();
  const abortStream = (): void => streamAbort.abort();

  signal?.addEventListener('abort', abortStream, { once: true });
  let streamFinished = false;
  const streamPromise = streamMathpixPages(pdfId, headers, streamAbort.signal, streamedPages, onProgress, onExternalCall)
    .catch((error: unknown) => {
      if (!isAbortError(error)) {
        console.warn('Mathpix page streaming failed; continuing with status polling.', error);
      }
    })
    .finally(() => {
      streamFinished = true;
    });

  let status: MathpixPdfStatus;

  try {
    status = await waitForMathpixPdf(pdfId, headers, onProgress, onExternalCall, signal);

    // status=completed can race slightly ahead of delivery of the final SSE page
    // events. Keep the stream alive for a short grace period so page_idx can be
    // used as the authoritative fallback when the concatenated MMD is missing
    // one or more page-break markers.
    if (!streamFinished && streamedPages.size < totalPages) {
      await waitForStreamedPages(streamedPages, totalPages, signal);
    }
  } finally {
    streamAbort.abort();
    await streamPromise;
    signal?.removeEventListener('abort', abortStream);
  }

  if (status.num_pages !== undefined && status.num_pages !== totalPages) {
    throw new MathpixPdfTerminalError(`Mathpix reported ${status.num_pages} pages for a ${totalPages}-page PDF.`);
  }

  const [mmdResponse, linesResponse] = await Promise.all([
    mathpixFetch(`https://api.mathpix.com/v3/pdf/${pdfId}.mmd`, { headers, signal }, signal, () => onExternalCall?.('mmd')),
    mathpixFetch(`https://api.mathpix.com/v3/pdf/${pdfId}.lines.json`, { headers, signal }, signal, () => onExternalCall?.('pdfv3'))
  ]);

  if (!mmdResponse.ok) {
    throw new Error('Unable to download the MMD text from Mathpix.');
  }

  const mmd = await mmdResponse.text();
  let lines: MathpixLinesDocument = {};

  if (linesResponse.ok) {
    try {
      lines = await linesResponse.json() as MathpixLinesDocument;
    } catch {
      // MMD output remains usable if optional line metadata cannot be parsed.
    }
  }

  const pageMmd = await splitWithFallbacks(pdfId, headers, mmd, streamedPages, lines, totalPages, onExternalCall, signal);

  const zipStatus = status.conversion_status?.['mmd.zip'];
  let archiveEntries: Record<string, Uint8Array> = {};
  let archiveMmdEntryName: string | undefined;
  let archivePageMmd: string[] | undefined;

  if (zipStatus?.status === 'completed') {
    const zipResponse = await mathpixFetch(`https://api.mathpix.com/v3/pdf/${pdfId}.mmd.zip`, { headers, signal }, signal, () => onExternalCall?.('mmd'));

    if (zipResponse.ok) {
      try {
        archiveEntries = unzipSync(new Uint8Array(await zipResponse.arrayBuffer()));
        const mmdEntry = findMmdEntry(archiveEntries);

        if (mmdEntry) {
          archiveMmdEntryName = mmdEntry[0];

          try {
            archivePageMmd = splitMathpixMmdByPage(strFromU8(mmdEntry[1]), totalPages);
          } catch (error) {
            // Keep the archive images. The recovered per-page MMD can still
            // reference them even when the archive's combined MMD is missing
            // one or more page-break markers.
            console.warn('Mathpix MMD ZIP is missing page boundaries; using recovered page MMD with archive images.', error);
            archivePageMmd = undefined;
          }
        }
      } catch (error) {
        console.warn('Mathpix MMD ZIP could not be read; creating text-only page ZIPs.', error);
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
