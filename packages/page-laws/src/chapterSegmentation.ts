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
  headings: Array<{ confidence?: number; line?: number; signal?: 'section-sign' | 'uppercase-caption'; source: 'mathpix' | 'mmd'; text: string; type: 'section_header' | 'title' }>;
  pageNumber: number;
}

const cleanHeading = (value: string): string => value.replace(/\s+/g, ' ').replace(/^#+\s*/, '').trim();

function isUppercaseCaption (value: string): boolean {
  const cleaned = cleanHeading(value);

  if (!cleaned || cleaned.length > 140 || cleaned.split(/\s+/).length > 16 || /^(?:!\[|[-*_`>|]|\\)/.test(cleaned)) {
    return false;
  }

  const letters = [...cleaned].filter((character) => character.toLocaleLowerCase() !== character.toLocaleUpperCase());

  return letters.length >= 3 && letters.every((character) => character === character.toLocaleUpperCase());
}

export function extractMmdHeadings (mmd: string): ChapterPageEvidence['headings'] {
  const result: ChapterPageEvidence['headings'] = [];
  const seen = new Set<string>();
  const add = (text: string, type: 'section_header' | 'title', signal?: 'section-sign' | 'uppercase-caption'): void => {
    const cleaned = cleanHeading(text);
    const key = `${type}:${cleaned.toLocaleLowerCase()}`;

    if (cleaned && !seen.has(key)) {
      seen.add(key);
      result.push({ ...(signal === undefined ? {} : { signal }), source: 'mmd', text: cleaned, type });
    }
  };

  let sectionSignPending = false;

  for (const line of mmd.split(/\r?\n/)) {
    const trimmed = line.trim();

    if (/^§+\s*$/.test(trimmed)) {
      sectionSignPending = true;
      continue;
    }

    const sectionSign = /^§+\s*(.+?)\s*$/.exec(trimmed);

    if (sectionSign) {
      add(sectionSign[1], 'section_header', 'section-sign');
      sectionSignPending = false;
      continue;
    }

    const markdown = /^(#{1,3})\s+(.+?)\s*$/.exec(line);

    if (markdown) {
      add(markdown[2], markdown[1].length === 1 ? 'title' : 'section_header');
      sectionSignPending = false;
      continue;
    }

    const latex = /^\\(chapter|section|subsection)\*?\{(.+?)\}\s*$/.exec(trimmed);

    if (latex) {
      add(latex[2], latex[1] === 'chapter' ? 'title' : 'section_header');
      sectionSignPending = false;
      continue;
    }

    if (sectionSignPending && trimmed) {
      add(trimmed, 'section_header', 'section-sign');
      sectionSignPending = false;
      continue;
    }

    if (isUppercaseCaption(trimmed)) {
      add(trimmed, 'section_header', 'uppercase-caption');
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

  (page.mathpixHeadings ?? []).forEach(({ confidence, line, text, type }) => add({ ...(confidence === undefined ? {} : { confidence }), ...(line === undefined ? {} : { line }), source: 'mathpix', text, type }));
  extractMmdHeadings(page.pageMMD ?? '').forEach(add);

  const excerpt = (page.pageMMD ?? '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 650);

  return { excerpt, headings, pageNumber: page.pageNumber };
}

interface NumberedChapterCandidate extends ChapterBoundaryProposal {
  chapterNumber: number;
}

const FRONT_MATTER_HEADING = /^(?:acknowledg(?:e)?ments?|appendix|bibliography|contents?|copyright|dedication|foreword|glossary|index|preface|references?)$/i;
const GENERIC_SECTION_HEADING = /^(?:activities|examples?|exercises?|lesson|practice|problems?|review|solutions?|summary|test|warm[ -]?up)$/i;
const ROMAN_VALUE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

function romanToNumber (value: string): number | undefined {
  const roman = value.toUpperCase();

  if (!/^[IVXLCDM]+$/.test(roman)) {
    return undefined;
  }

  let total = 0;

  for (let index = 0; index < roman.length; index++) {
    const current = ROMAN_VALUE[roman[index]] ?? 0;
    const next = ROMAN_VALUE[roman[index + 1]] ?? 0;

    total += current < next ? -current : current;
  }

  return total > 0 ? total : undefined;
}

function parsePositiveIntegerOrRoman (value: string): number | undefined {
  const normalized = value.trim();

  if (/^\d{1,3}$/.test(normalized)) {
    const result = Number(normalized);

    return result > 0 ? result : undefined;
  }

  return romanToNumber(normalized);
}

function chapterNumberFromHeading (text: string): number | undefined {
  const match = /^(?:chapter|chap\.?)(?:\s+|\s*[:.-]\s*)(\d{1,3}|[IVXLCDM]+)\b/i.exec(cleanHeading(text));

  return match ? parsePositiveIntegerOrRoman(match[1]) : undefined;
}

function sectionChapterNumber (text: string): number | undefined {
  const match = /^(\d{1,3})\s*\.\s*\d+\b/.exec(cleanHeading(text));

  if (!match) {
    return undefined;
  }

  const result = Number(match[1]);

  return result > 0 ? result : undefined;
}

function isBareChapterMarker (text: string): boolean {
  return /^(?:chapter|chap\.?)$/i.test(cleanHeading(text));
}

function isBareNumber (text: string): boolean {
  return parsePositiveIntegerOrRoman(cleanHeading(text)) !== undefined;
}

function isPlausibleChapterTitle (text: string): boolean {
  const cleaned = cleanHeading(text);

  return Boolean(cleaned) && !FRONT_MATTER_HEADING.test(cleaned) && !GENERIC_SECTION_HEADING.test(cleaned) && !isBareChapterMarker(cleaned) && !isBareNumber(cleaned) && chapterNumberFromHeading(cleaned) === undefined && sectionChapterNumber(cleaned) === undefined;
}

function orderedHeadings (page: ChapterPageEvidence): ChapterPageEvidence['headings'] {
  return [...page.headings].sort((a, b) => {
    if (a.source !== b.source) {
      return a.source === 'mathpix' ? -1 : 1;
    }

    return (a.line ?? Number.MAX_SAFE_INTEGER) - (b.line ?? Number.MAX_SAFE_INTEGER);
  });
}

function titleOnPage (page: ChapterPageEvidence, beforeText?: string): string | undefined {
  const headings = orderedHeadings(page);
  const beforeIndex = beforeText === undefined ? headings.length : headings.findIndex(({ text }) => cleanHeading(text) === cleanHeading(beforeText));
  const candidates = headings.slice(0, beforeIndex < 0 ? headings.length : beforeIndex).filter(({ text }) => isPlausibleChapterTitle(text));

  return candidates.at(-1)?.text;
}

function titleNearSectionStart (pages: ChapterPageEvidence[], pageIndex: number, sectionText: string): { pageNumber: number; title?: string } {
  const samePageTitle = titleOnPage(pages[pageIndex], sectionText);

  if (samePageTitle) {
    return { pageNumber: pages[pageIndex].pageNumber, title: samePageTitle };
  }

  // Mathpix often labels the chapter title on the page immediately before
  // the first numbered subsection (for example title page -> "2.1 ...").
  for (let index = pageIndex - 1; index >= Math.max(0, pageIndex - 2); index--) {
    const page = pages[index];

    if (page.headings.some(({ text }) => sectionChapterNumber(text) !== undefined || chapterNumberFromHeading(text) !== undefined)) {
      break;
    }

    const title = titleOnPage(page);

    if (title) {
      return { pageNumber: page.pageNumber, title };
    }
  }

  return { pageNumber: pages[pageIndex].pageNumber };
}

function explicitChapterCandidate (page: ChapterPageEvidence): NumberedChapterCandidate | undefined {
  const headings = orderedHeadings(page);

  for (let index = 0; index < headings.length; index++) {
    const heading = headings[index];
    const directNumber = chapterNumberFromHeading(heading.text);

    if (directNumber !== undefined) {
      const embeddedTitle = cleanHeading(heading.text).replace(/^(?:chapter|chap\.?)\s*(?:\d{1,3}|[IVXLCDM]+)\s*[:.\-–—]?\s*/i, '').trim();
      const followingTitle = headings.slice(index + 1).find(({ text }) => isPlausibleChapterTitle(text))?.text;
      const title = embeddedTitle || followingTitle;

      return {
        chapterNumber: directNumber,
        confidence: 0.995,
        startPage: page.pageNumber,
        title: title ? `Chapter ${directNumber}: ${title}` : `Chapter ${directNumber}`
      };
    }

    if (isBareChapterMarker(heading.text)) {
      const numberHeading = headings.slice(index + 1, index + 3).find(({ text }) => isBareNumber(text));
      const number = numberHeading ? parsePositiveIntegerOrRoman(numberHeading.text) : undefined;

      if (number !== undefined) {
        const numberIndex = headings.indexOf(numberHeading!);
        const followingTitle = headings.slice(numberIndex + 1).find(({ text }) => isPlausibleChapterTitle(text))?.text;

        return {
          chapterNumber: number,
          confidence: 0.995,
          startPage: page.pageNumber,
          title: followingTitle ? `Chapter ${number}: ${followingTitle}` : `Chapter ${number}`
        };
      }
    }
  }

  return undefined;
}

/**
 * Derives deterministic chapter candidates from numbering and nearby headings.
 * These candidates are intentionally conservative: they anchor explicit chapter
 * markers and first N.x sections, then fill a skipped chapter number only when
 * there is a strong standalone heading between two numbered anchors.
 */
export function deriveStructuralChapterCandidates (evidence: ChapterPageEvidence[]): ChapterBoundaryProposal[] {
  const pages = [...evidence].sort((a, b) => a.pageNumber - b.pageNumber);
  const numbered = new Map<number, NumberedChapterCandidate>();

  pages.forEach((page) => {
    const explicit = explicitChapterCandidate(page);

    if (explicit) {
      numbered.set(explicit.chapterNumber, explicit);
    }
  });

  pages.forEach((page, pageIndex) => {
    for (const heading of orderedHeadings(page)) {
      const chapterNumber = sectionChapterNumber(heading.text);

      if (chapterNumber === undefined || numbered.has(chapterNumber)) {
        continue;
      }

      const start = titleNearSectionStart(pages, pageIndex, heading.text);

      numbered.set(chapterNumber, {
        chapterNumber,
        confidence: start.title ? 0.97 : 0.91,
        startPage: start.pageNumber,
        title: start.title ?? `Chapter ${chapterNumber}`
      });
      break;
    }
  });

  const anchors = [...numbered.values()].sort((a, b) => a.chapterNumber - b.chapterNumber || a.startPage - b.startPage);

  for (let anchorIndex = 0; anchorIndex < anchors.length - 1; anchorIndex++) {
    const left = anchors[anchorIndex];
    const right = anchors[anchorIndex + 1];
    const missingCount = right.chapterNumber - left.chapterNumber - 1;

    if (missingCount !== 1 || right.startPage <= left.startPage + 1) {
      continue;
    }

    const missingNumber = left.chapterNumber + 1;
    const candidates = pages.flatMap((page) => {
      if (page.pageNumber <= left.startPage || page.pageNumber >= right.startPage) {
        return [];
      }

      const structuralNumbers = page.headings.flatMap(({ text }) => {
        const section = sectionChapterNumber(text);
        const chapter = chapterNumberFromHeading(text);

        return [...(section === undefined ? [] : [section]), ...(chapter === undefined ? [] : [chapter])];
      });

      if (structuralNumbers.some((number) => number !== missingNumber)) {
        return [];
      }

      const title = titleOnPage(page);

      return title ? [{ pageNumber: page.pageNumber, title }] : [];
    });

    // Requiring a single unambiguous standalone heading keeps this fallback
    // from turning ordinary subsections into chapters.
    if (candidates.length === 1) {
      const candidate = candidates[0];

      numbered.set(missingNumber, {
        chapterNumber: missingNumber,
        confidence: 0.94,
        startPage: candidate.pageNumber,
        title: candidate.title
      });
    }
  }

  return [...numbered.values()]
    .sort((a, b) => a.startPage - b.startPage || a.chapterNumber - b.chapterNumber)
    .map(({ chapterNumber: _chapterNumber, ...candidate }) => candidate);
}

/**
 * Keeps strong deterministic anchors even if an LLM reconciliation drops one.
 * At the same page the higher-confidence/better-titled proposal wins.
 */
export function stabilizeChapterBoundaries (model: ChapterBoundaryProposal[], structural: ChapterBoundaryProposal[], totalPages: number): ChapterBoundaryProposal[] {
  const combined = [...model];

  structural.filter(({ confidence }) => confidence >= 0.94).forEach((candidate) => {
    const nearbyIndex = combined.findIndex(({ startPage }) => Math.abs(startPage - candidate.startPage) <= 1);

    if (nearbyIndex === -1) {
      combined.push(candidate);
      return;
    }

    const nearby = combined[nearbyIndex];

    if ((nearby.startPage === candidate.startPage && candidate.confidence > nearby.confidence) || (nearby.startPage !== candidate.startPage && candidate.confidence >= 0.97)) {
      combined[nearbyIndex] = candidate;
    }
  });

  return parseChapterBoundaries(JSON.stringify({ chapters: combined }), totalPages);
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
  return `Identify only TOP-LEVEL chapter boundaries in this consecutive run of book pages. Mathpix structural labels are supplied when available: title is strong evidence for a major heading; section_header may be a chapter or a subsection and must NOT create a boundary unless the surrounding numbering/text clearly shows that it is top-level. MMD headings tagged signal=section-sign come from a "§" marker, and signal=uppercase-caption comes from a standalone all-uppercase caption. Treat either signal as a useful clue to the chapter NAME when it appears in chapter-level context, but not as sufficient evidence by itself to create a boundary. IMPORTANT numbering rule: a first section such as "3.1 ..." is strong evidence that chapter 3 has begun on that page or on a nearby immediately preceding title page. Track the major number across pages (1.x, 2.x, 3.x, ...); do not silently skip a chapter when numbering advances. A split heading such as "CHAPTER" + "3" + "One-Variable Linear Equations" on one page is a single chapter heading. If numbered anchors jump from chapter 3 to chapter 5, inspect the pages between them for a standalone major heading that plausibly starts chapter 4. Ignore table-of-contents listings, running headers, footers, exercise headings, examples, lessons, subsections and repeated chapter names in body text. A chapter continues until there is strong evidence for another top-level chapter. Return only boundaries that START inside the supplied page range. Keep titles in the book's original language. confidence must be 0..1. Return JSON only: {"chapters":[{"startPage":12,"title":"Chapter 2: Fractions","confidence":0.94}]}.

Pages:
${evidence.map(({ excerpt, headings, pageNumber }) => `--- page ${pageNumber} ---\nMathpix/MMD headings: ${headings.length ? headings.map(({ confidence, signal, source, text, type }) => `[${source}:${type}${signal === undefined ? '' : ` signal=${signal}`}${confidence === undefined ? '' : ` confidence=${confidence.toFixed(2)}`}] ${text}`).join(' | ') : '(none)'}\nOpening text: ${excerpt || '(no text)'}`).join('\n\n')}`;
}

export function chapterReconciliationPrompt (proposals: ChapterBoundaryProposal[], evidence: ChapterPageEvidence[], totalPages: number, structural: ChapterBoundaryProposal[] = []): string {
  const relevantPages = new Set<number>();

  [...proposals, ...structural].forEach(({ startPage }) => {
    for (let page = Math.max(1, startPage - 1); page <= Math.min(totalPages, startPage + 1); page++) {
      relevantPages.add(page);
    }
  });
  evidence.filter(({ headings }) => headings.some(({ type }) => type === 'title')).forEach(({ pageNumber }) => relevantPages.add(pageNumber));
  const context = evidence.filter(({ pageNumber }) => relevantPages.has(pageNumber));

  return `Reconcile candidate chapter boundaries for one ${totalPages}-page book into a single stable chapter segmentation. Return TOP-LEVEL chapters only. Remove duplicate/overlapping candidates from window overlap. Do not promote sections, subsections, lessons, exercises, examples, running headers, or table-of-contents rows to chapters. Mathpix title labels are strong structural evidence, while section_header labels require chapter-level context. MMD signal=section-sign (from "§") and signal=uppercase-caption are useful clues for choosing the chapter NAME when supported by chapter-level context; neither signal alone proves a new chapter boundary. Use section-number continuity as a cross-check: first sections like 1.1, 2.1, 3.1 strongly anchor their corresponding chapters, even when the chapter title is on the preceding page. Split headings such as "CHAPTER" + number + title are one chapter heading. Do not drop a structurally anchored chapter merely because one window missed it. If chapter numbers jump (for example 3 -> 5), inspect intervening standalone major headings for the missing chapter. Deterministic structural candidates below are conservative and should be preserved unless the supplied page evidence directly contradicts them. Preserve the best original-language chapter title. The result must be sorted by startPage and each startPage must be unique and between 1 and ${totalPages}. It is valid for the first real chapter to start after page 1; do not invent an Introduction chapter. Return JSON only: {"chapters":[{"startPage":12,"title":"Chapter 2: Fractions","confidence":0.96}]}.

Candidate boundaries:
${JSON.stringify(proposals)}

Deterministic structural candidates:
${JSON.stringify(structural)}

Structural context near candidates:
${context.map(({ excerpt, headings, pageNumber }) => `--- page ${pageNumber} ---\nHeadings: ${headings.map(({ confidence, signal, source, text, type }) => `[${source}:${type}${signal === undefined ? '' : ` signal=${signal}`}${confidence === undefined ? '' : ` confidence=${confidence.toFixed(2)}`}] ${text}`).join(' | ') || '(none)'}\nOpening: ${excerpt || '(no text)'}`).join('\n\n')}`;
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
