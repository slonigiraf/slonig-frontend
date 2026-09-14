// Copyright 2021-2026 @polkadot/app-laws authors & contributors
// SPDX-License-Identifier: Apache-2.0

import type { BookPage, MathpixHeading } from '@slonigiraf/db';


export function extractMathpixHeadingsFromLines (value: unknown): MathpixHeading[] {
  if (!value || typeof value !== 'object') {
    return [];
  }

  const pages = (value as { pages?: unknown }).pages;

  if (!Array.isArray(pages)) {
    return [];
  }

  return pages.flatMap((page) => {
    if (!page || typeof page !== 'object' || !Array.isArray((page as { lines?: unknown }).lines)) {
      return [];
    }

    return ((page as { lines: unknown[] }).lines).flatMap((line) => {
      if (!line || typeof line !== 'object') {
        return [];
      }

      const candidate = line as { confidence?: unknown; conversion_output?: unknown; line?: unknown; text?: unknown; text_display?: unknown; type?: unknown };

      if (candidate.conversion_output === false || (candidate.type !== 'title' && candidate.type !== 'section_header')) {
        return [];
      }

      const text = (typeof candidate.text === 'string' ? candidate.text : typeof candidate.text_display === 'string' ? candidate.text_display : '').replace(/\s+/g, ' ').trim();

      if (!text) {
        return [];
      }

      return [{
        ...(typeof candidate.confidence === 'number' ? { confidence: candidate.confidence } : {}),
        ...(typeof candidate.line === 'number' ? { line: candidate.line } : {}),
        text,
        type: candidate.type
      } satisfies MathpixHeading];
    });
  });
}

export interface ChapterBoundaryProposal {
  confidence: number;
  startPage: number;
  title: string;
}

export interface ChapterPageEvidence {
  excerpt: string;
  headings: Array<{ confidence?: number; source: 'mathpix' | 'mmd'; text: string; type: 'section_header' | 'title' }>;
  pageNumber: number;
}

const cleanHeading = (value: string): string => value.replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim();

