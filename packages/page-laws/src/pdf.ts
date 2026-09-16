// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfJsPromise: Promise<typeof import('pdfjs-dist')> | undefined;

/**
 * Load PDF.js only when a PDF operation is requested. Keeping this behind a
 * dynamic import prevents the parser and worker bootstrap from entering the
 * initial application chunk.
 */
export function loadPdfJs (): Promise<typeof import('pdfjs-dist')> {
  if (!pdfJsPromise) {
    pdfJsPromise = import('pdfjs-dist').then((pdfjs) => {
      pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.js', import.meta.url).toString();

      return pdfjs;
    });
  }

  return pdfJsPromise;
}

export interface PdfOutlineChapterBoundary {
  confidence: number;
  startPage: number;
  title: string;
}

interface PdfOutlineItemLike {
  dest?: string | unknown[] | null;
  items?: PdfOutlineItemLike[];
  title?: string;
}

function cleanOutlineTitle (value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : '';
}

async function resolveOutlineDestinationPage (pdf: PDFDocumentProxy, destination: PdfOutlineItemLike['dest']): Promise<number | undefined> {
  try {
    const explicitDestination = typeof destination === 'string'
      ? await pdf.getDestination(destination)
      : destination;

    if (!Array.isArray(explicitDestination) || !explicitDestination.length) {
      return undefined;
    }

    const pageTarget = explicitDestination[0];

    // PDF.js normally exposes a page reference here, but the PDF destination
    // grammar also permits an integer page index. Support both forms.
    if (typeof pageTarget === 'number' && Number.isSafeInteger(pageTarget)) {
      const pageIndex = pageTarget;

      return pageIndex >= 0 && pageIndex < pdf.numPages ? pageIndex + 1 : undefined;
    }

    if (!pageTarget || typeof pageTarget !== 'object') {
      return undefined;
    }

    const pageIndex = await pdf.getPageIndex(pageTarget as Parameters<PDFDocumentProxy['getPageIndex']>[0]);

    return pageIndex >= 0 && pageIndex < pdf.numPages ? pageIndex + 1 : undefined;
  } catch {
    // Broken named destinations or stale outline references should not prevent
    // the text/AI chapter detector from being used as a fallback.
    return undefined;
  }
}

/**
 * Read the PDF outline/bookmarks as authoritative top-level chapter metadata.
 * Grouping bookmarks are expanded; children of chapter bookmarks remain
 * sections/subsections rather than separate chapters.
 */
async function readPdfOutlineChapterBoundaries (pdf: PDFDocumentProxy): Promise<PdfOutlineChapterBoundary[]> {
  let outline: PdfOutlineItemLike[] | null;

  try {
    outline = await pdf.getOutline() as PdfOutlineItemLike[] | null;
  } catch {
    throw new Error('Unable to read PDF bookmarks.');
  }

  if (!outline?.length) {
    return [];
  }

  const isGroupingBookmark = (title: string): boolean =>
    /^(?:(?:part|volume|book)(?:\s+(?:[IVXLC\d]+|one|two|three|four|five)\b.*)?|(?:table of )?contents|chapters)\s*$/i.test(title);
  const selected: PdfOutlineChapterBoundary[] = [];
  const visited = new WeakSet<PdfOutlineItemLike>();
  let visitedCount = 0;
  const visit = async (item: PdfOutlineItemLike): Promise<void> => {
    if (!item || typeof item !== 'object' || visited.has(item)) {
      return;
    }

    visited.add(item);
    visitedCount++;

    if (visitedCount > 10_000) {
      throw new Error('PDF bookmark outline is too large to process.');
    }

    if (visitedCount % 250 === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }

    const title = cleanOutlineTitle(item.title);
    const children = Array.isArray(item.items) ? item.items : [];

    if (children.length && isGroupingBookmark(title)) {
      for (const child of children) {
        await visit(child);
      }

      return;
    }

    const startPage = title ? await resolveOutlineDestinationPage(pdf, item.dest) : undefined;

    if (startPage !== undefined) {
      selected.push({ confidence: 1, startPage, title });
    } else {
      for (const child of children) {
        await visit(child);
      }
    }
  };

  for (const item of outline) {
    await visit(item);
  }
  const byPage = new Map<number, PdfOutlineChapterBoundary>();

  selected
    .sort((left, right) => left.startPage - right.startPage)
    .forEach((boundary) => {
      // When multiple bookmarks point to the same physical page at the chosen
      // hierarchy level, preserve the first author-provided title.
      if (!byPage.has(boundary.startPage)) {
        byPage.set(boundary.startPage, boundary);
      }
    });

  return [...byPage.values()];
}

export async function extractPdfOutlineChapterBoundaries (pdf: PDFDocumentProxy): Promise<PdfOutlineChapterBoundary[]> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Reading PDF bookmarks timed out.')), 20_000);
  });

  try {
    return await Promise.race([readPdfOutlineChapterBoundaries(pdf), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}