export function extractMmdHeadings (mmd: string): ChapterPageEvidence['headings'] {
  const result: ChapterPageEvidence['headings'] = [];
  const seen = new Set<string>();
  const add = (text: string, type: 'section_header' | 'title'): void => {
    const cleaned = cleanHeading(text);
    const key = `${type}:${cleaned.toLocaleLowerCase()}`;

    if (cleaned && !seen.has(key)) {
      seen.add(key);
      result.push({ source: 'mmd', text: cleaned, type });
    }
  };

  for (const line of mmd.split(/\r?\n/)) {
    const markdown = /^(#{1,3})\s+(.+?)\s*$/.exec(line);

    if (markdown) {
      add(markdown[2], markdown[1].length === 1 ? 'title' : 'section_header');
      continue;
    }

    const latex = /^\\(chapter|section|subsection)\*?\{(.+?)\}\s*$/.exec(line.trim());

    if (latex) {
      add(latex[2], latex[1] === 'chapter' ? 'title' : 'section_header');
    }
  }

  return result;
}

export function pageChapterEvidence (page: BookPage): ChapterPageEvidence {
  const headings: ChapterPageEvidence['headings'] = [];
  const seen = new Set<string>();
  const add = (heading: ChapterPageEvidence['headings'][number]): void => {
    const text = cleanHeading(heading.text);
    const key = `${heading.type}:${text.toLocaleLowerCase()}`;

    if (text && !seen.has(key)) {
      seen.add(key);
      headings.push({ ...heading, text });
    }
  };

  (page.mathpixHeadings ?? []).forEach(({ confidence, text, type }) => add({ ...(confidence === undefined ? {} : { confidence }), source: 'mathpix', text, type }));
  extractMmdHeadings(page.pageMMD ?? '').forEach(add);

  const excerpt = (page.pageMMD ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 650);

  return { excerpt, headings, pageNumber: page.pageNumber };
}

export function chapterEvidenceWindows (pages: BookPage[], windowSize = 36, overlap = 3): ChapterPageEvidence[][] {
  if (!Number.isSafeInteger(windowSize) || windowSize < 2 || !Number.isSafeInteger(overlap) || overlap < 0 || overlap >= windowSize) {
    throw new Error('Invalid chapter evidence window configuration.');
  }

  const evidence = [...pages].sort((a, b) => a.pageNumber - b.pageNumber).map(pageChapterEvidence);
  const windows: ChapterPageEvidence[][] = [];
  const step = windowSize - overlap;

  for (let start = 0; start < evidence.length; start += step) {
    windows.push(evidence.slice(start, start + windowSize));

    if (start + windowSize >= evidence.length) {
      break;
    }
  }

  return windows;
}

export function chapterWindowPrompt (evidence: ChapterPageEvidence[]): string {
  return `Identify only TOP-LEVEL chapter boundaries in this consecutive run of book pages. Mathpix structural labels are supplied when available: title is strong evidence for a major heading; section_header may be a chapter or a subsection and must NOT create a boundary unless the surrounding numbering/text clearly shows that it is top-level. Ignore table-of-contents listings, running headers, footers, exercise headings, examples, lessons, subsections and repeated chapter names in body text. A chapter continues until there is strong evidence for another top-level chapter. Return only boundaries that START inside the supplied page range. Keep titles in the book's original language. confidence must be 0..1. Return JSON only: {"chapters":[{"startPage":12,"title":"Chapter 2: Fractions","confidence":0.94}]}.

Pages:
${evidence.map(({ excerpt, headings, pageNumber }) => `--- page ${pageNumber} ---\nMathpix/MMD headings: ${headings.length ? headings.map(({ confidence, source, text, type }) => `[${source}:${type}${confidence === undefined ? '' : ` confidence=${confidence.toFixed(2)}`}] ${text}`).join(' | ') : '(none)'}\nOpening text: ${excerpt || '(no text)'}`).join('\n\n')}`;
}

export function chapterReconciliationPrompt (proposals: ChapterBoundaryProposal[], evidence: ChapterPageEvidence[], totalPages: number): string {
  const relevantPages = new Set<number>();

  proposals.forEach(({ startPage }) => {
    for (let page = Math.max(1, startPage - 1); page <= Math.min(totalPages, startPage + 1); page++) {
      relevantPages.add(page);
    }
  });
  evidence.filter(({ headings }) => headings.some(({ type }) => type === 'title')).forEach(({ pageNumber }) => relevantPages.add(pageNumber));
  const context = evidence.filter(({ pageNumber }) => relevantPages.has(pageNumber));

  return `Reconcile candidate chapter boundaries for one ${totalPages}-page book into a single stable chapter segmentation. Return TOP-LEVEL chapters only. Remove duplicate/overlapping candidates from window overlap. Do not promote sections, subsections, lessons, exercises, examples, running headers, or table-of-contents rows to chapters. Mathpix title labels are strong structural evidence, while section_header labels require chapter-level context. Preserve the best original-language chapter title. The result must be sorted by startPage and each startPage must be unique and between 1 and ${totalPages}. It is valid for the first real chapter to start after page 1; do not invent an Introduction chapter. Return JSON only: {"chapters":[{"startPage":12,"title":"Chapter 2: Fractions","confidence":0.96}]}.

Candidate boundaries:
${JSON.stringify(proposals)}

Structural context near candidates:
${context.map(({ excerpt, headings, pageNumber }) => `--- page ${pageNumber} ---\nHeadings: ${headings.map(({ confidence, source, text, type }) => `[${source}:${type}${confidence === undefined ? '' : ` confidence=${confidence.toFixed(2)}`}] ${text}`).join(' | ') || '(none)'}\nOpening: ${excerpt || '(no text)'}`).join('\n\n')}`;
}

export function parseChapterBoundaries (content: string, totalPages: number): ChapterBoundaryProposal[] {
  const json = content.replace(/^```json\s*|\s*```$/g, '').trim();
  const parsed = JSON.parse(json) as { chapters?: unknown };

  if (!Array.isArray(parsed.chapters)) {
    throw new Error('OpenRouter returned invalid chapter data.');
  }

  const byPage = new Map<number, ChapterBoundaryProposal>();

  for (const value of parsed.chapters) {
    if (!value || typeof value !== 'object') {
      continue;
    }

    const candidate = value as Partial<ChapterBoundaryProposal>;
    const startPage = Number(candidate.startPage);
    const title = typeof candidate.title === 'string' ? candidate.title.replace(/\s+/g, ' ').trim() : '';
    const confidence = Number(candidate.confidence);

    if (!Number.isSafeInteger(startPage) || startPage < 1 || startPage > totalPages || !title) {
      continue;
    }

    const normalized = { confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.5, startPage, title };
    const previous = byPage.get(startPage);

    if (!previous || normalized.confidence > previous.confidence) {
      byPage.set(startPage, normalized);
    }
  }

  return [...byPage.values()].sort((a, b) => a.startPage - b.startPage);
}

export function chapterAssignmentsFromBoundaries (boundaries: ChapterBoundaryProposal[], totalPages: number): ChapterBoundaryProposal[] {
  const sorted = boundaries.filter(({ startPage, title }) => startPage >= 1 && startPage <= totalPages && title.trim()).sort((a, b) => a.startPage - b.startPage);

  if (!sorted.length) {
    return [{ confidence: 0, startPage: 1, title: 'Book' }];
  }

  if (sorted[0].startPage > 1) {
    return [{ confidence: 1, startPage: 1, title: 'Front matter' }, ...sorted];
  }

  return sorted;
}
